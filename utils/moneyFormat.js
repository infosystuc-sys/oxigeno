/**
 * Formato de importes es-AR: miles con punto, decimales con coma, siempre 2 decimales.
 * Valor canónico interno y para API: string "1234567.89" (punto decimal, sin miles).
 */

/** Normaliza número o string (con coma o punto) a canónico "########.##" o "". */
export function montoToCanonical(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return (Math.round(v * 100) / 100).toFixed(2);
  }
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return '';
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Muestra canónico como "1.234.567,89" (sin símbolo $). */
export function formatMontoEsAR(canonicalStr) {
  const c = montoToCanonical(canonicalStr);
  if (c === '') return '';
  const n = parseFloat(c);
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Interpreta texto ingresado por el usuario (es-AR o simple) → canónico o "". */
export function parseMontoInput(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().replace(/\s/g, '');
  if (s === '') return '';
  return montoToCanonical(s);
}

/** Listados: $ + formato es-AR, 2 decimales. */
export function formatMontoConSimbolo(value) {
  const c = montoToCanonical(value);
  const n = c === '' ? 0 : parseFloat(c);
  if (!Number.isFinite(n)) {
    return '$0,00';
  }
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
