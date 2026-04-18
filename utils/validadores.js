/** Utilidades CUIT/CBU para UI (Argentina). */

export function limpiarCUIT(cuitFormateado) {
  if (cuitFormateado == null || cuitFormateado === '') return '';
  return String(cuitFormateado).replace(/\D/g, '').slice(0, 11);
}

export function formatearCUIT(cuit) {
  const d = limpiarCUIT(cuit);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10, 11)}`;
}

export function validarCUITCliente(cuit) {
  if (cuit == null || String(cuit).trim() === '') return { valido: true, error: null };
  const d = limpiarCUIT(cuit);
  if (d.length !== 11) return { valido: false, error: 'CUIT: 11 dígitos requeridos.' };
  return { valido: true, error: null };
}

export function limpiarCBU(cbu) {
  if (cbu == null || cbu === '') return '';
  return String(cbu).replace(/\D/g, '').slice(0, 22);
}

/** Visualización: grupos de 4 dígitos. */
export function formatearCBU(cbu) {
  const d = limpiarCBU(cbu);
  if (!d) return '';
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function validarCBUCliente(cbu, { obligatorio = false } = {}) {
  if (cbu == null || String(cbu).trim() === '') {
    if (obligatorio) return { valido: false, error: 'CBU obligatorio.' };
    return { valido: true, error: null };
  }
  const d = limpiarCBU(cbu);
  if (d.length !== 22) return { valido: false, error: 'CBU: exactamente 22 dígitos.' };
  return { valido: true, error: null };
}

export function enmascararCBU(cbu) {
  const d = limpiarCBU(cbu);
  if (d.length <= 8) return d || '—';
  return `${d.slice(0, 8)}…`;
}
