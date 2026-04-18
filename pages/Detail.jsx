import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Grid, Paper, Typography, TextField, MenuItem, Button,
  IconButton, Container, Alert, AlertTitle, Snackbar, CircularProgress, Chip, Autocomplete,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import PanToolIcon from '@mui/icons-material/PanTool';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import WarningIcon from '@mui/icons-material/Warning';
import usePaymentValidation from '../hooks/usePaymentValidation';
import { getTransferById, normalizeTipoOrigenTransfer as normalizeTipoOrigen } from '../hooks/useTransferAPI';
import { montoToCanonical } from '../utils/moneyFormat';
import { enmascararCBU } from '../utils/validadores';
import MontoTextField from '../components/MontoTextField';

const TIPOS_TX = ['Transferencia', 'Deposito Cheque', 'Deposito Efectivo'];
const ESTADOS = ['Utilizada', 'Disponible'];

const nullSafe = (v) => (v === 'null' || v === null || v === undefined ? '' : String(v));

const labelTipoDestinoCatalogo = (t) => {
  const u = String(t || '').toUpperCase();
  const map = {
    PROVEEDOR: 'Proveedor',
    PROVEEDOR_TERCEROS: 'Proveedor',
    FINANCIERA: 'Financiera',
    FINANCIERO: 'Financiera',
    CLIENTE_FINANCIERO: 'Cliente Fin.',
    CTA_PROPIA: 'Cta. Propia',
  };
  return map[u] ?? (t ? String(t) : '');
};

const chipColorTipoDestino = (t) => {
  const u = String(t || '').toUpperCase();
  if (u === 'PROVEEDOR' || u === 'PROVEEDOR_TERCEROS') return 'primary';
  if (u === 'FINANCIERA' || u === 'FINANCIERO') return 'success';
  if (u === 'CLIENTE_FINANCIERO') return 'warning';
  if (u === 'CTA_PROPIA') return 'secondary';
  return 'default';
};
const normalizeTipo = (t) => (TIPOS_TX.includes(t) ? t : 'Transferencia');
const normalizeEstado = (e) => (e === 'Utilizada' ? 'Utilizada' : 'Disponible');
const todayISO = () => new Date().toISOString().split('T')[0];

/** Convierte DD/MM/YYYY [HH:mm] o YYYY-MM-DD a YYYY-MM-DD (para input type="date") */
const toInputDate = (str) => {
  if (!str) return '';
  const s = String(str).trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split('/');
  if (parts.length !== 3) return s;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

/** Aplica máscara XX-XXXXXXXX-X al CUIT/CUIL */
const applyMaskCuit = (raw) => {
  const d = raw.replace(/[^\d]/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10, 11)}`;
};

const cbuFieldError = (val) => (val && !/^\d{22}$/.test(val) ? '22 dígitos requeridos' : '');
const cuitFieldError = (val) => (val && !/^\d{2}-\d{8}-\d$/.test(val) ? 'Formato: XX-XXXXXXXX-X' : '');

const EMPTY_FORM = {
  id: '', personaAsignada: '', cliente: '', clienteRazonSocial: '', destino: '', usuario: '',
  tipoOrigen: 'CLIENTE',
  codClient: '',
  tipoTransaccion: 'Transferencia', codigoTransferencia: '', monto: '',
  fecha: new Date().toLocaleDateString('es-AR'),
  fechaComprobante: '', fechaEnvio: '', estado: 'Disponible',
  idTransferencia: '', cuitOrigen: '', ctaOrigen: '', cbuOrigen: '',
  cuitDestino: '', ctaDestino: '', cbuDestino: '', banco: '', concepto: '',
  fechaRegistro: todayISO(),
  destinoId: null,
  destinoTipo: '',
  cuentaProveedorTipo: '',
  terceroProveedorId: null,
  cuentaTerceraId: null,
};

/**
 * Mapea datos de OCR (snake_case) o de DB (PascalCase) al estado del formulario.
 * clienteRazonSocial siempre vacío aquí; Cliente en API solo por selección GVA14.
 */
const formFromExtracted = (pd) => {
  const ns = (...keys) => {
    for (const k of keys) {
      const v = nullSafe(pd[k]);
      if (v) return v;
    }
    return '';
  };
  const montoRaw = pd.monto ?? pd.Monto;
  const monto =
    montoRaw === 'null' || montoRaw === null || montoRaw === undefined || montoRaw === ''
      ? ''
      : montoToCanonical(montoRaw);
  return {
    id: ns('ID', 'id'),
    personaAsignada: ns('PersonaAsignada', 'persona_asignada'),
    cliente: '',
    clienteRazonSocial: '',
    tipoOrigen: 'CLIENTE',
    codClient: '',
    destino: ns('Destino', 'cta_destino', 'destino'),
    usuario: ns('Usuario', 'usuario'),
    tipoTransaccion: normalizeTipo(ns('TipoTransaccion', 'tipo_transaccion')),
    codigoTransferencia: ns('CodigoTransferencia', 'codigo_transferencia'),
    monto,
    fecha: ns('FECHA', 'fecha') || new Date().toLocaleDateString('es-AR'),
    fechaComprobante: ns('FechaComprobante', 'fecha_comprobante'),
    fechaEnvio: ns('FechaEnvio', 'fecha_envio'),
    estado: normalizeEstado(ns('Estado', 'estado') || 'Disponible'),
    idTransferencia: ns('IDTransferencia', 'id_transferencia'),
    cuitOrigen: ns('CUITOrigen', 'cuit_origen'),
    ctaOrigen: ns('CtaOrigen', 'cta_origen'),
    cbuOrigen: ns('CBUOrigen', 'cbu_origen'),
    cuitDestino: ns('CUITDestino', 'cuit_destino'),
    ctaDestino: ns('CtaDestino', 'cta_destino'),
    cbuDestino: ns('CBUDestino', 'cbu_destino'),
    banco: ns('Banco', 'banco'),
    concepto: ns('Concepto', 'concepto'),
    fechaRegistro: todayISO(),
    destinoId: null,
    destinoTipo: '',
    cuentaProveedorTipo: '',
    terceroProveedorId: null,
    cuentaTerceraId: null,
  };
};

const formFromTransferRow = (t) => {
  const rawAsig = String(t.destino_tipo ?? '').trim().toUpperCase();
  const cuentaProveedorTipo =
    rawAsig === 'PROPIA' || rawAsig === 'TERCERO' ? rawAsig : '';
  return {
  id: String(t.id),
  personaAsignada: nullSafe(t.PersonaAsignada),
  cliente: '',
  clienteRazonSocial: nullSafe(t.Cliente),
  tipoOrigen: normalizeTipoOrigen(t.TIPO_ORIGEN),
  codClient: nullSafe(t.COD_CLIENT),
  /** Texto del comprobante; la imputación va por destinoId + join en listados */
  destino: nullSafe(t.Destino),
  usuario: nullSafe(t.Usuario),
  tipoTransaccion: normalizeTipo(nullSafe(t.TipoTransaccion)),
  codigoTransferencia: nullSafe(t.CodigoTransferencia),
  monto: t.Monto === null || t.Monto === undefined || t.Monto === '' ? '' : montoToCanonical(t.Monto),
  fecha: nullSafe(t.FECHA) || new Date().toLocaleDateString('es-AR'),
  fechaComprobante: nullSafe(t.FechaComprobante),
  fechaEnvio: nullSafe(t.FechaEnvio),
  estado: normalizeEstado(nullSafe(t.Estado)),
  idTransferencia: nullSafe(t.IDTransferencia),
  cuitOrigen: nullSafe(t.CUITOrigen),
  ctaOrigen: nullSafe(t.CtaOrigen),
  cbuOrigen: nullSafe(t.CBUOrigen),
  cuitDestino: nullSafe(t.CUITDestino),
  ctaDestino: nullSafe(t.CtaDestino),
  cbuDestino: nullSafe(t.CBUDestino),
  banco: nullSafe(t.Banco),
  concepto: nullSafe(t.Concepto),
  fechaRegistro: t.FechaRegistro ? toInputDate(t.FechaRegistro) : todayISO(),
  destinoId: t.destino_id != null && t.destino_id !== '' ? Number(t.destino_id) : null,
  destinoTipo: nullSafe(t.DestinoCatalogoTipo),
  cuentaProveedorTipo,
  terceroProveedorId:
    t.tercero_proveedor_id != null && t.tercero_proveedor_id !== ''
      ? Number(t.tercero_proveedor_id)
      : null,
  cuentaTerceraId:
    t.cuenta_tercera_id != null && t.cuenta_tercera_id !== '' ? Number(t.cuenta_tercera_id) : null,
};
};

/** Normaliza cliente/código/tipo de origen para el payload API */
const formDataForApi = (fd) => ({
  ...fd,
  cliente: (fd.clienteRazonSocial ?? fd.cliente ?? '').trim() || null,
  codClient: (fd.codClient ?? '').trim() || null,
  tipoOrigen: normalizeTipoOrigen(fd.tipoOrigen),
});

const SectionHeader = ({ label }) => (
  <Grid item xs={12}>
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        color: 'text.secondary',
        letterSpacing: '0.08em',
        lineHeight: 1.2,
        mt: 0.5,
        mb: 0,
        borderBottom: 1,
        borderColor: 'divider',
        pb: 0.25,
      }}
    >
      {label}
    </Typography>
  </Grid>
);

const Detail = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: routeId } = useParams();

  const isManualLoad = Boolean(location.state?.isManualLoad);
  const partialDataFromNav = location.state?.partialData;
  const extractedFromNav = location.state?.extractedData;
  const fileMimeFromState = location.state?.fileMimeType || '';

  const passedData =
    extractedFromNav && typeof extractedFromNav === 'object' && Object.keys(extractedFromNav).length
      ? extractedFromNav
      : partialDataFromNav && typeof partialDataFromNav === 'object' && Object.keys(partialDataFromNav).length
        ? partialDataFromNav
        : {};

  const filePreviewUrl = location.state?.filePreviewUrl || null;
  const fileName = location.state?.fileName || '';

  const editingId =
    routeId && routeId !== 'new' && !Number.isNaN(Number(routeId))
      ? Number(routeId)
      : null;

  const [loadError, setLoadError] = useState(null);
  const [loadingTransfer, setLoadingTransfer] = useState(!!editingId);

  const [destinoInput, setDestinoInput] = useState('');
  const [destinoOptions, setDestinoOptions] = useState([]);
  const [destinoLoading, setDestinoLoading] = useState(false);
  const [pickedDestino, setPickedDestino] = useState(null);
  const [cuentasTerceroList, setCuentasTerceroList] = useState([]);
  const destinoSearchRef = useRef(null);

  const mergedDestinoOptions = useMemo(() => {
    if (!pickedDestino) return destinoOptions;
    if (destinoOptions.some((o) => o.id === pickedDestino.id)) return destinoOptions;
    return [pickedDestino, ...destinoOptions];
  }, [destinoOptions, pickedDestino]);

  const [formData, setFormData] = useState(() =>
    Object.keys(passedData).length ? formFromExtracted(passedData) : { ...EMPTY_FORM }
  );

  const [zoom, setZoom] = useState(1);

  const [optionsGva14, setOptionsGva14] = useState([]);
  const [optionsSba01, setOptionsSba01] = useState([]);
  const [loadingOrigen, setLoadingOrigen] = useState(false);
  const [selectedGva14, setSelectedGva14] = useState(null);
  const [selectedSba01, setSelectedSba01] = useState(null);
  const debounceOrigenRef = useRef(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);

  const mergedGvaOptions = useMemo(() => {
    if (!selectedGva14?.COD_CLIENT) return optionsGva14;
    if (optionsGva14.some((o) => o.COD_CLIENT === selectedGva14.COD_CLIENT)) return optionsGva14;
    return [selectedGva14, ...optionsGva14];
  }, [optionsGva14, selectedGva14]);

  const mergedSbaOptions = useMemo(() => {
    if (!selectedSba01?.COD_CTA) return optionsSba01;
    if (optionsSba01.some((o) => o.COD_CTA === selectedSba01.COD_CTA)) return optionsSba01;
    return [selectedSba01, ...optionsSba01];
  }, [optionsSba01, selectedSba01]);

  const isPdf = filePreviewUrl && (
    fileName?.toLowerCase().endsWith('.pdf') ||
    filePreviewUrl.includes('application/pdf') ||
    fileMimeFromState === 'application/pdf'
  );

  const hasPartialReference =
    isManualLoad &&
    partialDataFromNav &&
    typeof partialDataFromNav === 'object' &&
    Object.keys(partialDataFromNav).length > 0;

  useEffect(() => {
    const u = filePreviewUrl;
    return () => {
      if (u && String(u).startsWith('blob:')) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      }
    };
  }, [filePreviewUrl]);

  const fetchDestinoOptions = useCallback(async (q) => {
    setDestinoLoading(true);
    try {
      const params = new URLSearchParams({ activo: 'true', pageSize: '50' });
      if (q && String(q).trim()) params.set('buscar', String(q).trim());
      const res = await fetch(`/api/destinos?${params}`);
      const data = await res.json();
      let items = data.items || [];
      const o = normalizeTipoOrigen(formData.tipoOrigen);
      if (o === 'FINANCIERA' || o === 'CLIENTE_FINANCIERO') {
        items = items.filter((d) => d.tipo === 'PROVEEDOR');
      }
      // CLIENTE (Comercial): todos los destinos, sin filtrar por tipo
      setDestinoOptions(items);
    } catch {
      setDestinoOptions([]);
    } finally {
      setDestinoLoading(false);
    }
  }, [formData.tipoOrigen]);

  useEffect(() => {
    if (destinoSearchRef.current) clearTimeout(destinoSearchRef.current);
    destinoSearchRef.current = setTimeout(() => fetchDestinoOptions(destinoInput), 400);
    return () => clearTimeout(destinoSearchRef.current);
  }, [destinoInput, fetchDestinoOptions]);

  useEffect(() => {
    const o = normalizeTipoOrigen(formData.tipoOrigen);
    if (!formData.destinoId || !formData.destinoTipo) return;
    const ok =
      o === 'FINANCIERA' || o === 'CLIENTE_FINANCIERO'
        ? formData.destinoTipo === 'PROVEEDOR'
        : true;
    if (ok) return;
    setFormData((p) => ({
      ...p,
      destinoId: null,
      destinoTipo: '',
      cuentaTerceraId: null,
      cuentaProveedorTipo: '',
      terceroProveedorId: null,
    }));
    setPickedDestino(null);
    setDestinoInput('');
    setCuentasTerceroList([]);
  }, [formData.tipoOrigen, formData.destinoId, formData.destinoTipo]);

  const loadCuentasForDestino = useCallback(async (destId) => {
    if (!destId) {
      setCuentasTerceroList([]);
      return;
    }
    try {
      const res = await fetch(`/api/destinos/${destId}/cuentas-terceros`);
      const data = await res.json();
      setCuentasTerceroList(data.items || []);
    } catch {
      setCuentasTerceroList([]);
    }
  }, []);

  const handleDestinoSelect = useCallback(
    (_, option) => {
      setPickedDestino(option || null);
      if (!option) {
        setFormData((p) => ({
          ...p,
          destinoId: null,
          destinoTipo: '',
          cuentaTerceraId: null,
          cuentaProveedorTipo: '',
          terceroProveedorId: null,
        }));
        setCuentasTerceroList([]);
        setDestinoInput('');
        return;
      }
      setFormData((p) => ({
        ...p,
        destinoId: option.id,
        destinoTipo: option.tipo,
        cuentaTerceraId: null,
        cuentaProveedorTipo: '',
        terceroProveedorId: null,
      }));
      setDestinoInput(`${option.destinos} — ${option.razon_social || ''}`);
      if (option.tipo === 'FINANCIERA' || option.tipo === 'FINANCIERO') loadCuentasForDestino(option.id);
      else setCuentasTerceroList([]);
    },
    [loadCuentasForDestino]
  );

  useEffect(() => {
    if (!editingId) return;
    if (!formData.destinoId) {
      setPickedDestino(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/destinos/${formData.destinoId}`);
        const data = await r.json();
        if (cancelled || !data.destino) return;
        const d = data.destino;
        setPickedDestino(d);
        setFormData((p) => ({ ...p, destinoTipo: d.tipo }));
        setDestinoInput(`${d.destinos} — ${d.razon_social || ''}`);
        setDestinoOptions((opts) => (opts.some((o) => o.id === d.id) ? opts : [d, ...opts]));
        if (d.tipo === 'FINANCIERA' || d.tipo === 'FINANCIERO') {
          const c = await fetch(`/api/destinos/${d.id}/cuentas-terceros`);
          const cu = await c.json();
          if (!cancelled) setCuentasTerceroList(cu.items || []);
        } else if (!cancelled) setCuentasTerceroList([]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [editingId, formData.destinoId]);

  useEffect(() => {
    if (!editingId) { setLoadingTransfer(false); return; }
    let cancelled = false;
    (async () => {
      setLoadError(null);
      setLoadingTransfer(true);
      try {
        const { transfer } = await getTransferById(editingId);
        if (cancelled || !transfer) return;
        setFormData(formFromTransferRow(transfer));
        setPickedDestino(null);
        const tipo = normalizeTipoOrigen(transfer.TIPO_ORIGEN);
        if (
          (tipo === 'FINANCIERA' || tipo === 'CLIENTE_FINANCIERO') &&
          (nullSafe(transfer.COD_CLIENT) || nullSafe(transfer.Cliente))
        ) {
          setSelectedSba01({
            COD_CTA: nullSafe(transfer.COD_CLIENT),
            DESCRIPCIO: nullSafe(transfer.Cliente),
          });
          setSelectedGva14(null);
        } else if (nullSafe(transfer.COD_CLIENT) || nullSafe(transfer.Cliente)) {
          setSelectedGva14({
            COD_CLIENT: nullSafe(transfer.COD_CLIENT),
            RAZON_SOCI: nullSafe(transfer.Cliente),
          });
          setSelectedSba01(null);
        } else {
          setSelectedGva14(null);
          setSelectedSba01(null);
        }
        setOptionsGva14([]);
        setOptionsSba01([]);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'No se pudo cargar la transferencia.');
      } finally {
        if (!cancelled) setLoadingTransfer(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editingId]);

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCuitChange = (field) => (e) =>
    setFormData((prev) => ({ ...prev, [field]: applyMaskCuit(e.target.value) }));

  const handleCbuChange = (field) => (e) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value.replace(/\D/g, '').slice(0, 22) }));

  const scheduleBuscarGva14 = useCallback((valor) => {
    if (debounceOrigenRef.current) clearTimeout(debounceOrigenRef.current);
    if (!valor || valor.length < 2) {
      setOptionsGva14([]);
      return;
    }
    debounceOrigenRef.current = setTimeout(async () => {
      setLoadingOrigen(true);
      try {
        const res = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(valor)}`);
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const data = await res.json();
        setOptionsGva14(data.resultados || []);
      } catch {
        setOptionsGva14([]);
      } finally {
        setLoadingOrigen(false);
      }
    }, 400);
  }, []);

  const scheduleBuscarSba01 = useCallback((valor) => {
    if (debounceOrigenRef.current) clearTimeout(debounceOrigenRef.current);
    if (!valor || valor.length < 2) {
      setOptionsSba01([]);
      return;
    }
    debounceOrigenRef.current = setTimeout(async () => {
      setLoadingOrigen(true);
      try {
        const res = await fetch(`/api/cuentas-financieras/buscar?q=${encodeURIComponent(valor)}`);
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const data = await res.json();
        setOptionsSba01(data.resultados || []);
      } catch {
        setOptionsSba01([]);
      } finally {
        setLoadingOrigen(false);
      }
    }, 400);
  }, []);

  const handleTipoOrigenChange = useCallback((e) => {
    const raw = e.target.value;
    const nuevo = ['CLIENTE', 'CLIENTE_FINANCIERO', 'FINANCIERA'].includes(raw)
      ? raw
      : normalizeTipoOrigen(raw);
    setFormData((p) => ({
      ...p,
      tipoOrigen: nuevo,
      clienteRazonSocial: '',
      codClient: '',
    }));
    setSelectedGva14(null);
    setSelectedSba01(null);
    setOptionsGva14([]);
    setOptionsSba01([]);
  }, []);

  const fieldErrors = useMemo(() => {
    const e = {};
    const eCbuO = cbuFieldError(formData.cbuOrigen); if (eCbuO) e.cbuOrigen = eCbuO;
    const eCbuD = cbuFieldError(formData.cbuDestino); if (eCbuD) e.cbuDestino = eCbuD;
    const eCuiO = cuitFieldError(formData.cuitOrigen); if (eCuiO) e.cuitOrigen = eCuiO;
    const eCuiD = cuitFieldError(formData.cuitDestino); if (eCuiD) e.cuitDestino = eCuiD;
    return e;
  }, [formData]);

  const validationPayload = useMemo(() => {
    if (!formData.codigoTransferencia) return null;
    return {
      CodigoTransferencia: formData.codigoTransferencia,
      FECHA: formData.fecha,
      FechaComprobante: formData.fechaComprobante,
      FechaEnvio: null,
      Monto: formData.monto,
      Cliente: formData.clienteRazonSocial,
      Destino: formData.destino,
      PersonaAsignada: formData.personaAsignada,
      TipoTransaccion: formData.tipoTransaccion,
      Estado: formData.estado,
      Usuario: formData.usuario,
      TIPO_ORIGEN: normalizeTipoOrigen(formData.tipoOrigen),
      COD_CLIENT: formData.codClient,
    };
  }, [formData]);

  const origenIncomplete = useMemo(
    () =>
      !String(formData.clienteRazonSocial || '').trim() ||
      !String(formData.codClient || '').trim(),
    [formData.clienteRazonSocial, formData.codClient]
  );

  const canSubmitTransfer = useMemo(
    () =>
      Boolean(String(formData.codigoTransferencia || '').trim()) &&
      Boolean(String(formData.monto || '').trim()) &&
      !origenIncomplete,
    [formData.codigoTransferencia, formData.monto, origenIncomplete]
  );

  const handleSaveSuccessNavigate = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const {
    isApproveBlocked, alerts, confidenceScore, statusSuggestion, isDuplicate,
    handleApprove, handleReject, isSaving, saveIntent, saveResult, clearSaveResult,
  } = usePaymentValidation(validationPayload, { editingId, onSaveSuccess: handleSaveSuccessNavigate });

  const handleCancelClick = useCallback(() => setOpenCancelDialog(true), []);
  const handleRejectCancel = useCallback(() => setOpenCancelDialog(false), []);
  const handleConfirmCancel = useCallback(() => {
    setOpenCancelDialog(false);
    navigate('/dashboard');
  }, [navigate]);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  if (loadingTransfer) {
    return (
      <Container sx={{ mt: 6, textAlign: 'center' }}>
        <CircularProgress sx={{ color: '#1A237E' }} />
        <Typography sx={{ mt: 2 }}>Cargando transferencia…</Typography>
      </Container>
    );
  }

  if (loadError) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>
        <Button onClick={() => navigate('/dashboard')}>Volver al listado</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/dashboard')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1A237E' }}>
          Validación de comprobante
          {formData.codigoTransferencia && (
            <Typography component="span" variant="body1" sx={{ ml: 1, color: 'text.secondary' }}>
              — {formData.codigoTransferencia}
            </Typography>
          )}
        </Typography>
        {confidenceScore !== null && (
          <Chip
            label={`Confianza: ${confidenceScore}%`}
            size="small"
            sx={{
              ml: 'auto', fontWeight: 'bold',
              bgcolor: confidenceScore >= 70 ? '#e8f5e9' : confidenceScore >= 40 ? '#fff3e0' : '#ffebee',
              color: confidenceScore >= 70 ? '#2e7d32' : confidenceScore >= 40 ? '#e65100' : '#c62828',
            }}
          />
        )}
      </Box>

      {isManualLoad && (
        <Alert severity="info" sx={{ py: 1 }}>
          <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
            Carga manual
          </Typography>
          <Typography variant="body2">
            Estás cargando esta transferencia manualmente usando el comprobante como referencia.
            {hasPartialReference && (
              <>
                {' '}
                Algunos campos se precompletaron con datos parciales del intento de extracción.{' '}
                <strong>Verificá toda la información antes de guardar.</strong>
              </>
            )}
          </Typography>
        </Alert>
      )}

      {alerts.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {alerts.map((a, i) => (
            <Alert key={i} severity={isDuplicate ? 'error' : 'warning'} sx={{ py: 0.5 }}>{a}</Alert>
          ))}
        </Box>
      )}

      <Grid container spacing={2} sx={{ flexGrow: 1, alignItems: 'stretch' }}>

        <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
          <Paper sx={{
            minHeight: 580,
            height: '100%',
            width: '100%',
            position: 'relative',
            bgcolor: '#e8e8e8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderRadius: 2,
          }}>
            <Box sx={{
              position: 'absolute', top: 12, left: 12,
              bgcolor: 'rgba(0,0,0,0.65)', color: '#fff', px: 1.5, py: 0.4, borderRadius: 1, zIndex: 2,
            }}>
              <Typography variant="caption" fontWeight="bold" letterSpacing={1}>ORIGINAL</Typography>
            </Box>
            <Box sx={{
              position: 'absolute', bottom: 12, right: 12, zIndex: 2,
              display: 'flex', gap: 0.5, bgcolor: 'rgba(255,255,255,0.9)', p: 0.5, borderRadius: 2,
            }}>
              <IconButton size="small" onClick={zoomIn} title="Acercar"><ZoomInIcon /></IconButton>
              <IconButton size="small" onClick={zoomOut} title="Alejar"><ZoomOutIcon /></IconButton>
              <IconButton size="small" onClick={() => setZoom(1)} title="Encuadrar"><PanToolIcon /></IconButton>
            </Box>
            {filePreviewUrl ? (
              isPdf ? (
                <Box component="iframe" src={filePreviewUrl} title="Comprobante PDF"
                  sx={{
                    width: '100%', height: '100%', border: 'none',
                    transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s',
                  }}
                />
              ) : (
                <Box component="img" src={filePreviewUrl} alt="Comprobante"
                  sx={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                    transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s',
                  }}
                />
              )
            ) : (
              <Box sx={{ textAlign: 'center', color: '#9e9e9e' }}>
                <CloudUploadIconPlaceholder />
                <Typography variant="body2" sx={{ mt: 1 }}>Sin imagen cargada</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
          <Paper sx={{
            minHeight: 580,
            height: '100%',
            width: '100%',
            p: 1.5,
            borderRadius: 2,
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
          }}>

            <Typography variant="h6" color="#1A237E" sx={{ mb: 0.5, fontWeight: 'bold', flexShrink: 0 }}>
              Datos
              {statusSuggestion && (
                <Chip
                  label={`Sugerido: ${statusSuggestion}`}
                  size="small"
                  sx={{
                    ml: 1.5,
                    bgcolor: statusSuggestion === 'Utilizada' ? '#e8f5e9' : '#fff3e0',
                    color: statusSuggestion === 'Utilizada' ? '#2e7d32' : '#e65100',
                  }}
                />
              )}
            </Typography>

            <Grid container spacing={1} sx={{ alignContent: 'start' }}>

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="ID registro"
                  name="id"
                  value={formData.id}
                  InputProps={{ readOnly: true }}
                  variant="filled"
                  size="small"
                  margin="none"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Usuario creador"
                  name="usuario"
                  value={formData.usuario}
                  InputProps={{ readOnly: true }}
                  variant="filled"
                  size="small"
                  margin="none"
                />
              </Grid>

              <SectionHeader label="Identificación" />

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Cód. transferencia *"
                  name="codigoTransferencia"
                  value={formData.codigoTransferencia}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                  error={!!isDuplicate}
                  helperText={isDuplicate ? 'Duplicado detectado' : ''}
                  InputProps={{ sx: { fontWeight: 'bold' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="ID transferencia"
                  name="idTransferencia"
                  value={formData.idTransferencia}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>
              <Grid item xs={6}>
                <MontoTextField
                  label="Monto *"
                  name="monto"
                  value={formData.monto}
                  onValueChange={(v) => setFormData((p) => ({ ...p, monto: v }))}
                  margin="none"
                  InputProps={{
                    startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography>,
                    sx: { fontWeight: 'bold' },
                  }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  select
                  label="Tipo transacción"
                  name="tipoTransaccion"
                  value={formData.tipoTransaccion}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                >
                  {TIPOS_TX.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Concepto"
                  name="concepto"
                  value={formData.concepto}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>

              <SectionHeader label="Fechas" />

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Fecha comprobante *"
                  type="date"
                  value={toInputDate(formData.fechaComprobante)}
                  onChange={(e) => setFormData((p) => ({ ...p, fechaComprobante: e.target.value }))}
                  variant="outlined"
                  size="small"
                  margin="none"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Fecha registro"
                  type="date"
                  value={formData.fechaRegistro || todayISO()}
                  onChange={(e) => setFormData((p) => ({ ...p, fechaRegistro: e.target.value }))}
                  variant="outlined"
                  size="small"
                  margin="none"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <SectionHeader label="Origen" />

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Titular cuenta origen"
                  name="personaAsignada"
                  value={formData.personaAsignada}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="CUIT/CUIL origen"
                  value={formData.cuitOrigen}
                  onChange={handleCuitChange('cuitOrigen')}
                  variant="outlined"
                  size="small"
                  margin="none"
                  error={!!fieldErrors.cuitOrigen}
                  helperText={fieldErrors.cuitOrigen || ''}
                  inputProps={{ maxLength: 13 }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Cuenta origen"
                  name="ctaOrigen"
                  value={formData.ctaOrigen}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="CBU origen"
                  value={formData.cbuOrigen}
                  onChange={handleCbuChange('cbuOrigen')}
                  variant="outlined"
                  size="small"
                  margin="none"
                  error={!!fieldErrors.cbuOrigen}
                  helperText={fieldErrors.cbuOrigen || ''}
                  inputProps={{ maxLength: 22 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Banco / Billetera"
                  name="banco"
                  value={formData.banco}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>

              <SectionHeader label="Origen de la transferencia" />

              <Grid item xs={12}>
                <FormControl component="fieldset" variant="standard" sx={{ width: '100%' }}>
                  <FormLabel component="legend" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    Tipo de origen
                  </FormLabel>
                  <RadioGroup row value={formData.tipoOrigen} onChange={handleTipoOrigenChange}>
                    <FormControlLabel value="CLIENTE" control={<Radio size="small" />} label="Comercial (GVA14)" />
                    <FormControlLabel
                      value="CLIENTE_FINANCIERO"
                      control={<Radio size="small" />}
                      label="Cliente Financiero (SBA01)"
                    />
                    <FormControlLabel
                      value="FINANCIERA"
                      control={<Radio size="small" />}
                      label="Financiera (SBA01)"
                    />
                  </RadioGroup>
                </FormControl>
              </Grid>

              {formData.tipoOrigen === 'CLIENTE' && (
                <Grid item xs={12}>
                  <Autocomplete
                    options={mergedGvaOptions}
                    loading={loadingOrigen}
                    value={selectedGva14}
                    onChange={(_, v) => {
                      setSelectedGva14(v);
                      if (v) {
                        setFormData((p) => ({
                          ...p,
                          tipoOrigen: 'CLIENTE',
                          clienteRazonSocial: v.RAZON_SOCI ?? '',
                          codClient: v.COD_CLIENT != null ? String(v.COD_CLIENT) : '',
                        }));
                      } else {
                        setFormData((p) => ({
                          ...p,
                          clienteRazonSocial: '',
                          codClient: '',
                        }));
                      }
                    }}
                    onInputChange={(_, v, reason) => {
                      if (reason === 'input') scheduleBuscarGva14(v);
                    }}
                    filterOptions={(x) => x}
                    getOptionLabel={(o) => o.RAZON_SOCI || ''}
                    isOptionEqualToValue={(a, b) => a?.COD_CLIENT === b?.COD_CLIENT}
                    renderOption={(props, option) => (
                      <li {...props} key={String(option.COD_CLIENT)}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{option.RAZON_SOCI}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Código: {option.COD_CLIENT}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Origen comercial (GVA14)"
                        size="small"
                        margin="none"
                        helperText="Buscá por razón social o código (mín. 2 caracteres)"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingOrigen ? <CircularProgress color="inherit" size={18} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>
              )}

              {formData.tipoOrigen === 'CLIENTE_FINANCIERO' && (
                <Grid item xs={12}>
                  <Autocomplete
                    options={mergedSbaOptions}
                    loading={loadingOrigen}
                    value={selectedSba01}
                    onChange={(_, v) => {
                      setSelectedSba01(v);
                      if (v) {
                        setFormData((p) => ({
                          ...p,
                          tipoOrigen: 'CLIENTE_FINANCIERO',
                          clienteRazonSocial: v.DESCRIPCIO ?? '',
                          codClient: v.COD_CTA != null ? String(v.COD_CTA) : '',
                        }));
                      } else {
                        setFormData((p) => ({
                          ...p,
                          clienteRazonSocial: '',
                          codClient: '',
                        }));
                      }
                    }}
                    onInputChange={(_, v, reason) => {
                      if (reason === 'input') scheduleBuscarSba01(v);
                    }}
                    filterOptions={(x) => x}
                    getOptionLabel={(o) => o.DESCRIPCIO || ''}
                    isOptionEqualToValue={(a, b) => a?.COD_CTA === b?.COD_CTA}
                    renderOption={(props, option) => (
                      <li {...props} key={String(option.COD_CTA)}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{option.DESCRIPCIO}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Cuenta: {option.COD_CTA}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Cliente Financiero (SBA01)"
                        size="small"
                        margin="none"
                        helperText="Buscá por descripción o código de cuenta (mín. 2 caracteres)"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingOrigen ? <CircularProgress color="inherit" size={18} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>
              )}

              {formData.tipoOrigen === 'FINANCIERA' && (
                <Grid item xs={12}>
                  <Autocomplete
                    options={mergedSbaOptions}
                    loading={loadingOrigen}
                    value={selectedSba01}
                    onChange={(_, v) => {
                      setSelectedSba01(v);
                      if (v) {
                        setFormData((p) => ({
                          ...p,
                          tipoOrigen: 'FINANCIERA',
                          clienteRazonSocial: v.DESCRIPCIO ?? '',
                          codClient: v.COD_CTA != null ? String(v.COD_CTA) : '',
                        }));
                      } else {
                        setFormData((p) => ({
                          ...p,
                          clienteRazonSocial: '',
                          codClient: '',
                        }));
                      }
                    }}
                    onInputChange={(_, v, reason) => {
                      if (reason === 'input') scheduleBuscarSba01(v);
                    }}
                    filterOptions={(x) => x}
                    getOptionLabel={(o) => o.DESCRIPCIO || ''}
                    isOptionEqualToValue={(a, b) => a?.COD_CTA === b?.COD_CTA}
                    renderOption={(props, option) => (
                      <li {...props} key={String(option.COD_CTA)}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{option.DESCRIPCIO}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Cuenta: {option.COD_CTA}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Cuenta Financiera (SBA01)"
                        size="small"
                        margin="none"
                        helperText="Buscá por descripción o código de cuenta (mín. 2 caracteres)"
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {loadingOrigen ? <CircularProgress color="inherit" size={18} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>
              )}

              {String(formData.codClient || '').trim() && String(formData.clienteRazonSocial || '').trim() ? (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ py: 1 }}>
                    <AlertTitle sx={{ mb: 0.5 }}>Origen seleccionado</AlertTitle>
                    <Typography variant="body2">
                      <strong>Tipo:</strong>{' '}
                      {formData.tipoOrigen === 'CLIENTE'
                        ? 'Comercial'
                        : formData.tipoOrigen === 'CLIENTE_FINANCIERO'
                          ? 'Cliente Financiero'
                          : 'Financiera'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Código:</strong> {formData.codClient}
                    </Typography>
                    <Typography variant="body2">
                      <strong>
                        {formData.tipoOrigen === 'CLIENTE'
                          ? 'Razón social (comercial)'
                          : 'Nombre/Descripción'}
                        :
                      </strong>{' '}
                      {formData.clienteRazonSocial}
                    </Typography>
                  </Alert>
                </Grid>
              ) : null}

              {origenIncomplete ? (
                <Grid item xs={12}>
                  <Alert severity="warning" sx={{ py: 0.75 }}>
                    Elegí un origen en el buscador: se requiere código y nombre para guardar.
                  </Alert>
                </Grid>
              ) : null}

              <SectionHeader label="Destino" />

              <Grid item xs={12}>
                <Autocomplete
                  options={mergedDestinoOptions}
                  loading={destinoLoading}
                  getOptionLabel={(o) =>
                    `${o.destinos} — ${o.razon_social || ''} (${labelTipoDestinoCatalogo(o.tipo)})`
                  }
                  isOptionEqualToValue={(a, b) => a?.id === b?.id}
                  value={pickedDestino}
                  onChange={handleDestinoSelect}
                  inputValue={destinoInput}
                  onInputChange={(_, v, reason) => {
                    if (reason === 'input') setDestinoInput(v);
                  }}
                  filterOptions={(x) => x}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={labelTipoDestinoCatalogo(option.tipo)}
                            size="small"
                            color={chipColorTipoDestino(option.tipo)}
                          />
                          <Typography variant="body2" fontWeight="bold">{option.destinos}</Typography>
                        </Box>
                        {option.razon_social ? (
                          <Typography variant="caption" color="text.secondary">{option.razon_social}</Typography>
                        ) : null}
                        {option.codigo_proveedor_tango ? (
                          <Typography variant="caption" color="text.secondary">
                            Cód. Tango: {option.codigo_proveedor_tango}
                          </Typography>
                        ) : null}
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Destino de imputación (catálogo)"
                      size="small"
                      margin="none"
                      helperText="A quién imputamos la transferencia (NSFW_Destinos)"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {destinoLoading ? <CircularProgress color="inherit" size={18} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
              {(formData.destinoTipo === 'FINANCIERA' || formData.destinoTipo === 'FINANCIERO') && (
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    label="Cuenta de tercero"
                    size="small"
                    margin="none"
                    value={formData.cuentaTerceraId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormData((p) => ({
                        ...p,
                        cuentaTerceraId: v === '' ? null : Number(v),
                      }));
                    }}
                    helperText={
                      cuentasTerceroList.filter((c) => c.activo).length === 0
                        ? 'No hay cuentas de terceros activas para este destino'
                        : 'Opcional: cuenta específica del beneficiario'
                    }
                  >
                    <MenuItem value="">
                      <em>Sin cuenta específica</em>
                    </MenuItem>
                    {cuentasTerceroList.filter((c) => c.activo).map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.titular} — {enmascararCBU(c.cbu)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Destino (según comprobante)"
                  name="destino"
                  value={formData.destino}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                  helperText="Texto que figura en el comprobante; independiente del destino de imputación"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="CUIT/CUIL destino"
                  value={formData.cuitDestino}
                  onChange={handleCuitChange('cuitDestino')}
                  variant="outlined"
                  size="small"
                  margin="none"
                  error={!!fieldErrors.cuitDestino}
                  helperText={fieldErrors.cuitDestino || ''}
                  inputProps={{ maxLength: 13 }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Cuenta destino"
                  name="ctaDestino"
                  value={formData.ctaDestino}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="CBU destino"
                  value={formData.cbuDestino}
                  onChange={handleCbuChange('cbuDestino')}
                  variant="outlined"
                  size="small"
                  margin="none"
                  error={!!fieldErrors.cbuDestino}
                  helperText={fieldErrors.cbuDestino || ''}
                  inputProps={{ maxLength: 22 }}
                />
              </Grid>

              <SectionHeader label="Estado" />

              <Grid item xs={6}>
                <TextField
                  fullWidth
                  select
                  label="Estado"
                  name="estado"
                  value={formData.estado}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  margin="none"
                >
                  {ESTADOS.map((est) => <MenuItem key={est} value={est}>{est}</MenuItem>)}
                </TextField>
              </Grid>

            </Grid>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{
        p: 2, display: 'flex', justifyContent: 'flex-end', gap: 2,
        alignItems: 'center', flexWrap: 'wrap', borderRadius: 2, boxShadow: 2,
      }}>
        <Button
          variant="outlined"
          color="error"
          size="large"
          startIcon={<CancelIcon />}
          disabled={isSaving}
          sx={{ fontWeight: 'bold' }}
          onClick={handleCancelClick}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="success"
          size="large"
          startIcon={
            saveIntent === 'disponible' ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
          disabled={isSaving || !canSubmitTransfer}
          sx={{ fontWeight: 'bold' }}
          onClick={() => handleReject(formDataForApi(formData))}
        >
          {saveIntent === 'disponible' ? 'Guardando…' : 'Guardar (Disponible)'}
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={
            saveIntent === 'utilizada' ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <CheckCircleIcon />
            )
          }
          disabled={isSaving || !canSubmitTransfer || isApproveBlocked}
          sx={{ fontWeight: 'bold' }}
          onClick={() => handleApprove(formDataForApi(formData))}
        >
          {isApproveBlocked
            ? 'Bloqueado'
            : saveIntent === 'utilizada'
              ? 'Guardando…'
              : 'Guardar (Utilizada)'}
        </Button>
      </Paper>

      <Dialog open={openCancelDialog} onClose={handleRejectCancel} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            Cancelar carga
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            ¿Seguro que querés cancelar? Los datos ingresados no se guardarán.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleRejectCancel} color="primary">
            No, continuar editando
          </Button>
          <Button onClick={handleConfirmCancel} color="error" variant="contained" autoFocus>
            Sí, cancelar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!saveResult}
        autoHideDuration={5000}
        onClose={clearSaveResult}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {saveResult && (
          <Alert onClose={clearSaveResult} severity={saveResult.success ? 'success' : 'error'} sx={{ width: '100%' }}>
            {saveResult.message}
          </Alert>
        )}
      </Snackbar>
    </Container>
  );
};

const CloudUploadIconPlaceholder = () => (
  <Box sx={{ fontSize: 64, color: '#bdbdbd' }}>
    <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor">
      <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
    </svg>
  </Box>
);

export default Detail;
