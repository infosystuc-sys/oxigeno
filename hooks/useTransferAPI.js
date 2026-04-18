/**
 * useTransferAPI.js
 * Si VITE_API_URL no está definido o está vacío, fetch usa rutas /api en el mismo origen
 * y Vite las proxifica a http://localhost:3012 (vite.config.js).
 */

const rawBase = import.meta.env.VITE_API_URL;
const API_BASE =
  typeof rawBase === 'string' && rawBase.trim() !== '' ? rawBase.trim().replace(/\/$/, '') : '';

/** Valores: CLIENTE | CLIENTE_FINANCIERO | FINANCIERA */
export function normalizeTipoOrigenTransfer(v) {
  const u = String(v ?? 'CLIENTE').trim().toUpperCase();
  if (u === 'CLIENTE_FINANCIERO') return 'CLIENTE_FINANCIERO';
  if (u === 'FINANCIERA') return 'FINANCIERA';
  return 'CLIENTE';
}

export function truncateField(value, maxLength) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  if (str.length > maxLength) {
    console.warn(
      `[transfer] Campo truncado de ${str.length} a ${maxLength} caracteres:`,
      str.length > 120 ? `${str.slice(0, 120)}…` : str
    );
    return str.slice(0, maxLength);
  }
  return str;
}

/**
 * Ajusta límites de columnas y duplica PascalCase ↔ snake_case para la API.
 */
export function sanitizeTransferWritePayload(p) {
  if (!p || typeof p !== 'object') return p;
  const ctaOP = truncateField(p.CtaOrigen ?? p.cta_origen, 200);
  const ctaDP = truncateField(p.CtaDestino ?? p.cta_destino, 200);
  const destinoId = p.destino_id;
  const cuentaId = p.cuenta_tercera_id;
  const terceroProvId = p.tercero_proveedor_id;
  return {
    CodigoTransferencia: truncateField(p.CodigoTransferencia, 100),
    PersonaAsignada: truncateField(p.PersonaAsignada, 100),
    Cliente: truncateField(p.Cliente, 200),
    COD_CLIENT: truncateField(p.COD_CLIENT, 50),
    TIPO_ORIGEN: normalizeTipoOrigenTransfer(p.TIPO_ORIGEN ?? p.tipoOrigen ?? 'CLIENTE'),
    Destino: truncateField(p.Destino, 200),
    Usuario: truncateField(p.Usuario, 100),
    TipoTransaccion: truncateField(p.TipoTransaccion, 100) || 'Transferencia',
    Monto: p.Monto,
    Estado: truncateField(p.Estado, 50) || 'Disponible',
    FECHA: p.FECHA,
    FechaComprobante: p.FechaComprobante,
    FechaEnvio: null,
    FechaRegistro: p.FechaRegistro,
    IDTransferencia: truncateField(p.IDTransferencia ?? p.id_transferencia, 100),
    CUITOrigen: truncateField(p.CUITOrigen ?? p.cuit_origen, 20),
    CtaOrigen: ctaOP,
    CBUOrigen: truncateField(p.CBUOrigen ?? p.cbu_origen, 22),
    CUITDestino: truncateField(p.CUITDestino ?? p.cuit_destino, 20),
    CtaDestino: ctaDP,
    CBUDestino: truncateField(p.CBUDestino ?? p.cbu_destino, 22),
    Banco: truncateField(p.Banco ?? p.banco, 50),
    Concepto: truncateField(p.Concepto ?? p.concepto, 100),
    destino_id:
      destinoId === undefined || destinoId === null || destinoId === ''
        ? null
        : (() => {
            const n = parseInt(destinoId, 10);
            return Number.isNaN(n) ? null : n;
          })(),
    destino_tipo: truncateField(p.destino_tipo, 20),
    cuenta_tercera_id:
      cuentaId === undefined || cuentaId === null || cuentaId === ''
        ? null
        : (() => {
            const n = parseInt(cuentaId, 10);
            return Number.isNaN(n) ? null : n;
          })(),
    tercero_proveedor_id:
      terceroProvId === undefined || terceroProvId === null || terceroProvId === ''
        ? null
        : (() => {
            const n = parseInt(terceroProvId, 10);
            return Number.isNaN(n) ? null : n;
          })(),
    cuit_origen: truncateField(p.cuit_origen ?? p.CUITOrigen, 13),
    cta_origen: truncateField(p.cta_origen ?? p.CtaOrigen, 50),
    cbu_origen: truncateField(p.cbu_origen ?? p.CBUOrigen, 22),
    cuit_destino: truncateField(p.cuit_destino ?? p.CUITDestino, 13),
    cta_destino: truncateField(p.cta_destino ?? p.CtaDestino, 50),
    cbu_destino: truncateField(p.cbu_destino ?? p.CBUDestino, 22),
    operacion: truncateField(p.operacion, 30),
    Id_transferencia: truncateField(
      p.Id_transferencia ?? p.id_transferencia ?? p.IDTransferencia,
      30
    ),
  };
}

const apiFetch = async (path, options = {}) => {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
  return data;
};

/** Convierte el formulario de Detail (camelCase) al cuerpo que espera la API */
export const formDataToApiPayload = (f) =>
  sanitizeTransferWritePayload({
    CodigoTransferencia: f.codigoTransferencia ?? f.CodigoTransferencia,
    PersonaAsignada: f.personaAsignada ?? f.PersonaAsignada ?? null,
    Cliente:
      f.clienteRazonSocial ??
      f.cliente_razon_social ??
      f.cliente ??
      f.Cliente ??
      null,
    Destino: f.destino ?? f.Destino ?? null,
    Usuario: f.usuario ?? f.Usuario ?? null,
    TipoTransaccion: f.tipoTransaccion ?? f.TipoTransaccion ?? 'Transferencia',
    Monto: f.monto ?? f.Monto,
    Estado: f.estado ?? f.Estado ?? 'Disponible',
    FECHA: f.fecha ?? f.FECHA,
    FechaComprobante: f.fechaComprobante ?? f.FechaComprobante,
    FechaRegistro: f.fechaRegistro ?? f.FechaRegistro ?? null,
    IDTransferencia: f.idTransferencia ?? f.IDTransferencia ?? null,
    CUITOrigen: f.cuitOrigen ?? f.CUITOrigen ?? null,
    CtaOrigen: f.ctaOrigen ?? f.CtaOrigen ?? null,
    CBUOrigen: f.cbuOrigen ?? f.CBUOrigen ?? null,
    CUITDestino: f.cuitDestino ?? f.CUITDestino ?? null,
    CtaDestino: f.ctaDestino ?? f.CtaDestino ?? null,
    CBUDestino: f.cbuDestino ?? f.CBUDestino ?? null,
    Banco: f.banco ?? f.Banco ?? null,
    Concepto: f.concepto ?? f.Concepto ?? null,
    destino_id: f.destinoId ?? f.destino_id,
    destino_tipo:
      f.cuentaProveedorTipo ??
      f.destino_tipo_asignacion ??
      f.destino_tipo ??
      null,
    cuenta_tercera_id: f.cuentaTerceraId ?? f.cuenta_tercera_id,
    tercero_proveedor_id: f.terceroProveedorId ?? f.tercero_proveedor_id ?? null,
    COD_CLIENT: f.codClient ?? f.COD_CLIENT,
    TIPO_ORIGEN: f.tipoOrigen ?? f.tipo_origen ?? f.TIPO_ORIGEN ?? 'CLIENTE',
    operacion: f.operacion ?? null,
    Id_transferencia: f.Id_transferencia ?? f.idTransferencia ?? null,
  });

export const checkDuplicate = (codigoTransferencia, excludeId = null) =>
  apiFetch('/api/check-duplicate', {
    method: 'POST',
    body: JSON.stringify({ codigoTransferencia, excludeId }),
  });

export const insertTransfer = (formData) =>
  apiFetch('/api/insert-transfer', {
    method: 'POST',
    body: JSON.stringify(formData),
  });

export const updateTransfer = (id, formData) =>
  apiFetch(`/api/transfers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(formData),
  });

export const deleteTransfer = (id) =>
  apiFetch(`/api/transfers/${id}`, { method: 'DELETE' });

export const getTransferById = (id) => apiFetch(`/api/transfers/${id}`);

export const searchClient = (query, limit = 10) =>
  apiFetch(`/api/search-client?q=${encodeURIComponent(query)}&limit=${limit}`);

export const getTransfers = () => apiFetch('/api/transfers');

/** @param {Record<string, string|number|undefined>} [params] tipo, activo, buscar, page, pageSize, sortField, sortDir */
export const getDestinos = (params = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return apiFetch(`/api/destinos${s ? `?${s}` : ''}`);
};

export const getPersonasAsignadas = () => apiFetch('/api/personas-asignadas');

export const postPersonaAsignada = (descripcion) =>
  apiFetch('/api/personas-asignadas', { method: 'POST', body: JSON.stringify({ descripcion }) });

export const putPersonaAsignada = (id, descripcion) =>
  apiFetch(`/api/personas-asignadas/${id}`, { method: 'PUT', body: JSON.stringify({ descripcion }) });

export const deletePersonaAsignada = (id) =>
  apiFetch(`/api/personas-asignadas/${id}`, { method: 'DELETE' });

export default {
  checkDuplicate,
  insertTransfer,
  updateTransfer,
  deleteTransfer,
  getTransferById,
  searchClient,
  getTransfers,
  getDestinos,
  getPersonasAsignadas,
  postPersonaAsignada,
  putPersonaAsignada,
  deletePersonaAsignada,
  formDataToApiPayload,
  sanitizeTransferWritePayload,
  truncateField,
};
