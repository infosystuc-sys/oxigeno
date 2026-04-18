/**
 * useOCRExtraction.js
 * Extracción de datos del comprobante: Gemini Vision o Anthropic (Claude) Vision.
 * Mock si no hay API key del proveedor elegido.
 */

import { useState, useCallback } from 'react';

/** @typedef {'RATE_LIMIT'|'API_ERROR'|'NETWORK_ERROR'|'UNKNOWN'} ExtractionErrorType */

export const EXTRACTION_ERRORS = {
  RATE_LIMIT: 'RATE_LIMIT',
  API_ERROR: 'API_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Intenta recuperar campos sueltos del texto del modelo si el JSON está truncado o mal formado.
 * @returns {Record<string, unknown>|null}
 */
function tryExtractPartialFields(text) {
  if (!text || typeof text !== 'string') return null;
  const out = {};
  const q = (re) => {
    const m = text.match(re);
    return m && m[1] != null ? String(m[1]).trim() : null;
  };
  const cod = q(/"codigo_transferencia"\s*:\s*"([^"]*)"/i);
  if (cod) out.codigo_transferencia = cod;
  const idTr = q(/"id_transferencia"\s*:\s*"([^"]*)"/i);
  if (idTr) out.id_transferencia = idTr;
  const montoM = text.match(/"monto"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (montoM) out.monto = parseFloat(montoM[1], 10);
  const fc = q(/"fecha_comprobante"\s*:\s*"([^"]*)"/i);
  if (fc) out.fecha_comprobante = fc;
  const pa = q(/"persona_asignada"\s*:\s*"([^"]*)"/i);
  if (pa) out.persona_asignada = pa;
  const cuitO = q(/"cuit_origen"\s*:\s*"([^"]*)"/i);
  if (cuitO) out.cuit_origen = cuitO;
  const cuitD = q(/"cuit_destino"\s*:\s*"([^"]*)"/i);
  if (cuitD) out.cuit_destino = cuitD;
  const cbuO = q(/"cbu_origen"\s*:\s*"([^"]*)"/i);
  if (cbuO) out.cbu_origen = cbuO.replace(/\D/g, '');
  const cbuD = q(/"cbu_destino"\s*:\s*"([^"]*)"/i);
  if (cbuD) out.cbu_destino = cbuD.replace(/\D/g, '');
  const ctaD = q(/"cta_destino"\s*:\s*"([^"]*)"/i);
  if (ctaD) out.cta_destino = ctaD;
  const banco = q(/"banco"\s*:\s*"([^"]*)"/i);
  if (banco) out.banco = banco;
  const concepto = q(/"concepto"\s*:\s*"([^"]*)"/i);
  if (concepto) out.concepto = concepto;
  const tipo = q(/"tipo_transaccion"\s*:\s*"([^"]*)"/i);
  if (tipo) out.tipo_transaccion = tipo;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {unknown} error
 * @returns {{ type: ExtractionErrorType, message: string, retryable: boolean }}
 */
export function classifyError(error) {
  const msg = String(error?.message ?? error ?? '').toLowerCase();
  const status = error?.status ?? error?.statusCode;

  if (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource exhausted') ||
    msg.includes('too many requests')
  ) {
    return {
      type: EXTRACTION_ERRORS.RATE_LIMIT,
      message:
        'El servicio de extracción está temporalmente saturado. Podés reintentar o cargar los datos manualmente.',
      retryable: true,
    };
  }

  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout')
  ) {
    return {
      type: EXTRACTION_ERRORS.NETWORK_ERROR,
      message: 'Error de conexión. Verificá tu conexión a internet.',
      retryable: true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api key') ||
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('permission denied') ||
    msg.includes('invalid api')
  ) {
    return {
      type: EXTRACTION_ERRORS.API_ERROR,
      message: 'Error de autenticación con el servicio. Contactá al administrador.',
      retryable: false,
    };
  }

  if (error?.noKeys) {
    return {
      type: EXTRACTION_ERRORS.UNKNOWN,
      message: error.message || 'No hay API keys configuradas. Usá carga manual.',
      retryable: false,
    };
  }

  if (
    error?.parseError &&
    error?.partialData &&
    typeof error.partialData === 'object' &&
    Object.keys(error.partialData).length > 0
  ) {
    return {
      type: EXTRACTION_ERRORS.UNKNOWN,
      message:
        'La respuesta del modelo está incompleta o truncada. Podés reintentar o cargar manualmente; algunos campos podrían haberse recuperado.',
      retryable: true,
    };
  }

  return {
    type: EXTRACTION_ERRORS.UNKNOWN,
    message: error?.message || 'Error desconocido al procesar el comprobante.',
    retryable: false,
  };
}

const EXTRACTION_PROMPT = `Eres un sistema experto en análisis de comprobantes de transferencias bancarias argentinas.
Analizá el comprobante adjunto con atención al detalle.

Un comprobante de transferencia tiene DOS partes claramente diferenciadas:
- QUIEN ENVÍA (Remitente): es la persona o empresa que origina la transferencia.
  Puede aparecer como "Envía", "Remitente", "De", "Ordenante", o ser el titular
  de la cuenta desde donde sale el dinero.
- QUIEN RECIBE (Destinatario): es la persona o empresa que recibe el dinero.
  Puede aparecer como "Recibe", "Destinatario", "Para", "A", "Beneficiario",
  o ser el titular de la cuenta donde ingresa el dinero.

NO confundas remitente con destinatario. Son siempre personas o entidades distintas.

Devolvé ÚNICAMENTE un JSON válido con la siguiente estructura,
sin texto adicional, sin markdown, sin bloques de código:

{
  "codigo_transferencia": "número de operación o nro de comprobante",
  "id_transferencia": "ID interno (ej: CoelsaID, ID Bancario). null si no figura",
  "monto": 0.00,
  "concepto": "concepto o motivo si figura, null si no figura",
  "fecha_comprobante": "YYYY-MM-DD",

  "persona_asignada": "nombre completo del REMITENTE (quien ENVÍA el dinero)",
  "cuit_origen": "CUIT o CUIL del REMITENTE formato XX-XXXXXXXX-X, null si no figura",
  "cta_origen": "nombre de la cuenta o billetera del REMITENTE (ej: Personal Pay)",
  "cbu_origen": "CBU o CVU de 22 dígitos del REMITENTE sin espacios, null si no figura",
  "banco": "nombre del banco o billetera de donde SALE el dinero",

  "cta_destino": "nombre o razón social de quien RECIBE, null si no figura",
  "cuit_destino": "CUIT o CUIL del DESTINATARIO formato XX-XXXXXXXX-X, null si no figura",
  "cbu_destino": "CBU o CVU de 22 dígitos del DESTINATARIO sin espacios, null si no figura",

  "tipo_transaccion": "Transferencia | Pago | Otro",
  "confianza": 0,
  "observaciones": "alertas, inconsistencias o campos ilegibles detectados"
}

Reglas estrictas:
- Si un campo no figura en el comprobante: usar null. Nunca inventar datos.
- monto: número sin símbolos ni puntos de miles, con punto decimal (ej: 110000.00)
- fecha_comprobante: siempre formato YYYY-MM-DD
- cbu_origen y cbu_destino: solo dígitos, sin espacios ni guiones, 22 caracteres
- cuit_origen y cuit_destino: formato XX-XXXXXXXX-X
- confianza: número entero entre 0 y 100
- En comprobantes de Mercado Pago, Personal Pay u otras billeteras virtuales,
  el CVU equivale al CBU — extraerlo en el campo cbu correspondiente
- Si la fecha del comprobante es posterior a la fecha de hoy, indicarlo
  en observaciones como: "ALERTA: fecha futura, posible manipulación"
- Si no podés distinguir claramente remitente de destinatario,
  indicarlo en observaciones y asignar los datos con la mejor inferencia posible`;

/** @typedef {'gemini' | 'anthropic'} OcrProvider */

export const GEMINI_MODEL_OPTIONS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

export const ANTHROPIC_MODEL_OPTIONS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
];

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });

const getMockResponse = (file) => ({
  codigo_transferencia: `00006${Math.floor(Math.random() * 9999999)}`,
  id_transferencia:     null,
  monto:                parseFloat((Math.random() * 30000 + 500).toFixed(2)),
  concepto:             null,
  fecha_comprobante:    new Date().toISOString().split('T')[0],
  persona_asignada:     `[Mock] Extraído de: ${file?.name ?? 'desconocido'}`,
  cuit_origen:          null,
  cta_origen:           null,
  cbu_origen:           null,
  banco:                null,
  cta_destino:          'Cta. Cte. — sin datos reales (configurar API key del proveedor elegido)',
  cuit_destino:         null,
  cbu_destino:          null,
  tipo_transaccion:     'Transferencia',
  confianza:            0,
  observaciones:        'Modo Mock — configurar VITE_GEMINI_API_KEY o VITE_ANTHROPIC_API_KEY',
});

const parseModelJson = (rawText) => {
  // 1. Quitar fences de markdown
  let text = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // 2. Intento directo
  try { return JSON.parse(text); } catch (_) { /* continuar */ }

  // 3. Extraer el primer bloque {...} aunque haya texto antes/después
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { /* continuar */ }
  }

  // 4. Nada funcionó — error descriptivo para debug
  const preview = rawText.length > 300 ? rawText.slice(0, 300) + '…' : rawText;
  console.error('[OCR] Texto recibido del modelo:', rawText);
  throw new Error(`Respuesta del modelo no es JSON válido. Vista previa: "${preview}"`);
};

function parseModelJsonWithPartial(rawText) {
  try {
    return parseModelJson(rawText);
  } catch (e) {
    const partial = tryExtractPartialFields(rawText);
    const err = new Error(e.message || 'JSON inválido');
    err.partialData = partial;
    err.parseError = true;
    throw err;
  }
}

const extractWithGemini = async (file, base64, mimeType, model) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;

  const payload = {
    contents: [
      {
        parts: [
          { text: EXTRACTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.1, topP: 0.8, maxOutputTokens: 8192 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const e = new Error(errBody?.error?.message || `Gemini: error HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }

  const result = await res.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini respondió sin texto. Posible bloqueo de contenido.');
  }
  return parseModelJsonWithPartial(rawText);
};

const extractWithAnthropic = async (file, base64, mimeType, model) => {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  if (mimeType === 'application/pdf') {
    throw new Error(
      'Claude (Anthropic) en esta integración solo admite imágenes (JPG, PNG, WebP, GIF). Usá Gemini o convertí el PDF a imagen.'
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Anthropic: error HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }

  const data = await res.json();
  const textBlock = data?.content?.find((b) => b.type === 'text');
  const rawText = textBlock?.text;
  if (!rawText) {
    throw new Error('Anthropic respondió sin texto.');
  }
  return parseModelJsonWithPartial(rawText);
};

/**
 * @param {File} file
 * @param {{ provider: OcrProvider, model: string }} options
 */
const useOCRExtraction = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const [hasPartialData, setHasPartialData] = useState(false);
  const [partialData, setPartialData] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);

  const extractData = async (file, options = {}) => {
    const provider = options.provider || 'gemini';
    const model =
      options.model ||
      (provider === 'gemini'
        ? import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'
        : import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514');

    setIsLoading(true);
    setError(null);
    setErrorType(null);
    setIsRetryable(false);
    setHasPartialData(false);
    setPartialData(null);
    setData(null);
    setUploadedFile(file ?? null);

    try {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      const hasKey =
        provider === 'gemini' ? Boolean(geminiKey) : Boolean(anthropicKey);

      if (!geminiKey && !anthropicKey) {
        const e = new Error('No hay API keys configuradas. Usá carga manual o configurá las variables de entorno.');
        e.noKeys = true;
        throw e;
      }

      if (!hasKey) {
        console.warn(`[OCR] Sin API key para ${provider} — modo MOCK.`);
        await new Promise((r) => setTimeout(r, 1500));
        const mock = getMockResponse(file);
        setData(mock);
        setIsLoading(false);
        return mock;
      }

      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      let parsed;
      if (provider === 'anthropic') {
        parsed = await extractWithAnthropic(file, base64, mimeType, model);
      } else {
        parsed = await extractWithGemini(file, base64, mimeType, model);
      }

      setData(parsed);
      setIsLoading(false);
      return parsed;
    } catch (err) {
      console.error('[OCR] Error:', err);
      const info = classifyError(err);
      setError(info.message);
      setErrorType(info.type);
      setIsRetryable(info.retryable);

      const partial = err?.partialData;
      if (partial && typeof partial === 'object' && Object.keys(partial).length > 0) {
        setHasPartialData(true);
        setPartialData(partial);
      }

      setIsLoading(false);
      throw err;
    }
  };

  const resetExtraction = useCallback(() => {
    setData(null);
    setError(null);
    setErrorType(null);
    setIsRetryable(false);
    setHasPartialData(false);
    setPartialData(null);
  }, []);

  const reset = useCallback(() => {
    resetExtraction();
    setUploadedFile(null);
  }, [resetExtraction]);

  return {
    extractData,
    data,
    extractedData: data,
    isLoading,
    loading: isLoading,
    error,
    errorType,
    isRetryable,
    hasPartialData,
    partialData,
    uploadedFile,
    resetExtraction,
    reset,
  };
};

export default useOCRExtraction;
export { EXTRACTION_PROMPT };
