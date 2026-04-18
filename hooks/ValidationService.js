/**
 * ValidationService.js — Servicio puro de lógica de negocio anti-fraude.
 * Sin side-effects ni estado React. Testeable con unit tests.
 */

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
const parseDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const diffInHours = (dateA, dateB) => Math.abs(dateA - dateB) / (1000 * 60 * 60);

const calcConfidenceScore = (data, alerts) => {
  const criticalFields = ['CodigoTransferencia', 'Monto', 'Cliente', 'Destino', 'FechaComprobante'];
  const optionalFields  = ['PersonaAsignada', 'FechaEnvio', 'TipoTransaccion'];
  let score = 100;
  criticalFields.forEach((f) => { if (!data[f] || data[f] === 'null') score -= 20; });
  optionalFields.forEach((f)  => { if (!data[f] || data[f] === 'null') score -= 5; });
  score -= alerts.length * 10;
  return Math.max(0, Math.min(100, score));
};

// ─── REGLAS ───────────────────────────────────────────────────────────────────
const checkDuplicate = (codigo, records) => {
  if (!codigo || codigo === 'null') return { isDuplicate: false, alert: 'CodigoTransferencia ausente.' };
  const found = records.some((r) => String(r.CodigoTransferencia) === String(codigo));
  return { isDuplicate: found, alert: found ? `Código ${codigo} ya registrado — posible DUPLICADO.` : null };
};

const checkTemporalIntegrity = (fechaSistema, fechaComprobante) => {
  const dS = parseDate(fechaSistema), dC = parseDate(fechaComprobante);
  if (!dS || !dC) return { isSuspect: false, alert: 'No se pudo verificar integridad temporal.' };
  if (dC < dS && diffInHours(dS, dC) > 72)
    return { isSuspect: true, alert: `FechaComprobante (${fechaComprobante}) supera las 72hs de antigüedad.` };
  return { isSuspect: false, alert: null };
};

const checkMonto = (monto) => {
  if (monto === null || monto === undefined || monto === 'null')
    return { isInvalid: true, alert: 'Monto no detectado — lectura fallida.' };
  const val = parseFloat(monto);
  if (isNaN(val) || val <= 0)
    return { isInvalid: true, alert: `Monto inválido (${monto}). Debe ser mayor a cero.` };
  return { isInvalid: false, alert: null };
};

const checkHeuristicManipulation = (fechaSistema, fechaEnvio, fechaComprobante) => {
  const alerts = [];
  const dS = parseDate(fechaSistema), dE = parseDate(fechaEnvio), dC = parseDate(fechaComprobante);
  if (dE && dS && dE > dS) alerts.push(`FechaEnvio (${fechaEnvio}) es posterior a hoy — posible manipulación.`);
  if (dE && dC && dE < dC) alerts.push(`FechaEnvio (${fechaEnvio}) anterior a FechaComprobante (${fechaComprobante}) — incoherente.`);
  return { isManipulated: alerts.length > 0, alerts };
};

// ─── VALIDACIÓN PRINCIPAL ─────────────────────────────────────────────────────
const validate = (extractedData, historicalRecords = []) => {
  const allAlerts = [];
  let statusSuggestion = 'Disponible';
  let blockApproval = false;

  const { isDuplicate, alert: a1 } = checkDuplicate(extractedData.CodigoTransferencia, historicalRecords);
  if (a1) allAlerts.push(a1);
  if (isDuplicate) {
    statusSuggestion = 'Disponible';
    blockApproval = true;
  }

  const { isSuspect, alert: a2 } = checkTemporalIntegrity(extractedData.FECHA, extractedData.FechaComprobante);
  if (a2) allAlerts.push(a2);
  if (isSuspect && !blockApproval) statusSuggestion = 'Disponible';

  const { isInvalid, alert: a3 } = checkMonto(extractedData.Monto);
  if (a3) allAlerts.push(a3);
  if (isInvalid) {
    statusSuggestion = 'Disponible';
    blockApproval = true;
  }

  const { isManipulated, alerts: hAlerts } = checkHeuristicManipulation(
    extractedData.FECHA, extractedData.FechaEnvio, extractedData.FechaComprobante
  );
  allAlerts.push(...hAlerts);
  if (isManipulated && !blockApproval) statusSuggestion = 'Disponible';

  const isValid = !isDuplicate && !isInvalid;
  if (isValid && !isSuspect && !isManipulated) statusSuggestion = 'Utilizada';

  return {
    isValid,
    statusSuggestion,
    alerts: allAlerts,
    confidenceScore: calcConfidenceScore(extractedData, allAlerts),
    isDuplicate,
    blockApproval,
  };
};

const ValidationService = { validate, _internal: { checkDuplicate, checkTemporalIntegrity, checkMonto, checkHeuristicManipulation } };
export default ValidationService;
