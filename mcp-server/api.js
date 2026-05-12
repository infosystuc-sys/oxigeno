/**
 * api.js
 * Puente REST entre el frontend React y SQL Server.
 * Puerto por defecto: 3012 (API_PORT en .env). CORS: origen del front en 3011.
 *
 * Endpoints:
 *   POST /api/check-duplicate      → checkDuplicateTransfer
 *   POST /api/insert-transfer      → insertNewTransfer
 *   GET  /api/search-client?q=     → searchClient
 *   GET  /api/transfers            → listar NSFW_Transferencias
 */

import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import dotenv from 'dotenv';
import {
  validarCUIT,
  validarCBU,
  validarTipoDestino,
  validarDestinoUnico,
  normalizarCUITDigits,
  normalizarCBU,
} from './services/destinosValidation.js';
import puppeteer from 'puppeteer';
import {
  templateRecibo,
  templateComprobantePago,
  loadLogoDataUri,
  generarNumeroDocumento,
} from './templates/documentos.js';
import { registrarReciboEnGVA12 } from './services/tangoIntegration.js';

dotenv.config();

const USUARIO_SISTEMA = process.env.API_USUARIO || 'Sistema';

const app = express();
app.use(cors({ origin: 'http://localhost:3011' }));
app.use(express.json());

// ─── CONFIGURACIÓN SQL ────────────────────────────────────────────────────────
const sqlConfig = {
  server: 'Infosys01',
  database: process.env.DB_DATABASE || 'lg_distribuciones',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: 'axsqlserver',
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 30000,
  },
  pool: { max: 10, min: 2, idleTimeoutMillis: 30000 },
};

let pool = null;
const getPool = async () => {
  if (!pool) pool = await sql.connect(sqlConfig);
  return pool;
};

/** HTML → PDF (Puppeteer / Chromium). */
async function renderPdfBuffer(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60_000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
  } finally {
    await browser.close();
  }
}

const SQL_TRANSFER_DOCUMENTO = `
  SELECT TOP 1
    t.id, t.CodigoTransferencia, t.PersonaAsignada, t.Cliente, t.COD_CLIENT, t.TIPO_ORIGEN, t.Destino,
    t.Usuario, t.TipoTransaccion, t.Monto, t.Estado,
    FORMAT(t.FECHA, 'dd/MM/yyyy') AS FECHA,
    FORMAT(t.FechaComprobante, 'dd/MM/yyyy') AS FechaComprobante,
    FORMAT(t.FechaEnvio, 'dd/MM/yyyy') AS FechaEnvio,
    FORMAT(t.FechaRegistro, 'dd/MM/yyyy HH:mm') AS FechaRegistro,
    t.IDTransferencia, t.CUITOrigen, t.CtaOrigen, t.CBUOrigen,
    t.CUITDestino, t.CtaDestino, t.CBUDestino, t.Banco, t.Concepto,
    t.destino_id, t.destino_tipo, t.cuenta_tercera_id, t.tercero_proveedor_id,
    d.destinos, d.razon_social, d.cuit, d.codigo_proveedor_tango,
    d.banco AS destino_banco, d.cbu AS destino_cbu, d.numero_cuenta AS destino_numero_cuenta,
    pt.nombre_tercero, pt.cuit_tercero, pt.banco AS tercero_banco, pt.cbu AS tercero_cbu, pt.numero_cuenta AS tercero_numero_cuenta
  FROM dbo.NSFW_Transferencias t
  LEFT JOIN dbo.NSFW_Destinos d ON d.id = t.destino_id
  LEFT JOIN dbo.NSFW_Proveedores_Terceros pt ON pt.id = t.tercero_proveedor_id
  WHERE t.id = @id
`;

function rowToDestinoInfoDoc(row) {
  if (!row || (row.destino_id == null && !row.destinos && !row.razon_social)) return null;
  return {
    destinos: row.destinos,
    razon_social: row.razon_social,
    cuit: row.cuit,
    codigo_proveedor_tango: row.codigo_proveedor_tango,
    banco: row.destino_banco,
    cbu: row.destino_cbu,
    numero_cuenta: row.destino_numero_cuenta,
  };
}

function rowToTerceroInfoDoc(row) {
  if (!row || row.tercero_proveedor_id == null) return null;
  return {
    nombre_tercero: row.nombre_tercero,
    cuit_tercero: row.cuit_tercero,
    banco: row.tercero_banco,
    cbu: row.tercero_cbu,
    numero_cuenta: row.tercero_numero_cuenta,
  };
}

// ─── Helper: DD/MM/AAAA o YYYY-MM-DD → Date ──────────────────────────────────
const toSqlDate = (str) => {
  if (!str) return null;
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
  }
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m - 1, d);
};

/** Valores permitidos en NSFW_Transferencias.TIPO_ORIGEN */
function normalizeTipoOrigenSql(v) {
  const u = String(v ?? 'CLIENTE').trim().toUpperCase();
  if (u === 'CLIENTE_FINANCIERO') return 'CLIENTE_FINANCIERO';
  if (u === 'FINANCIERA') return 'FINANCIERA';
  return 'CLIENTE';
}

/** destino_tipo en transferencias: solo PROPIA | TERCERO (asignación); valores de catálogo legacy → null. */
function normalizeTransferDestinoTipoAsignacion(raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t === 'PROPIA' || t === 'TERCERO') return t;
  return null;
}

/**
 * Reglas origen ↔ destino y asignación proveedor (Utilizada).
 * @returns {Promise<string|null>} mensaje de error o null si ok
 */
async function assertTransferDestinoReglas(db, s) {
  const origen = String(s.TIPO_ORIGEN || '').trim().toUpperCase();
  let destCat = null;
  if (s.destino_id != null) {
    const r = await db
      .request()
      .input('did', sql.Int, s.destino_id)
      .query(`SELECT tipo FROM dbo.NSFW_Destinos WHERE id = @did`);
    if (!r.recordset.length) return 'El destino de imputación no existe.';
    destCat = String(r.recordset[0].tipo || '').trim().toUpperCase();
    if (destCat === 'FINANCIERO') destCat = 'FINANCIERA';
  }

  if (origen === 'FINANCIERA' || origen === 'CLIENTE_FINANCIERO') {
    if (s.destino_id != null && destCat !== 'PROVEEDOR') {
      return 'Con origen Financiera o Cliente financiero solo puede imputar a destinos tipo Proveedor.';
    }
  }
  // CLIENTE (Comercial): puede imputar a cualquier tipo de destino, incluido PROVEEDOR

  if (destCat !== 'PROVEEDOR' && s.tercero_proveedor_id != null) {
    return 'Solo las transferencias imputadas a proveedor pueden referenciar un tercero de proveedor.';
  }

  const estado = String(s.Estado || '').trim();
  const requiereAsignacionCuentaProveedor =
    (origen === 'FINANCIERA' || origen === 'CLIENTE_FINANCIERO') &&
    estado === 'Utilizada' &&
    destCat === 'PROVEEDOR';

  if (requiereAsignacionCuentaProveedor) {
    const asg = String(s.destino_tipo || '').trim().toUpperCase();
    if (asg !== 'PROPIA' && asg !== 'TERCERO') {
      return 'Para marcar como utilizada contra un proveedor debe indicar si la cuenta destino es propia o de tercero.';
    }
    if (asg === 'TERCERO') {
      const tid = s.tercero_proveedor_id;
      if (tid == null) return 'Debe seleccionar un tercero del proveedor.';
      const chk = await db
        .request()
        .input('tid', sql.Int, tid)
        .input('did', sql.Int, s.destino_id)
        .query(`
          SELECT pt.id, d.acepta_terceros
          FROM dbo.NSFW_Proveedores_Terceros pt
          INNER JOIN dbo.NSFW_Destinos d ON d.id = pt.destino_id
          WHERE pt.id = @tid AND pt.destino_id = @did AND pt.activo = 1
        `);
      if (!chk.recordset.length) return 'El tercero seleccionado no es válido para este proveedor.';
      const acepta = chk.recordset[0].acepta_terceros;
      if (acepta === false || acepta === 0 || acepta === null) {
        return 'Este proveedor no acepta transferencias a terceros.';
      }
    }
  }

  return null;
}

/** Recorta strings para alinear con columnas SQL y evitar truncado en el driver. */
function truncNs(val, max) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Une cuerpo API (PascalCase + snake_case / OCR) a valores para INSERT/UPDATE.
 * Banco: una sola columna `Banco` (en CI `banco` sería la misma).
 */
function buildTransferSqlParams(f) {
  const p = f || {};
  const destinoId = parseInt(p.destino_id, 10);
  const cuentaId = parseInt(p.cuenta_tercera_id, 10);
  const terceroPid = parseInt(p.tercero_proveedor_id, 10);
  const ctaOrigP = truncNs(p.CtaOrigen ?? p.cta_origen, 200);
  const ctaDestP = truncNs(p.CtaDestino ?? p.cta_destino, 200);
  const bancoVal = truncNs(p.Banco ?? p.banco, 50);
  const did = Number.isNaN(destinoId) ? null : destinoId;
  let destinoTipoAsig = normalizeTransferDestinoTipoAsignacion(p.destino_tipo);
  let terceroProveedorId = Number.isNaN(terceroPid) ? null : terceroPid;
  if (did == null) {
    destinoTipoAsig = null;
    terceroProveedorId = null;
  }
  if (destinoTipoAsig !== 'TERCERO') {
    terceroProveedorId = null;
  }
  if (destinoTipoAsig === 'PROPIA') {
    terceroProveedorId = null;
  }
  const estadoNorm = String(truncNs(p.Estado, 50) || 'Disponible').trim();
  if (estadoNorm === 'Disponible') {
    destinoTipoAsig = null;
    terceroProveedorId = null;
  }
  const destinoTipoSql = destinoTipoAsig ? truncNs(destinoTipoAsig, 20) : null;
  return {
    CodigoTransferencia: truncNs(p.CodigoTransferencia, 100),
    PersonaAsignada: truncNs(p.PersonaAsignada, 100),
    Cliente: truncNs(p.Cliente, 200),
    COD_CLIENT: truncNs(p.COD_CLIENT, 50),
    TIPO_ORIGEN: normalizeTipoOrigenSql(p.TIPO_ORIGEN),
    Destino: truncNs(p.Destino, 200),
    Usuario: truncNs(p.Usuario, 100),
    TipoTransaccion: truncNs(p.TipoTransaccion, 100) || 'Transferencia',
    Monto: parseFloat(p.Monto),
    Estado: truncNs(p.Estado, 50) || 'Disponible',
    FECHA: toSqlDate(p.FECHA) ?? new Date(),
    FechaComprobante: toSqlDate(p.FechaComprobante),
    FechaEnvio: toSqlDate(p.FechaEnvio),
    FechaRegistro: toSqlDate(p.FechaRegistro) ?? new Date(),
    IDTransferencia: truncNs(p.IDTransferencia ?? p.id_transferencia, 100),
    CUITOrigen: truncNs(p.CUITOrigen ?? p.cuit_origen, 20),
    CtaOrigen: ctaOrigP,
    CBUOrigen: truncNs(p.CBUOrigen ?? p.cbu_origen, 22),
    CUITDestino: truncNs(p.CUITDestino ?? p.cuit_destino, 20),
    CtaDestino: ctaDestP,
    CBUDestino: truncNs(p.CBUDestino ?? p.cbu_destino, 22),
    Banco: bancoVal,
    Concepto: truncNs(p.Concepto ?? p.concepto, 100),
    destino_id: did,
    destino_tipo: destinoTipoSql,
    cuenta_tercera_id: Number.isNaN(cuentaId) ? null : cuentaId,
    tercero_proveedor_id: terceroProveedorId,
    cuit_origen: truncNs(p.cuit_origen ?? p.CUITOrigen, 13),
    cta_origen: truncNs(p.cta_origen ?? p.CtaOrigen, 50),
    cbu_origen: truncNs(p.cbu_origen ?? p.CBUOrigen, 22),
    cuit_destino: truncNs(p.cuit_destino ?? p.CUITDestino, 13),
    cta_destino: truncNs(p.cta_destino ?? p.CtaDestino, 50),
    cbu_destino: truncNs(p.cbu_destino ?? p.CBUDestino, 22),
    operacion: truncNs(p.operacion, 30),
    Id_transferencia: truncNs(
      p.Id_transferencia ?? p.id_transferencia ?? p.IDTransferencia,
      30
    ),
  };
}

function transferWriteErrorResponse(err) {
  const msg = err?.message || String(err);
  const isTrunc =
    /truncat/i.test(msg) ||
    /string or binary data/i.test(msg) ||
    /8152/i.test(msg);
  return {
    status: 500,
    body: {
      success: false,
      error: isTrunc ? 'Uno o más campos contienen demasiados caracteres' : msg,
    },
    logBody: isTrunc,
  };
}

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

const trimCat20 = (val, fieldLabel) => {
  const t = String(val ?? '').trim();
  if (!t) return { ok: false, error: `${fieldLabel} requerido` };
  if (t.length > 20) return { ok: false, error: `${fieldLabel}: máximo 20 caracteres` };
  return { ok: true, value: t };
};

// ─── POST /api/check-duplicate ────────────────────────────────────────────────
app.post('/api/check-duplicate', async (req, res) => {
  const { codigoTransferencia, excludeId } = req.body;
  if (!codigoTransferencia) return res.status(400).json({ error: 'codigoTransferencia requerido' });

  try {
    const db = await getPool();
    const reqSql = db.request().input('codigo', sql.NVarChar(100), codigoTransferencia);
    if (excludeId != null && excludeId !== '') {
      reqSql.input('excludeId', sql.Int, parseInt(excludeId, 10));
    }
    const result = await reqSql.query(`
        SELECT TOP 1 id, CodigoTransferencia, Cliente, Monto, Estado, FechaComprobante
        FROM dbo.NSFW_Transferencias
        WHERE CodigoTransferencia = @codigo
          ${excludeId != null && excludeId !== '' ? 'AND id <> @excludeId' : ''}
      `);
    const isDuplicate = result.recordset.length > 0;
    res.json({ isDuplicate, existingRecord: isDuplicate ? result.recordset[0] : null });
  } catch (err) {
    console.error('[API] check-duplicate error:', err.message);
    res.status(500).json({ error: err.message, isDuplicate: false });
  }
});

// ─── POST /api/insert-transfer ────────────────────────────────────────────────
// MIGRACIÓN REQUERIDA — ejecutar una vez en SQL Server antes de usar los campos nuevos:
//
//   ALTER TABLE dbo.NSFW_Transferencias ADD
//     IDTransferencia NVARCHAR(100)  NULL,
//     CUITOrigen      NVARCHAR(20)   NULL,
//     CtaOrigen       NVARCHAR(200)  NULL,
//     CBUOrigen       NVARCHAR(22)   NULL,
//     CUITDestino     NVARCHAR(20)   NULL,
//     CtaDestino      NVARCHAR(200)  NULL,
//     CBUDestino      NVARCHAR(22)   NULL,
//     Banco           NVARCHAR(200)  NULL,
//     Concepto        NVARCHAR(500)  NULL;
//     COD_CLIENT      NVARCHAR(50)   NULL,
//     TIPO_ORIGEN     NVARCHAR(20)   NULL DEFAULT 'CLIENTE';
//
app.post('/api/insert-transfer', async (req, res) => {
  const f = req.body;
  if (!f.CodigoTransferencia || !f.Monto) {
    return res.status(400).json({ error: 'CodigoTransferencia y Monto son requeridos' });
  }

  const s = buildTransferSqlParams(f);

  try {
    const db = await getPool();
    const reglaErr = await assertTransferDestinoReglas(db, s);
    if (reglaErr) return res.status(400).json({ error: reglaErr });

    const result = await db
      .request()
      .input('CodigoTransferencia', sql.NVarChar(100), s.CodigoTransferencia)
      .input('PersonaAsignada', sql.NVarChar(100), s.PersonaAsignada)
      .input('Cliente', sql.NVarChar(200), s.Cliente)
      .input('COD_CLIENT', sql.NVarChar(50), s.COD_CLIENT)
      .input('TIPO_ORIGEN', sql.NVarChar(20), s.TIPO_ORIGEN)
      .input('Destino', sql.NVarChar(200), s.Destino)
      .input('Usuario', sql.NVarChar(100), s.Usuario)
      .input('TipoTransaccion', sql.NVarChar(100), s.TipoTransaccion)
      .input('Monto', sql.Decimal(18, 2), s.Monto)
      .input('Estado', sql.NVarChar(50), s.Estado)
      .input('FECHA', sql.Date, s.FECHA)
      .input('FechaComprobante', sql.Date, s.FechaComprobante)
      .input('FechaEnvio', sql.Date, s.FechaEnvio)
      .input('FechaRegistro', sql.Date, s.FechaRegistro)
      .input('IDTransferencia', sql.NVarChar(100), s.IDTransferencia)
      .input('CUITOrigen', sql.NVarChar(20), s.CUITOrigen)
      .input('CtaOrigen', sql.NVarChar(200), s.CtaOrigen)
      .input('CBUOrigen', sql.NVarChar(22), s.CBUOrigen)
      .input('CUITDestino', sql.NVarChar(20), s.CUITDestino)
      .input('CtaDestino', sql.NVarChar(200), s.CtaDestino)
      .input('CBUDestino', sql.NVarChar(22), s.CBUDestino)
      .input('Banco', sql.NVarChar(50), s.Banco)
      .input('Concepto', sql.NVarChar(100), s.Concepto)
      .input('destino_id', sql.Int, s.destino_id)
      .input('destino_tipo', sql.NVarChar(20), s.destino_tipo)
      .input('cuenta_tercera_id', sql.Int, s.cuenta_tercera_id)
      .input('tercero_proveedor_id', sql.Int, s.tercero_proveedor_id)
      .input('cuit_origen', sql.NVarChar(13), s.cuit_origen)
      .input('cta_origen', sql.NVarChar(50), s.cta_origen)
      .input('cbu_origen', sql.NVarChar(22), s.cbu_origen)
      .input('cuit_destino', sql.NVarChar(13), s.cuit_destino)
      .input('cta_destino', sql.NVarChar(50), s.cta_destino)
      .input('cbu_destino', sql.NVarChar(22), s.cbu_destino)
      .input('operacion', sql.NVarChar(30), s.operacion)
      .input('Id_transferencia', sql.NVarChar(30), s.Id_transferencia)
      .query(`
        INSERT INTO dbo.NSFW_Transferencias
          (CodigoTransferencia, PersonaAsignada, Cliente, COD_CLIENT, TIPO_ORIGEN, Destino, Usuario,
           TipoTransaccion, Monto, Estado, FECHA, FechaComprobante, FechaEnvio, FechaRegistro,
           IDTransferencia, CUITOrigen, CtaOrigen, CBUOrigen,
           CUITDestino, CtaDestino, CBUDestino, Banco, Concepto,
           destino_id, destino_tipo, cuenta_tercera_id, tercero_proveedor_id,
           cuit_origen, cta_origen, cbu_origen, cuit_destino, cta_destino, cbu_destino,
           operacion, Id_transferencia)
        OUTPUT INSERTED.id
        VALUES
          (@CodigoTransferencia, @PersonaAsignada, @Cliente, @COD_CLIENT, @TIPO_ORIGEN, @Destino, @Usuario,
           @TipoTransaccion, @Monto, @Estado, @FECHA, @FechaComprobante, @FechaEnvio, @FechaRegistro,
           @IDTransferencia, @CUITOrigen, @CtaOrigen, @CBUOrigen,
           @CUITDestino, @CtaDestino, @CBUDestino, @Banco, @Concepto,
           @destino_id, @destino_tipo, @cuenta_tercera_id, @tercero_proveedor_id,
           @cuit_origen, @cta_origen, @cbu_origen, @cuit_destino, @cta_destino, @cbu_destino,
           @operacion, @Id_transferencia)
      `);

    const insertedId = result.recordset[0]?.id;
    res.json({
      success: true,
      insertedId,
      id: insertedId,
      message: `Transferencia ${s.CodigoTransferencia} registrada con ID ${insertedId}.`,
    });
  } catch (err) {
    console.error('[API] insert-transfer error:', err.message);
    const { status, body, logBody } = transferWriteErrorResponse(err);
    if (logBody) console.error('[API] insert-transfer body (truncado?):', req.body);
    res.status(status).json(body);
  }
});

// ─── GET /api/search-client?q=texto&limit=10 ─────────────────────────────────
app.get('/api/search-client', async (req, res) => {
  const { q = '', limit = 10 } = req.query;
  if (!q) return res.status(400).json({ error: 'Parámetro q requerido' });

  try {
    const db = await getPool();
    const result = await db
      .request()
      .input('query', sql.NVarChar(200), `%${q}%`)
      .input('limit', sql.Int, parseInt(limit))
      .query(`
        SELECT TOP (@limit)
          id AS ClienteID, NombreCliente, CUIT, Email, Telefono
        FROM dbo.Clientes
        WHERE NombreCliente LIKE @query OR CAST(id AS NVARCHAR) = @query
        ORDER BY NombreCliente ASC
      `);
    res.json({ total: result.recordset.length, results: result.recordset });
  } catch (err) {
    console.error('[API] search-client error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

// ─── NSFW_Destinos + CuentasTerceros ───────────────────────────────────────────
const DESTINOS_SORT = {
  id: 'id',
  destinos: 'destinos',
  tipo: 'tipo',
  razon_social: 'razon_social',
  fecha_creacion: 'fecha_creacion',
  fecha_modificacion: 'fecha_modificacion',
};

const optionalTrim = (v, max) => {
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim().slice(0, max);
};

function parseDestinoPayload(body, { defaultsActivo = true } = {}) {
  const destinos = String(body?.destinos ?? '').trim();
  let activo = defaultsActivo;
  if (body?.activo !== undefined && body?.activo !== null) {
    activo = body.activo !== false && body.activo !== 0 && body.activo !== 'false';
  }
  const tipoRaw = body?.tipo ?? body?.Tipo;
  const tipoNorm =
    tipoRaw == null || String(tipoRaw).trim() === ''
      ? null
      : String(tipoRaw).trim().toUpperCase();
  const aceptaTerceros =
    tipoNorm === 'PROVEEDOR'
      ? body?.acepta_terceros === true ||
        body?.acepta_terceros === 1 ||
        body?.acepta_terceros === '1' ||
        body?.acepta_terceros === 'true'
      : false;
  return {
    destinos: destinos.slice(0, 20),
    tipo: tipoNorm,
    acepta_terceros: aceptaTerceros,
    razon_social: optionalTrim(body?.razon_social, 200),
    cuit:
      body?.cuit != null && String(body.cuit).trim() !== ''
        ? normalizarCUITDigits(body.cuit)
        : null,
    codigo_proveedor_tango: optionalTrim(body?.codigo_proveedor_tango, 50),
    banco: optionalTrim(body?.banco, 100),
    tipo_cuenta: optionalTrim(body?.tipo_cuenta, 20),
    numero_cuenta: optionalTrim(body?.numero_cuenta, 50),
    cbu:
      body?.cbu != null && String(body.cbu).trim() !== ''
        ? normalizarCBU(body.cbu)
        : null,
    alias_cbu: optionalTrim(body?.alias_cbu, 50),
    observaciones: optionalTrim(body?.observaciones, 500),
    activo,
  };
}

async function collectErroresValidacionDestino(db, data, idExcluir) {
  const err = [];
  if (!data.destinos) err.push('Nombre corto (destinos) es requerido.');
  if (data.destinos.length > 20) err.push('Nombre corto: máximo 20 caracteres.');
  const tv = validarTipoDestino(data.tipo);
  if (!tv.valido) err.push(tv.error);
  else if (data.tipo !== 'PROVEEDOR' && data.acepta_terceros) {
    err.push('Solo los destinos tipo Proveedor pueden aceptar terceros.');
  }
  const cv = validarCUIT(data.cuit || '');
  if (!cv.valido) err.push(cv.error);
  const bv = validarCBU(data.cbu || '', { obligatorio: false });
  if (!bv.valido) err.push(bv.error);
  if (err.length) return err;
  const uniq = await validarDestinoUnico(db, data.cuit, idExcluir);
  if (!uniq.valido) err.push(uniq.error);
  return err;
}

/** Normaliza filas de dbo.NSFW_Destinos: Tedious/mssql suele devolver PascalCase (Id, Tipo, …). */
function normalizeDestinoPrincipalRow(r) {
  if (!r) return null;
  const pick = (...vals) => {
    for (const v of vals) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      return v;
    }
    return null;
  };
  const idRaw = pick(r.id, r.Id, r.ID);
  const id = idRaw != null && idRaw !== '' ? Number(idRaw) : null;
  const tiposDestinoOk = new Set([
    'PROVEEDOR',
    'FINANCIERA',
    'CLIENTE_FINANCIERO',
    'CTA_PROPIA',
  ]);
  let tipo = String(pick(r.tipo, r.Tipo, r.TIPO) ?? '').trim().toUpperCase();
  if (tipo === 'FINANCIERO') tipo = 'FINANCIERA';
  if (tipo === 'PROVEEDOR_TERCEROS') tipo = 'PROVEEDOR';
  if (!tiposDestinoOk.has(tipo)) tipo = 'PROVEEDOR';

  const strOrNull = (x) => {
    if (x == null) return null;
    const s = String(x).trim();
    return s === '' ? null : s;
  };

  return {
    id,
    destinos: String(pick(r.destinos, r.Destinos) ?? '').trim(),
    tipo,
    razon_social: strOrNull(pick(r.razon_social, r.Razon_Social, r.RazonSocial)),
    cuit: strOrNull(pick(r.cuit, r.CUIT)),
    codigo_proveedor_tango: strOrNull(
      pick(r.codigo_proveedor_tango, r.Codigo_Proveedor_Tango, r.CodigoProveedorTango)
    ),
    banco: strOrNull(pick(r.banco, r.Banco)),
    tipo_cuenta: strOrNull(pick(r.tipo_cuenta, r.Tipo_Cuenta)),
    numero_cuenta: strOrNull(pick(r.numero_cuenta, r.Numero_Cuenta)),
    cbu: (() => {
      const x = pick(r.cbu, r.CBU);
      if (x == null) return null;
      const d = String(x).replace(/\D/g, '').slice(0, 22);
      return d === '' ? null : d;
    })(),
    alias_cbu: strOrNull(pick(r.alias_cbu, r.Alias_CBU, r.AliasCbu)),
    acepta_terceros:
      tipo === 'PROVEEDOR'
        ? Boolean(pick(r.acepta_terceros, r.Acepta_Terceros, r.AceptaTerceros))
        : false,
    activo: Boolean(r.activo ?? r.Activo),
    fecha_creacion: r.fecha_creacion ?? r.Fecha_Creacion ?? null,
    fecha_modificacion: r.fecha_modificacion ?? r.Fecha_Modificacion ?? null,
    usuario_creacion: r.usuario_creacion ?? r.Usuario_Creacion ?? null,
    usuario_modificacion: r.usuario_modificacion ?? r.Usuario_Modificacion ?? null,
    observaciones: strOrNull(pick(r.observaciones, r.Observaciones)),
  };
}

function mapCuentaTerceraRow(r) {
  if (!r) return r;
  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null);
  return {
    id: pick(r.id, r.Id),
    destino_id: pick(r.destino_id, r.Destino_id, r.DestinoId),
    titular: r.titular ?? r.Titular ?? null,
    cuit_titular: r.cuit_titular ?? r.Cuit_Titular ?? r.CUIT_Titular ?? null,
    banco: r.banco ?? r.Banco ?? null,
    tipo_cuenta: r.tipo_cuenta ?? r.Tipo_Cuenta ?? null,
    numero_cuenta: r.numero_cuenta ?? r.Numero_Cuenta ?? null,
    cbu: r.cbu ?? r.CBU ?? null,
    alias_cbu: r.alias_cbu ?? r.Alias_CBU ?? null,
    activo: Boolean(r.activo ?? r.Activo),
    fecha_creacion: r.fecha_creacion ?? r.Fecha_Creacion ?? null,
    usuario_creacion: r.usuario_creacion ?? r.Usuario_Creacion ?? null,
    observaciones: r.observaciones ?? r.Observaciones ?? null,
  };
}

/** Aplica filtros de listado destinos y devuelve cláusula WHERE (usa rq.input). */
function bindDestinosListFilters(rq, { tipo, activoQ, buscar }) {
  let where = 'WHERE 1=1';
  if (
    tipo === 'PROVEEDOR' ||
    tipo === 'FINANCIERA' ||
    tipo === 'CLIENTE_FINANCIERO' ||
    tipo === 'CTA_PROPIA'
  ) {
    rq.input('tipoF', sql.NVarChar(20), tipo);
    where += ' AND tipo = @tipoF';
  }
  if (activoQ === 'true') where += ' AND activo = 1';
  else if (activoQ === 'false') where += ' AND activo = 0';
  if (buscar) {
    const digits = buscar.replace(/\D/g, '');
    rq.input('buscar', sql.NVarChar(200), `%${buscar}%`);
    where += ' AND (destinos LIKE @buscar OR razon_social LIKE @buscar OR codigo_proveedor_tango LIKE @buscar';
    if (digits) {
      rq.input('buscarCuit', sql.NVarChar(22), `%${digits}%`);
      where += ' OR REPLACE(REPLACE(ISNULL(cuit,\'\'),\'-\',\'\'),\' \',\'\') LIKE @buscarCuit';
    }
    where += ')';
  }
  return where;
}

// GET /api/destinos — listado paginado y filtros
app.get('/api/destinos', async (req, res) => {
  try {
    const db = await getPool();
    const tipo = req.query.tipo;
    const activoQ = req.query.activo;
    const buscar = req.query.buscar ? String(req.query.buscar).trim() : '';
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '25', 10) || 25));
    const sortCol = DESTINOS_SORT[req.query.sortField] || 'id';
    const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * pageSize;
    const filt = { tipo, activoQ, buscar };

    const rqCount = db.request();
    const whereC = bindDestinosListFilters(rqCount, filt);
    const countR = await rqCount.query(`SELECT COUNT(*) AS total FROM dbo.NSFW_Destinos ${whereC}`);
    const total = countR.recordset[0]?.total ?? 0;

    const rqList = db.request();
    const whereL = bindDestinosListFilters(rqList, filt);
    rqList.input('off', sql.Int, offset);
    rqList.input('ps', sql.Int, pageSize);
    const listR = await rqList.query(`
      SELECT id, destinos, tipo, razon_social, cuit, codigo_proveedor_tango,
             banco, tipo_cuenta, numero_cuenta, cbu, alias_cbu, activo, acepta_terceros,
             fecha_creacion, fecha_modificacion, usuario_creacion, usuario_modificacion, observaciones
      FROM dbo.NSFW_Destinos
      ${whereL}
      ORDER BY ${sortCol} ${sortDir}
      OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY
    `);

    res.json({
      items: listR.recordset.map(normalizeDestinoPrincipalRow),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[API] destinos list error:', err.message);
    res.status(500).json({ error: err.message, items: [], total: 0 });
  }
});

// GET /api/destinos/:id/cuentas-terceros
app.get('/api/destinos/:id/cuentas-terceros', async (req, res) => {
  const destinoId = parseInt(req.params.id, 10);
  if (Number.isNaN(destinoId)) return res.status(400).json({ error: 'id inválido', items: [] });
  const incluir = req.query.incluir_inactivas === 'true';
  try {
    const db = await getPool();
    const rq = db
      .request()
      .input('did', sql.Int, destinoId)
      .input('incl', sql.Bit, incluir ? 1 : 0);
    const result = await rq.query(`
      SELECT id, destino_id, titular, cuit_titular, banco, tipo_cuenta, numero_cuenta,
             cbu, alias_cbu, activo, fecha_creacion, usuario_creacion, observaciones
      FROM dbo.NSFW_Destinos_CuentasTerceros
      WHERE destino_id = @did AND (@incl = 1 OR activo = 1)
      ORDER BY id ASC
    `);
    res.json({ items: result.recordset.map(mapCuentaTerceraRow) });
  } catch (err) {
    console.error('[API] cuentas-terceros list error:', err.message);
    res.status(500).json({ error: err.message, items: [] });
  }
});

// POST /api/destinos/:id/cuentas-terceros
app.post('/api/destinos/:id/cuentas-terceros', async (req, res) => {
  const destinoId = parseInt(req.params.id, 10);
  if (Number.isNaN(destinoId)) return res.status(400).json({ error: 'destino_id inválido' });
  const b = req.body;
  try {
    const db = await getPool();
    const tipoR = await db.request().input('did', sql.Int, destinoId).query(`
      SELECT tipo FROM dbo.NSFW_Destinos WHERE id = @did
    `);
    if (!tipoR.recordset.length) return res.status(404).json({ error: 'Destino no encontrado' });
    let tTipo = String(tipoR.recordset[0].tipo ?? '').trim().toUpperCase();
    if (tTipo === 'FINANCIERO') tTipo = 'FINANCIERA';
    if (tTipo !== 'FINANCIERA') {
      return res.status(400).json({ error: 'Solo destinos FINANCIERA admiten cuentas de terceros.' });
    }
    const titular = optionalTrim(b.titular, 200);
    if (!titular) return res.status(400).json({ error: 'Titular es requerido.' });
    const bancoCtaIns = optionalTrim(b.banco, 100);
    if (!bancoCtaIns) return res.status(400).json({ error: 'Banco es requerido.' });
    const cuitT = b.cuit_titular != null && String(b.cuit_titular).trim() !== '' ? normalizarCUITDigits(b.cuit_titular) : null;
    const cv = validarCUIT(cuitT || '');
    if (!cv.valido) return res.status(400).json({ error: cv.error });
    const cbuRaw = b.cbu != null && String(b.cbu).trim() !== '' ? normalizarCBU(b.cbu) : null;
    const cbv = validarCBU(cbuRaw || '', { obligatorio: false });
    if (!cbv.valido) return res.status(400).json({ error: cbv.error });

    if (cbuRaw) {
      const dup = await db
        .request()
        .input('did', sql.Int, destinoId)
        .input('cbu', sql.NVarChar(22), cbuRaw)
        .query(`
          SELECT TOP 1 id FROM dbo.NSFW_Destinos_CuentasTerceros
          WHERE destino_id = @did AND activo = 1 AND cbu = @cbu
        `);
      if (dup.recordset.length) {
        return res.status(400).json({ error: 'Ya existe una cuenta activa con el mismo CBU para este destino.' });
      }
    }

    const ins = await db
      .request()
      .input('destino_id', sql.Int, destinoId)
      .input('titular', sql.NVarChar(200), titular)
      .input('cuit_titular', sql.NVarChar(13), cuitT || null)
      .input('banco', sql.NVarChar(100), bancoCtaIns)
      .input('tipo_cuenta', sql.NVarChar(20), optionalTrim(b.tipo_cuenta, 20))
      .input('numero_cuenta', sql.NVarChar(50), optionalTrim(b.numero_cuenta, 50))
      .input('cbu', sql.NVarChar(22), cbuRaw || null)
      .input('alias_cbu', sql.NVarChar(50), optionalTrim(b.alias_cbu, 50))
      .input('obs', sql.NVarChar(500), optionalTrim(b.observaciones, 500))
      .input('usr', sql.NVarChar(100), USUARIO_SISTEMA)
      .query(`
        INSERT INTO dbo.NSFW_Destinos_CuentasTerceros
          (destino_id, titular, cuit_titular, banco, tipo_cuenta, numero_cuenta, cbu, alias_cbu, activo, fecha_creacion, usuario_creacion, observaciones)
        OUTPUT INSERTED.*
        VALUES
          (@destino_id, @titular, @cuit_titular, @banco, @tipo_cuenta, @numero_cuenta, @cbu, @alias_cbu, 1, GETDATE(), @usr, @obs)
      `);
    const row = ins.recordset[0];
    res.json({ success: true, item: mapCuentaTerceraRow(row) });
  } catch (err) {
    console.error('[API] cuentas-terceros insert error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/destinos/:destino_id/cuentas-terceros/:cuentaId
app.put('/api/destinos/:destino_id/cuentas-terceros/:cuentaId', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  const cuentaId = parseInt(req.params.cuentaId, 10);
  if (Number.isNaN(destinoId) || Number.isNaN(cuentaId)) {
    return res.status(400).json({ error: 'ids inválidos' });
  }
  const b = req.body;
  try {
    const db = await getPool();
    const ex = await db
      .request()
      .input('id', sql.Int, cuentaId)
      .input('did', sql.Int, destinoId)
      .query(`SELECT id FROM dbo.NSFW_Destinos_CuentasTerceros WHERE id = @id AND destino_id = @did`);
    if (!ex.recordset.length) return res.status(404).json({ error: 'Cuenta no encontrada para este destino' });

    const titular = optionalTrim(b.titular, 200);
    if (!titular) return res.status(400).json({ error: 'Titular es requerido.' });
    const bancoCta = optionalTrim(b.banco, 100);
    if (!bancoCta) return res.status(400).json({ error: 'Banco es requerido.' });
    const cuitT = b.cuit_titular != null && String(b.cuit_titular).trim() !== '' ? normalizarCUITDigits(b.cuit_titular) : null;
    const cv = validarCUIT(cuitT || '');
    if (!cv.valido) return res.status(400).json({ error: cv.error });
    const cbuRaw = b.cbu != null && String(b.cbu).trim() !== '' ? normalizarCBU(b.cbu) : null;
    const cbv = validarCBU(cbuRaw || '', { obligatorio: false });
    if (!cbv.valido) return res.status(400).json({ error: cbv.error });

    if (cbuRaw) {
      const dup = await db
        .request()
        .input('did', sql.Int, destinoId)
        .input('cbu', sql.NVarChar(22), cbuRaw)
        .input('cid', sql.Int, cuentaId)
        .query(`
          SELECT TOP 1 id FROM dbo.NSFW_Destinos_CuentasTerceros
          WHERE destino_id = @did AND activo = 1 AND cbu = @cbu AND id <> @cid
        `);
      if (dup.recordset.length) {
        return res.status(400).json({ error: 'Ya existe otra cuenta activa con el mismo CBU para este destino.' });
      }
    }

    const activo =
      b.activo === undefined || b.activo === null
        ? undefined
        : b.activo !== false && b.activo !== 0 && b.activo !== 'false';

    let updateCtaSql = `
      UPDATE dbo.NSFW_Destinos_CuentasTerceros SET
        titular = @titular,
        cuit_titular = @cuit_titular,
        banco = @banco,
        tipo_cuenta = @tipo_cuenta,
        numero_cuenta = @numero_cuenta,
        cbu = @cbu,
        alias_cbu = @alias_cbu,
        observaciones = @obs
    `;
    const rq = db
      .request()
      .input('id', sql.Int, cuentaId)
      .input('titular', sql.NVarChar(200), titular)
      .input('cuit_titular', sql.NVarChar(13), cuitT || null)
      .input('banco', sql.NVarChar(100), bancoCta)
      .input('tipo_cuenta', sql.NVarChar(20), optionalTrim(b.tipo_cuenta, 20))
      .input('numero_cuenta', sql.NVarChar(50), optionalTrim(b.numero_cuenta, 50))
      .input('cbu', sql.NVarChar(22), cbuRaw || null)
      .input('alias_cbu', sql.NVarChar(50), optionalTrim(b.alias_cbu, 50))
      .input('obs', sql.NVarChar(500), optionalTrim(b.observaciones, 500));
    if (activo !== undefined) {
      updateCtaSql += ', activo = @activo';
      rq.input('activo', sql.Bit, activo ? 1 : 0);
    }
    updateCtaSql += ' WHERE id = @id';
    await rq.query(updateCtaSql);

    const fresh = await db.request().input('id', sql.Int, cuentaId).query(`
      SELECT * FROM dbo.NSFW_Destinos_CuentasTerceros WHERE id = @id
    `);
    res.json({ success: true, item: mapCuentaTerceraRow(fresh.recordset[0]) });
  } catch (err) {
    console.error('[API] cuentas-terceros update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/destinos/:destino_id/cuentas-terceros/:id — soft delete
app.delete('/api/destinos/:destino_id/cuentas-terceros/:id', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  const cuentaId = parseInt(req.params.id, 10);
  if (Number.isNaN(destinoId) || Number.isNaN(cuentaId)) {
    return res.status(400).json({ error: 'ids inválidos' });
  }
  try {
    const db = await getPool();
    const ex = await db
      .request()
      .input('id', sql.Int, cuentaId)
      .input('did', sql.Int, destinoId)
      .query(`SELECT id FROM dbo.NSFW_Destinos_CuentasTerceros WHERE id = @id AND destino_id = @did`);
    if (!ex.recordset.length) return res.status(404).json({ error: 'No encontrado' });

    const tx = await db
      .request()
      .input('cid', sql.Int, cuentaId)
      .query(`SELECT COUNT(*) AS n FROM dbo.NSFW_Transferencias WHERE cuenta_tercera_id = @cid`);
    const n = tx.recordset[0]?.n ?? 0;
    let warning = null;
    if (n > 0) warning = `Existen ${n} transferencia(s) que referencian esta cuenta.`;

    await db.request().input('id', sql.Int, cuentaId).query(`
      UPDATE dbo.NSFW_Destinos_CuentasTerceros SET activo = 0 WHERE id = @id
    `);
    res.json({ success: true, warning });
  } catch (err) {
    console.error('[API] cuentas-terceros delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── NSFW_Proveedores_Terceros (cuentas de terceros del proveedor) ───────────

// GET /api/destinos/:destino_id/terceros-proveedores
app.get('/api/destinos/:destino_id/terceros-proveedores', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  if (Number.isNaN(destinoId)) return res.status(400).json({ error: 'ID de destino inválido' });
  try {
    const db = await getPool();
    const destino = await db
      .request()
      .input('destinoId', sql.Int, destinoId)
      .query(`SELECT tipo, acepta_terceros FROM dbo.NSFW_Destinos WHERE id = @destinoId`);
    if (!destino.recordset.length) return res.status(404).json({ error: 'Destino no encontrado' });
    let tTipo = String(destino.recordset[0].tipo ?? '').trim().toUpperCase();
    if (tTipo === 'PROVEEDOR_TERCEROS') tTipo = 'PROVEEDOR';
    if (tTipo !== 'PROVEEDOR') {
      return res.status(400).json({ error: 'Solo destinos PROVEEDOR pueden tener terceros' });
    }
    if (!destino.recordset[0].acepta_terceros) {
      return res.json({ terceros: [] });
    }
    const result = await db
      .request()
      .input('destinoId', sql.Int, destinoId)
      .query(`
        SELECT id, destino_id, nombre_tercero, cuit_tercero, banco, numero_cuenta, cbu, alias_cbu,
               activo, fecha_creacion, observaciones
        FROM dbo.NSFW_Proveedores_Terceros
        WHERE destino_id = @destinoId AND activo = 1
        ORDER BY nombre_tercero
      `);
    res.json({ terceros: result.recordset });
  } catch (err) {
    console.error('[API] terceros-proveedores list error:', err.message);
    res.status(500).json({ error: 'Error al obtener terceros del proveedor' });
  }
});

// POST /api/destinos/:destino_id/terceros-proveedores
app.post('/api/destinos/:destino_id/terceros-proveedores', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  if (Number.isNaN(destinoId)) return res.status(400).json({ error: 'ID de destino inválido' });
  const {
    nombre_tercero,
    cuit_tercero,
    banco,
    numero_cuenta,
    cbu,
    alias_cbu,
    observaciones,
  } = req.body || {};
  if (!nombre_tercero || !String(nombre_tercero).trim()) {
    return res.status(400).json({ error: 'El nombre del tercero es requerido' });
  }
  try {
    const db = await getPool();
    const destino = await db
      .request()
      .input('destinoId', sql.Int, destinoId)
      .query(`SELECT tipo, acepta_terceros FROM dbo.NSFW_Destinos WHERE id = @destinoId`);
    if (!destino.recordset.length) return res.status(404).json({ error: 'Destino no encontrado' });
    let tTipo = String(destino.recordset[0].tipo ?? '').trim().toUpperCase();
    if (tTipo === 'PROVEEDOR_TERCEROS') tTipo = 'PROVEEDOR';
    if (tTipo !== 'PROVEEDOR') {
      return res.status(400).json({ error: 'Solo destinos PROVEEDOR pueden tener terceros' });
    }
    if (!destino.recordset[0].acepta_terceros) {
      return res.status(400).json({ error: 'Este proveedor no acepta terceros' });
    }
    const result = await db
      .request()
      .input('destino_id', sql.Int, destinoId)
      .input('nombre_tercero', sql.NVarChar(200), String(nombre_tercero).trim())
      .input('cuit_tercero', sql.NVarChar(13), optionalTrim(cuit_tercero, 13))
      .input('banco', sql.NVarChar(50), optionalTrim(banco, 50))
      .input('numero_cuenta', sql.NVarChar(50), optionalTrim(numero_cuenta, 50))
      .input('cbu', sql.NVarChar(22), optionalTrim(cbu, 22))
      .input('alias_cbu', sql.NVarChar(50), optionalTrim(alias_cbu, 50))
      .input('usuario_creacion', sql.NVarChar(100), USUARIO_SISTEMA)
      .input('observaciones', sql.NVarChar(500), optionalTrim(observaciones, 500))
      .query(`
        INSERT INTO dbo.NSFW_Proveedores_Terceros
          (destino_id, nombre_tercero, cuit_tercero, banco, numero_cuenta, cbu, alias_cbu,
           activo, fecha_creacion, usuario_creacion, observaciones)
        OUTPUT INSERTED.id
        VALUES
          (@destino_id, @nombre_tercero, @cuit_tercero, @banco, @numero_cuenta, @cbu, @alias_cbu,
           1, GETDATE(), @usuario_creacion, @observaciones)
      `);
    res.json({
      message: 'Tercero agregado correctamente',
      id: result.recordset[0].id,
    });
  } catch (err) {
    console.error('[API] terceros-proveedores insert error:', err.message);
    res.status(500).json({ error: 'Error al crear tercero' });
  }
});

// PUT /api/destinos/:destino_id/terceros-proveedores/:id
app.put('/api/destinos/:destino_id/terceros-proveedores/:id', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  const terceroId = parseInt(req.params.id, 10);
  if (Number.isNaN(destinoId) || Number.isNaN(terceroId)) {
    return res.status(400).json({ error: 'IDs inválidos' });
  }
  const {
    nombre_tercero,
    cuit_tercero,
    banco,
    numero_cuenta,
    cbu,
    alias_cbu,
    observaciones,
  } = req.body || {};
  if (!nombre_tercero || !String(nombre_tercero).trim()) {
    return res.status(400).json({ error: 'El nombre del tercero es requerido' });
  }
  try {
    const db = await getPool();
    const result = await db
      .request()
      .input('id', sql.Int, terceroId)
      .input('destino_id', sql.Int, destinoId)
      .input('nombre_tercero', sql.NVarChar(200), String(nombre_tercero).trim())
      .input('cuit_tercero', sql.NVarChar(13), optionalTrim(cuit_tercero, 13))
      .input('banco', sql.NVarChar(50), optionalTrim(banco, 50))
      .input('numero_cuenta', sql.NVarChar(50), optionalTrim(numero_cuenta, 50))
      .input('cbu', sql.NVarChar(22), optionalTrim(cbu, 22))
      .input('alias_cbu', sql.NVarChar(50), optionalTrim(alias_cbu, 50))
      .input('observaciones', sql.NVarChar(500), optionalTrim(observaciones, 500))
      .query(`
        UPDATE dbo.NSFW_Proveedores_Terceros SET
          nombre_tercero = @nombre_tercero,
          cuit_tercero = @cuit_tercero,
          banco = @banco,
          numero_cuenta = @numero_cuenta,
          cbu = @cbu,
          alias_cbu = @alias_cbu,
          observaciones = @observaciones
        WHERE id = @id AND destino_id = @destino_id AND activo = 1
      `);
    if ((result.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ error: 'Tercero no encontrado' });
    }
    res.json({ message: 'Tercero actualizado correctamente' });
  } catch (err) {
    console.error('[API] terceros-proveedores update error:', err.message);
    res.status(500).json({ error: 'Error al actualizar tercero' });
  }
});

// DELETE /api/destinos/:destino_id/terceros-proveedores/:id — baja lógica
app.delete('/api/destinos/:destino_id/terceros-proveedores/:id', async (req, res) => {
  const destinoId = parseInt(req.params.destino_id, 10);
  const terceroId = parseInt(req.params.id, 10);
  if (Number.isNaN(destinoId) || Number.isNaN(terceroId)) {
    return res.status(400).json({ error: 'IDs inválidos' });
  }
  try {
    const db = await getPool();
    const checkUsage = await db
      .request()
      .input('terceroId', sql.Int, terceroId)
      .query(`
        SELECT COUNT(*) AS n
        FROM dbo.NSFW_Transferencias
        WHERE tercero_proveedor_id = @terceroId
      `);
    const hasTransfers = (checkUsage.recordset[0]?.n ?? 0) > 0;
    const result = await db
      .request()
      .input('id', sql.Int, terceroId)
      .input('destino_id', sql.Int, destinoId)
      .query(`
        UPDATE dbo.NSFW_Proveedores_Terceros SET activo = 0
        WHERE id = @id AND destino_id = @destino_id
      `);
    if ((result.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ error: 'Tercero no encontrado' });
    }
    res.json({
      message: 'Tercero desactivado correctamente',
      warning: hasTransfers ? 'Este tercero tiene transferencias asociadas' : null,
    });
  } catch (err) {
    console.error('[API] terceros-proveedores delete error:', err.message);
    res.status(500).json({ error: 'Error al desactivar tercero' });
  }
});

// GET /api/destinos/:id — detalle + cuentas
app.get('/api/destinos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const incluir = req.query.incluir_cuentas !== 'false';
  try {
    const db = await getPool();
    const d = await db.request().input('id', sql.Int, id).query(`
      SELECT id, destinos, tipo, razon_social, cuit, codigo_proveedor_tango,
             banco, tipo_cuenta, numero_cuenta, cbu, alias_cbu, activo, acepta_terceros,
             fecha_creacion, fecha_modificacion, usuario_creacion, usuario_modificacion, observaciones
      FROM dbo.NSFW_Destinos WHERE id = @id
    `);
    if (!d.recordset.length) return res.status(404).json({ error: 'No encontrado' });
    const row = normalizeDestinoPrincipalRow(d.recordset[0]);
    let cuentas_terceros = [];
    let terceros_proveedores = [];
    if (incluir) {
      const c = await db.request().input('id', sql.Int, id).query(`
        SELECT id, destino_id, titular, cuit_titular, banco, tipo_cuenta, numero_cuenta,
               cbu, alias_cbu, activo, fecha_creacion, usuario_creacion, observaciones
        FROM dbo.NSFW_Destinos_CuentasTerceros
        WHERE destino_id = @id
        ORDER BY id ASC
      `);
      cuentas_terceros = c.recordset.map(mapCuentaTerceraRow);
    }
    if (row.tipo === 'PROVEEDOR' && row.acepta_terceros) {
      const tp = await db.request().input('id', sql.Int, id).query(`
        SELECT id, destino_id, nombre_tercero, cuit_tercero, banco, numero_cuenta, cbu, alias_cbu,
               activo, fecha_creacion, usuario_creacion, observaciones
        FROM dbo.NSFW_Proveedores_Terceros
        WHERE destino_id = @id AND activo = 1
        ORDER BY nombre_tercero
      `);
      terceros_proveedores = tp.recordset;
    }
    res.json({ destino: { ...row, cuentas_terceros, terceros_proveedores } });
  } catch (err) {
    console.error('[API] destino get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/destinos
app.post('/api/destinos', async (req, res) => {
  const data = parseDestinoPayload(req.body, { defaultsActivo: true });
  try {
    const db = await getPool();
    const errores = await collectErroresValidacionDestino(db, data, null);
    if (errores.length) return res.status(400).json({ error: errores.join(' ') });

    const ins = await db
      .request()
      .input('destinos', sql.NVarChar(20), data.destinos)
      .input('tipo', sql.NVarChar(20), data.tipo)
      .input('razon_social', sql.NVarChar(200), data.razon_social)
      .input('cuit', sql.NVarChar(13), data.cuit || null)
      .input('codigo_proveedor_tango', sql.NVarChar(50), data.codigo_proveedor_tango)
      .input('banco', sql.NVarChar(100), data.banco)
      .input('tipo_cuenta', sql.NVarChar(20), data.tipo_cuenta)
      .input('numero_cuenta', sql.NVarChar(50), data.numero_cuenta)
      .input('cbu', sql.NVarChar(22), data.cbu)
      .input('alias_cbu', sql.NVarChar(50), data.alias_cbu)
      .input('activo', sql.Bit, data.activo ? 1 : 0)
      .input('acepta_terceros', sql.Bit, data.acepta_terceros ? 1 : 0)
      .input('obs', sql.NVarChar(500), data.observaciones)
      .input('usr', sql.NVarChar(100), USUARIO_SISTEMA)
      .query(`
        INSERT INTO dbo.NSFW_Destinos
          (destinos, tipo, razon_social, cuit, codigo_proveedor_tango, banco, tipo_cuenta, numero_cuenta,
           cbu, alias_cbu, activo, acepta_terceros, fecha_creacion, usuario_creacion, observaciones)
        OUTPUT INSERTED.*
        VALUES
          (@destinos, @tipo, @razon_social, @cuit, @codigo_proveedor_tango, @banco, @tipo_cuenta, @numero_cuenta,
           @cbu, @alias_cbu, @activo, @acepta_terceros, GETDATE(), @usr, @obs)
      `);
    res.json({ success: true, item: normalizeDestinoPrincipalRow(ins.recordset[0]) });
  } catch (err) {
    console.error('[API] destinos insert error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/destinos/:id
app.put('/api/destinos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const ex = await db
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT id, activo FROM dbo.NSFW_Destinos WHERE id = @id`);
    if (!ex.recordset.length) return res.status(404).json({ error: 'No encontrado' });

    const activoActual = Boolean(ex.recordset[0].activo ?? ex.recordset[0].Activo);
    const data = parseDestinoPayload(req.body, { defaultsActivo: activoActual });

    const errores = await collectErroresValidacionDestino(db, data, id);
    if (errores.length) return res.status(400).json({ error: errores.join(' ') });

    await db
      .request()
      .input('id', sql.Int, id)
      .input('destinos', sql.NVarChar(20), data.destinos)
      .input('tipo', sql.NVarChar(20), data.tipo)
      .input('razon_social', sql.NVarChar(200), data.razon_social)
      .input('cuit', sql.NVarChar(13), data.cuit || null)
      .input('codigo_proveedor_tango', sql.NVarChar(50), data.codigo_proveedor_tango)
      .input('banco', sql.NVarChar(100), data.banco)
      .input('tipo_cuenta', sql.NVarChar(20), data.tipo_cuenta)
      .input('numero_cuenta', sql.NVarChar(50), data.numero_cuenta)
      .input('cbu', sql.NVarChar(22), data.cbu)
      .input('alias_cbu', sql.NVarChar(50), data.alias_cbu)
      .input('activo', sql.Bit, data.activo ? 1 : 0)
      .input('acepta_terceros', sql.Bit, data.acepta_terceros ? 1 : 0)
      .input('obs', sql.NVarChar(500), data.observaciones)
      .input('usr', sql.NVarChar(100), USUARIO_SISTEMA)
      .query(`
        UPDATE dbo.NSFW_Destinos SET
          destinos = @destinos,
          tipo = @tipo,
          razon_social = @razon_social,
          cuit = @cuit,
          codigo_proveedor_tango = @codigo_proveedor_tango,
          banco = @banco,
          tipo_cuenta = @tipo_cuenta,
          numero_cuenta = @numero_cuenta,
          cbu = @cbu,
          alias_cbu = @alias_cbu,
          activo = @activo,
          acepta_terceros = @acepta_terceros,
          observaciones = @obs,
          fecha_modificacion = GETDATE(),
          usuario_modificacion = @usr
        WHERE id = @id
      `);

    const fresh = await db.request().input('id', sql.Int, id).query(`SELECT * FROM dbo.NSFW_Destinos WHERE id = @id`);
    res.json({ success: true, item: normalizeDestinoPrincipalRow(fresh.recordset[0]) });
  } catch (err) {
    console.error('[API] destinos update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/destinos/:id — soft delete (desactiva)
app.delete('/api/destinos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const ex = await db.request().input('id', sql.Int, id).query(`SELECT id FROM dbo.NSFW_Destinos WHERE id = @id`);
    if (!ex.recordset.length) return res.status(404).json({ error: 'No encontrado' });

    const tx = await db
      .request()
      .input('did', sql.Int, id)
      .query(`SELECT COUNT(*) AS n FROM dbo.NSFW_Transferencias WHERE destino_id = @did`);
    const n = tx.recordset[0]?.n ?? 0;
    let warning = null;
    if (n > 0) warning = `Existen ${n} transferencia(s) asociadas a este destino.`;

    await db
      .request()
      .input('id', sql.Int, id)
      .input('usr', sql.NVarChar(100), USUARIO_SISTEMA)
      .query(`
        UPDATE dbo.NSFW_Destinos SET
          activo = 0,
          fecha_modificacion = GETDATE(),
          usuario_modificacion = @usr
        WHERE id = @id
      `);
    res.json({ success: true, warning });
  } catch (err) {
    console.error('[API] destinos delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/destinos/:id/permanente — borrado físico (solo si nunca fue utilizado)
app.delete('/api/destinos/:id/permanente', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const ex = await db
      .request()
      .input('id', sql.Int, id)
      .query(`SELECT id, activo FROM dbo.NSFW_Destinos WHERE id = @id`);
    if (!ex.recordset.length) return res.status(404).json({ error: 'Destino no encontrado.' });

    // Verificar que no esté referenciado en transferencias
    const txCheck = await db
      .request()
      .input('did', sql.Int, id)
      .query(`SELECT COUNT(*) AS n FROM dbo.NSFW_Transferencias WHERE destino_id = @did`);
    const nTx = txCheck.recordset[0]?.n ?? 0;
    if (nTx > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: el destino está referenciado en ${nTx} transferencia(s).`,
      });
    }

    // Borrar primero las cuentas de terceros (si existen)
    await db
      .request()
      .input('did', sql.Int, id)
      .query(`DELETE FROM dbo.NSFW_Destinos_CuentasTerceros WHERE destino_id = @did`);

    // Borrado físico del destino
    await db.request().input('id', sql.Int, id).query(`DELETE FROM dbo.NSFW_Destinos WHERE id = @id`);

    res.json({ success: true, message: 'Destino eliminado permanentemente.' });
  } catch (err) {
    console.error('[API] destinos delete permanente error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/tango/buscar-codigo ─────────────────────────────────────────────
// Busca un código Tango y devuelve el nombre asociado.
//   ?tipo=PROVEEDOR → CPA01 (COD_PROVEE → NOM_PROVEE)
//   ?tipo=FINANCIERA|CLIENTE_FINANCIERO → SBA01 (COD_CTA → descripcio)
app.get('/api/tango/buscar-codigo', async (req, res) => {
  const tipoRaw = String(req.query.tipo ?? '').trim().toUpperCase();
  const codigo = String(req.query.codigo ?? '').trim();
  const tipo =
    tipoRaw === 'FINANCIERO' ? 'FINANCIERA' : tipoRaw === 'PROVEEDOR_TERCEROS' ? 'PROVEEDOR' : tipoRaw;

  if (!codigo) return res.status(400).json({ error: 'Parámetro codigo requerido.' });
  const usaCpa = tipo === 'PROVEEDOR';
  const usaSba = tipo === 'FINANCIERA' || tipo === 'CLIENTE_FINANCIERO';
  if (!usaCpa && !usaSba) {
    return res.status(400).json({
      error: 'tipo debe ser PROVEEDOR, FINANCIERA o CLIENTE_FINANCIERO.',
    });
  }

  try {
    const db = await getPool();
    let result;

    if (usaCpa) {
      result = await db
        .request()
        .input('cod', sql.VarChar(20), codigo)
        .query(`
          SELECT TOP 1
            RTRIM(LTRIM(COD_PROVEE)) AS codigo,
            RTRIM(LTRIM(NOM_PROVEE)) AS nombre
          FROM dbo.CPA01
          WHERE RTRIM(LTRIM(COD_PROVEE)) = RTRIM(LTRIM(@cod))
        `);
    } else {
      result = await db
        .request()
        .input('cod', sql.VarChar(20), codigo)
        .query(`
          SELECT TOP 1
            RTRIM(LTRIM(COD_CTA))    AS codigo,
            RTRIM(LTRIM(descripcio)) AS nombre
          FROM dbo.SBA01
          WHERE RTRIM(LTRIM(COD_CTA)) = RTRIM(LTRIM(@cod))
        `);
    }

    if (!result.recordset.length) {
      return res.status(404).json({ encontrado: false, nombre: null });
    }

    res.json({ encontrado: true, codigo: result.recordset[0].codigo, nombre: result.recordset[0].nombre });
  } catch (err) {
    console.error('[API] tango buscar-codigo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Catálogo personasasignadas (descripcion VARCHAR(20)) ──────────────────────
app.get('/api/personas-asignadas', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, descripcion FROM dbo.NSFW_PersonasAsignadas ORDER BY id ASC
    `);
    res.json({ items: result.recordset });
  } catch (err) {
    console.error('[API] personas-asignadas list error:', err.message);
    res.status(500).json({ error: err.message, items: [] });
  }
});

app.post('/api/personas-asignadas', async (req, res) => {
  const check = trimCat20(req.body.descripcion, 'Descripción');
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const db = await getPool();
    const result = await db
      .request()
      .input('d', sql.VarChar(20), check.value)
      .query(`
        INSERT INTO dbo.NSFW_PersonasAsignadas (descripcion) OUTPUT INSERTED.id, INSERTED.descripcion
        VALUES (@d)
      `);
    res.json({ success: true, item: result.recordset[0] });
  } catch (err) {
    console.error('[API] personas-asignadas insert error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/personas-asignadas/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const check = trimCat20(req.body.descripcion, 'Descripción');
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const db = await getPool();
    await db
      .request()
      .input('id', sql.Int, id)
      .input('d', sql.VarChar(20), check.value)
      .query(`UPDATE dbo.NSFW_PersonasAsignadas SET descripcion = @d WHERE id = @id`);
    res.json({ success: true, item: { id, descripcion: check.value } });
  } catch (err) {
    console.error('[API] personas-asignadas update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/personas-asignadas/:id', async (req, res) => {
  try {
    const db = await getPool();
    await db.request().input('id', sql.Int, parseInt(req.params.id, 10)).query(`
      DELETE FROM dbo.NSFW_PersonasAsignadas WHERE id = @id
    `);
    res.json({ success: true });
  } catch (err) {
    console.error('[API] personas-asignadas delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Documentos: Recibo / Comprobante de pago ─────────────────────────────────

// GET  /visualizar-recibo      → solo preview HTML (NO crea registro en GVA12)
// GET  /visualizar-recibo-pdf  → solo PDF          (NO crea registro en GVA12)
// POST /generar-recibo         → crea registro en GVA12 + devuelve JSON con datos

app.get('/api/transfers/:id/visualizar-recibo', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(SQL_TRANSFER_DOCUMENTO);
    if (!result.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const row = result.recordset[0];
    const html = templateRecibo(row, { logoSrc: loadLogoDataUri(), forPdf: false });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[API] visualizar-recibo error:', err.message);
    res.status(500).json({ error: 'Error al visualizar recibo' });
  }
});

app.get('/api/transfers/:id/visualizar-recibo-pdf', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(SQL_TRANSFER_DOCUMENTO);
    if (!result.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const row = result.recordset[0];
    const logo = loadLogoDataUri();
    const html = templateRecibo(row, { logoSrc: logo, forPdf: true });
    const pdf = await renderPdfBuffer(html);
    const numero = generarNumeroDocumento('recibo', id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Recibo_Preview_${numero}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[API] visualizar-recibo-pdf error:', err.message);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

app.post('/api/transfers/:id/generar-recibo', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(SQL_TRANSFER_DOCUMENTO);
    if (!result.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const row = result.recordset[0];

    let resultadoTango;
    try {
      resultadoTango = await registrarReciboEnGVA12(db, row);
    } catch (tangoErr) {
      // Error específico: recibo ya emitido anteriormente
      if (tangoErr.message === 'RECIBO_YA_EMITIDO') {
        console.warn(`[API] Recibo ya emitido para transferencia ID=${id}`);
        return res.status(409).json({
          error: 'El recibo ya fue generado para esta transferencia',
          codigo: 'RECIBO_YA_EMITIDO',
        });
      }

      // Cualquier otro error de Tango
      console.error('[API] Error al registrar en Tango:', tangoErr.message);
      return res.status(500).json({
        error: 'No se pudo registrar el recibo en Tango',
        detalle: tangoErr.message,
      });
    }

    console.log(
      `[API] Recibo registrado — N_COMP: ${resultadoTango.nComp}` +
        ` | ID_GVA12: ${resultadoTango.idGva12 ?? 'N/A'}` +
        ` | ID_SBA04: ${resultadoTango.idSba04}` +
        ` | N_INTERNO_SBA04: ${resultadoTango.nInternoSba04}` +
        ` | GVA12 insertado: ${resultadoTango.insertóGVA12}`
    );

    res.json({
      success: true,
      message: 'Recibo generado y registrado en Tango correctamente',
      n_comp: resultadoTango.nComp,
      ncomp_in_v: resultadoTango.ncompInV,
      id_gva12: resultadoTango.idGva12 ?? null,
      id_sba04: resultadoTango.idSba04,
      n_interno_sba04: resultadoTango.nInternoSba04,
      insertó_gva12: resultadoTango.insertóGVA12,
    });
  } catch (err) {
    console.error('[API] generar-recibo error:', err.message);
    res.status(500).json({ error: 'Error al generar recibo' });
  }
});

app.get('/api/transfers/:id/generar-comprobante-pago', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(SQL_TRANSFER_DOCUMENTO);
    if (!result.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const row = result.recordset[0];
    if (String(row.Estado || '').trim() !== 'Utilizada') {
      return res.status(400).json({
        error: 'El comprobante de pago solo puede generarse para transferencias en estado Utilizada',
      });
    }
    const destinoInfo = rowToDestinoInfoDoc(row);
    const terceroInfo = rowToTerceroInfoDoc(row);
    const html = templateComprobantePago(row, destinoInfo, terceroInfo, {
      logoSrc: loadLogoDataUri(),
      forPdf: false,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[API] generar-comprobante-pago error:', err.message);
    res.status(500).json({ error: 'Error al generar comprobante de pago' });
  }
});

app.get('/api/transfers/:id/generar-comprobante-pago-pdf', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(SQL_TRANSFER_DOCUMENTO);
    if (!result.recordset.length) return res.status(404).json({ error: 'Transferencia no encontrada' });
    const row = result.recordset[0];
    if (String(row.Estado || '').trim() !== 'Utilizada') {
      return res.status(400).json({
        error: 'El comprobante de pago solo puede generarse para transferencias en estado Utilizada',
      });
    }
    const destinoInfo = rowToDestinoInfoDoc(row);
    const terceroInfo = rowToTerceroInfoDoc(row);
    const logo = loadLogoDataUri();
    const html = templateComprobantePago(row, destinoInfo, terceroInfo, { logoSrc: logo, forPdf: true });
    const pdf = await renderPdfBuffer(html);
    const numero = generarNumeroDocumento('pago', id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ComprobantePago_${numero}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[API] generar-comprobante-pago-pdf error:', err.message);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

// ─── GET /api/transfers/:id — Una transferencia ────────────────────────────────
app.get('/api/transfers/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const result = await db.request().input('id', sql.Int, id).query(`
      SELECT TOP 1
        t.id, t.CodigoTransferencia, t.PersonaAsignada, t.Cliente, t.COD_CLIENT, t.TIPO_ORIGEN, t.Destino,
        t.Usuario, t.TipoTransaccion, t.Monto, t.Estado,
        FORMAT(t.FECHA, 'dd/MM/yyyy') AS FECHA,
        FORMAT(t.FechaComprobante, 'dd/MM/yyyy') AS FechaComprobante,
        FORMAT(t.FechaEnvio, 'dd/MM/yyyy') AS FechaEnvio,
        FORMAT(t.FechaRegistro, 'dd/MM/yyyy HH:mm') AS FechaRegistro,
        t.IDTransferencia, t.CUITOrigen, t.CtaOrigen, t.CBUOrigen,
        t.CUITDestino, t.CtaDestino, t.CBUDestino, t.Banco, t.Concepto,
        t.destino_id, t.destino_tipo, t.cuenta_tercera_id, t.tercero_proveedor_id,
        d.tipo AS DestinoCatalogoTipo,
        COALESCE(d.razon_social, d.destinos, t.Destino) AS DestinoNombreCatalogo,
        d.destinos AS DestinoNombreCorto,
        ct.titular AS CuentaTerceroTitular,
        ct.cbu AS CuentaTerceroCBU,
        ct.cuit_titular AS CuentaTerceroCuitTitular,
        pt.nombre_tercero AS TerceroProveedorNombre
      FROM dbo.NSFW_Transferencias t
      LEFT JOIN dbo.NSFW_Destinos d ON d.id = t.destino_id
      LEFT JOIN dbo.NSFW_Destinos_CuentasTerceros ct ON ct.id = t.cuenta_tercera_id
      LEFT JOIN dbo.NSFW_Proveedores_Terceros pt ON pt.id = t.tercero_proveedor_id
      WHERE t.id = @id
    `);
    if (!result.recordset.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ transfer: result.recordset[0] });
  } catch (err) {
    console.error('[API] get-transfer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/transfers/:id — Actualizar ───────────────────────────────────────
app.put('/api/transfers/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  const f = req.body;
  if (!f.CodigoTransferencia || f.Monto === undefined || f.Monto === null) {
    return res.status(400).json({ error: 'CodigoTransferencia y Monto son requeridos' });
  }
  const s = buildTransferSqlParams(f);
  try {
    const db = await getPool();
    const reglaErr = await assertTransferDestinoReglas(db, s);
    if (reglaErr) return res.status(400).json({ error: reglaErr });

    await db
      .request()
      .input('id', sql.Int, id)
      .input('CodigoTransferencia', sql.NVarChar(100), s.CodigoTransferencia)
      .input('PersonaAsignada', sql.NVarChar(100), s.PersonaAsignada)
      .input('Cliente', sql.NVarChar(200), s.Cliente)
      .input('COD_CLIENT', sql.NVarChar(50), s.COD_CLIENT)
      .input('TIPO_ORIGEN', sql.NVarChar(20), s.TIPO_ORIGEN)
      .input('Destino', sql.NVarChar(200), s.Destino)
      .input('Usuario', sql.NVarChar(100), s.Usuario)
      .input('TipoTransaccion', sql.NVarChar(100), s.TipoTransaccion)
      .input('Monto', sql.Decimal(18, 2), s.Monto)
      .input('Estado', sql.NVarChar(50), s.Estado)
      .input('FECHA', sql.Date, s.FECHA)
      .input('FechaComprobante', sql.Date, s.FechaComprobante)
      .input('FechaEnvio', sql.Date, s.FechaEnvio)
      .input('FechaRegistro', sql.Date, s.FechaRegistro)
      .input('IDTransferencia', sql.NVarChar(100), s.IDTransferencia)
      .input('CUITOrigen', sql.NVarChar(20), s.CUITOrigen)
      .input('CtaOrigen', sql.NVarChar(200), s.CtaOrigen)
      .input('CBUOrigen', sql.NVarChar(22), s.CBUOrigen)
      .input('CUITDestino', sql.NVarChar(20), s.CUITDestino)
      .input('CtaDestino', sql.NVarChar(200), s.CtaDestino)
      .input('CBUDestino', sql.NVarChar(22), s.CBUDestino)
      .input('Banco', sql.NVarChar(50), s.Banco)
      .input('Concepto', sql.NVarChar(100), s.Concepto)
      .input('destino_id', sql.Int, s.destino_id)
      .input('destino_tipo', sql.NVarChar(20), s.destino_tipo)
      .input('cuenta_tercera_id', sql.Int, s.cuenta_tercera_id)
      .input('tercero_proveedor_id', sql.Int, s.tercero_proveedor_id)
      .input('cuit_origen', sql.NVarChar(13), s.cuit_origen)
      .input('cta_origen', sql.NVarChar(50), s.cta_origen)
      .input('cbu_origen', sql.NVarChar(22), s.cbu_origen)
      .input('cuit_destino', sql.NVarChar(13), s.cuit_destino)
      .input('cta_destino', sql.NVarChar(50), s.cta_destino)
      .input('cbu_destino', sql.NVarChar(22), s.cbu_destino)
      .input('operacion', sql.NVarChar(30), s.operacion)
      .input('Id_transferencia', sql.NVarChar(30), s.Id_transferencia)
      .query(`
        UPDATE dbo.NSFW_Transferencias SET
          CodigoTransferencia = @CodigoTransferencia,
          PersonaAsignada     = @PersonaAsignada,
          Cliente             = @Cliente,
          COD_CLIENT          = @COD_CLIENT,
          TIPO_ORIGEN         = @TIPO_ORIGEN,
          Destino             = @Destino,
          Usuario             = @Usuario,
          TipoTransaccion     = @TipoTransaccion,
          Monto               = @Monto,
          Estado              = @Estado,
          FECHA               = @FECHA,
          FechaComprobante    = @FechaComprobante,
          FechaEnvio          = @FechaEnvio,
          FechaRegistro       = @FechaRegistro,
          IDTransferencia     = @IDTransferencia,
          CUITOrigen          = @CUITOrigen,
          CtaOrigen           = @CtaOrigen,
          CBUOrigen           = @CBUOrigen,
          CUITDestino         = @CUITDestino,
          CtaDestino          = @CtaDestino,
          CBUDestino          = @CBUDestino,
          Banco               = @Banco,
          Concepto            = @Concepto,
          destino_id          = @destino_id,
          destino_tipo        = @destino_tipo,
          cuenta_tercera_id   = @cuenta_tercera_id,
          tercero_proveedor_id = @tercero_proveedor_id,
          cuit_origen         = @cuit_origen,
          cta_origen          = @cta_origen,
          cbu_origen          = @cbu_origen,
          cuit_destino        = @cuit_destino,
          cta_destino         = @cta_destino,
          cbu_destino         = @cbu_destino,
          operacion           = @operacion,
          Id_transferencia    = @Id_transferencia
        WHERE id = @id
      `);
    res.json({ success: true, message: `Transferencia #${id} actualizada.` });
  } catch (err) {
    console.error('[API] update-transfer error:', err.message);
    const { status, body, logBody } = transferWriteErrorResponse(err);
    if (logBody) console.error('[API] update-transfer body (truncado?):', req.body);
    res.status(status).json(body);
  }
});

// ─── DELETE /api/transfers/:id — Eliminar transferencia ───────────────────────
app.delete('/api/transfers/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const db = await getPool();
    const del = await db.request().input('id', sql.Int, id).query(`
      DELETE FROM dbo.NSFW_Transferencias WHERE id = @id
    `);
    if ((del.rowsAffected?.[0] ?? 0) === 0) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }
    res.json({ success: true, message: `Transferencia #${id} eliminada.` });
  } catch (err) {
    console.error('[API] delete-transfer error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/transfers — Listado para el Dashboard ──────────────────────────
app.get('/api/transfers', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT TOP 50
        t.id, t.CodigoTransferencia, t.PersonaAsignada, t.Cliente, t.COD_CLIENT, t.TIPO_ORIGEN, t.Destino,
        t.Usuario, t.TipoTransaccion, t.Monto, t.Estado,
        t.REC_EMITIDO,
        t.OP_EMITIDA,
        FORMAT(t.FECHA, 'dd/MM/yyyy') AS FECHA,
        FORMAT(t.FechaComprobante, 'dd/MM/yyyy') AS FechaComprobante,
        FORMAT(t.FechaEnvio, 'dd/MM/yyyy') AS FechaEnvio,
        FORMAT(t.FechaRegistro, 'dd/MM/yyyy HH:mm') AS FechaRegistro,
        t.IDTransferencia, t.CUITOrigen, t.CtaOrigen, t.CBUOrigen,
        t.CUITDestino, t.CtaDestino, t.CBUDestino, t.Banco, t.Concepto,
        t.destino_id, t.destino_tipo, t.cuenta_tercera_id, t.tercero_proveedor_id,
        d.tipo AS DestinoCatalogoTipo,
        COALESCE(d.razon_social, d.destinos, t.Destino) AS DestinoNombreCatalogo,
        ct.titular AS CuentaTerceroTitular,
        ct.cbu AS CuentaTerceroCBU,
        pt.nombre_tercero AS TerceroProveedorNombre
      FROM dbo.NSFW_Transferencias t
      LEFT JOIN dbo.NSFW_Destinos d ON d.id = t.destino_id
      LEFT JOIN dbo.NSFW_Destinos_CuentasTerceros ct ON ct.id = t.cuenta_tercera_id
      LEFT JOIN dbo.NSFW_Proveedores_Terceros pt ON pt.id = t.tercero_proveedor_id
      ORDER BY t.id DESC
    `);
    res.json({ total: result.recordset.length, transfers: result.recordset });
  } catch (err) {
    console.error('[API] get-transfers error:', err.message);
    res.status(500).json({ error: err.message, transfers: [] });
  }
});

// ─── GET /api/cuentas-financieras/buscar — SBA01 (cuentas contables Tango) ───
app.get('/api/cuentas-financieras/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ resultados: [] });
  try {
    const db = await getPool();
    const result = await db
      .request()
      .input('q', sql.VarChar(200), q)
      .query(`
        SELECT TOP 20
          COD_CTA,
          DESCRIPCIO
        FROM SBA01
        WHERE DESCRIPCIO LIKE '%' + @q + '%'
           OR COD_CTA LIKE '%' + @q + '%'
        ORDER BY DESCRIPCIO
      `);
    res.json({ resultados: result.recordset });
  } catch (err) {
    console.error('[API] cuentas-financieras/buscar error:', err.message);
    res.status(500).json({ error: 'Error al buscar cuentas financieras', resultados: [] });
  }
});

// ─── GET /api/clientes/buscar — Búsqueda en Tango GVA14 ──────────────────────
app.get('/api/clientes/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ resultados: [] });
  try {
    const db = await getPool();
    const result = await db
      .request()
      .input('q', sql.VarChar(200), q)
      .query(`
        SELECT TOP 20 COD_CLIENT, RAZON_SOCI
        FROM GVA14
        WHERE RAZON_SOCI LIKE '%' + @q + '%'
           OR COD_CLIENT LIKE '%' + @q + '%'
        ORDER BY RAZON_SOCI
      `);
    res.json({ resultados: result.recordset });
  } catch (err) {
    console.error('[API] clientes/buscar error:', err.message);
    res.status(500).json({ error: 'Error al conectar con Tango' });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.API_PORT || 3012;
app.listen(PORT, () => {
  console.log(`[API Bridge] 🌐 Servidor REST escuchando en http://localhost:${PORT}`);
  console.log(`[API Bridge] 🗄️  Apuntando a: ${sqlConfig.server}\\${sqlConfig.options.instanceName}/${sqlConfig.database}`);
});
