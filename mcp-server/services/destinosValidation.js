/**
 * Validaciones para el módulo NSFW_Destinos / cuentas terceros.
 */

import sql from 'mssql';

export function normalizarCUITDigits(cuit) {
  if (cuit == null || cuit === '') return '';
  return String(cuit).replace(/\D/g, '').slice(0, 11);
}

export function validarCUIT(cuit) {
  if (cuit == null || String(cuit).trim() === '') {
    return { valido: true, error: null };
  }
  const d = normalizarCUITDigits(cuit);
  if (d.length !== 11) {
    return { valido: false, error: 'CUIT debe tener 11 dígitos numéricos.' };
  }
  return { valido: true, error: null };
}

export function normalizarCBU(cbu) {
  if (cbu == null || cbu === '') return '';
  return String(cbu).replace(/\D/g, '').slice(0, 22);
}

export function validarCBU(cbu, { obligatorio = false } = {}) {
  if (cbu == null || String(cbu).trim() === '') {
    if (obligatorio) return { valido: false, error: 'CBU es obligatorio.' };
    return { valido: true, error: null };
  }
  const d = normalizarCBU(cbu);
  if (d.length !== 22) {
    return { valido: false, error: 'CBU debe tener exactamente 22 dígitos.' };
  }
  return { valido: true, error: null };
}

const TIPOS_DESTINO = [
  'PROVEEDOR',
  'FINANCIERA',
  'CLIENTE_FINANCIERO',
  'CTA_PROPIA',
];

export function validarTipoDestino(tipo) {
  if (!tipo) {
    return {
      valido: false,
      error: 'El tipo de destino es requerido',
    };
  }
  if (!TIPOS_DESTINO.includes(tipo)) {
    return {
      valido: false,
      error: `Tipo de destino inválido. Debe ser uno de: ${TIPOS_DESTINO.join(', ')}`,
    };
  }
  return { valido: true, error: null };
}

/**
 * Evita duplicar CUIT entre destinos activos (comparación por dígitos).
 */
export async function validarDestinoUnico(pool, cuit, idExcluir = null) {
  const digits = normalizarCUITDigits(cuit);
  if (digits.length !== 11) {
    return { valido: true, error: null, destinoExistente: null };
  }

  const req = pool.request().input('cuit11', sql.NVarChar(11), digits);
  let query = `
    SELECT TOP 1 id, destinos, razon_social, cuit, tipo
    FROM dbo.NSFW_Destinos
    WHERE activo = 1
      AND LEN(REPLACE(REPLACE(ISNULL(cuit, ''), '-', ''), ' ', '')) >= 11
      AND LEFT(REPLACE(REPLACE(ISNULL(cuit, ''), '-', ''), ' ', ''), 11) = @cuit11
  `;
  if (idExcluir != null && idExcluir !== '' && !Number.isNaN(Number(idExcluir))) {
    req.input('ex', sql.Int, Number(idExcluir));
    query += ' AND id <> @ex';
  }
  const result = await req.query(query);
  if (result.recordset.length > 0) {
    return {
      valido: false,
      error: 'Ya existe un destino activo con el mismo CUIT.',
      destinoExistente: result.recordset[0],
    };
  }
  return { valido: true, error: null, destinoExistente: null };
}
