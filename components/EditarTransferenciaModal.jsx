import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Alert from '@mui/material/Alert';
import {
  updateTransfer,
  normalizeTipoOrigenTransfer as normalizeTipoOrigen,
  sanitizeTransferWritePayload,
} from '../hooks/useTransferAPI';
import { useMontoInput } from '../hooks/useMontoInput';
import { montoToCanonical } from '../utils/moneyFormat';

// ── helpers ───────────────────────────────────────────────────────────────────
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

const toInputDate = (str) => {
  if (!str) return '';
  const s = String(str).trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split('/');
  if (parts.length !== 3) return s;
  const [d, m, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const initForm = (t) => {
  const rawAsig = String(t.destino_tipo ?? '').trim().toUpperCase();
  const destinoTipoAsignacion =
    rawAsig === 'PROPIA' || rawAsig === 'TERCERO' ? rawAsig : '';
  return {
  id:                  t.id,
  codigo_transferencia: t.CodigoTransferencia ?? '',
  id_transferencia:    t.IDTransferencia     ?? '',
  monto:               montoToCanonical(t.Monto ?? ''),
  concepto:            t.Concepto            ?? '',
  fecha_comprobante:   toInputDate(t.FechaComprobante),
  fecha_registro:      toInputDate(t.FechaRegistro),
  persona_asignada:    t.PersonaAsignada     ?? '',
  cuit_origen:         t.CUITOrigen          ?? '',
  cta_origen:          t.CtaOrigen           ?? '',
  cbu_origen:          t.CBUOrigen           ?? '',
  banco:               t.Banco               ?? '',
  /** Texto del comprobante (columna Destino en BD); independiente del catálogo */
  destino_comprobante: t.Destino ?? '',
  destino_id:          t.destino_id != null && t.destino_id !== '' ? Number(t.destino_id) : null,
  destino_tipo:        destinoTipoAsignacion,
  tercero_proveedor_id:
    t.tercero_proveedor_id != null && t.tercero_proveedor_id !== ''
      ? Number(t.tercero_proveedor_id)
      : null,
  cuenta_tercera_id:   t.cuenta_tercera_id != null && t.cuenta_tercera_id !== '' ? Number(t.cuenta_tercera_id) : null,
  cuit_destino:        t.CUITDestino         ?? '',
  cta_destino:         t.CtaDestino          ?? '',
  cbu_destino:         t.CBUDestino          ?? '',
  tipo_origen:         normalizeTipoOrigen(t.TIPO_ORIGEN),
  cod_client:          t.COD_CLIENT ?? '',
  /** Texto: RAZON_SOCI (GVA14) o DESCRIPCIO (SBA01) según tipo_origen */
  cliente_razon_social: t.Cliente ?? '',
  // preserved for API payload
  Estado:           t.Estado          ?? 'Disponible',
  TipoTransaccion:  t.TipoTransaccion ?? 'Transferencia',
  FECHA:            t.FECHA,
  Usuario:          t.Usuario,
};
};

const buildApiPayload = (form) =>
  sanitizeTransferWritePayload({
    CodigoTransferencia: form.codigo_transferencia,
    IDTransferencia: form.id_transferencia || null,
    Monto: form.monto,
    Concepto: form.concepto || null,
    FechaComprobante: form.fecha_comprobante || null,
    FechaRegistro: form.fecha_registro || null,
    PersonaAsignada: form.persona_asignada || null,
    CUITOrigen: form.cuit_origen || null,
    CtaOrigen: form.cta_origen || null,
    CBUOrigen: form.cbu_origen || null,
    Banco: form.banco || null,
    Destino: form.destino_comprobante || null,
    CUITDestino: form.cuit_destino || null,
    CtaDestino: form.cta_destino || null,
    CBUDestino: form.cbu_destino || null,
    Cliente: form.cliente_razon_social || null,
    COD_CLIENT: form.cod_client ? String(form.cod_client).trim() || null : null,
    TIPO_ORIGEN: normalizeTipoOrigen(form.tipo_origen),
    Estado: form.Estado,
    TipoTransaccion: form.TipoTransaccion,
    FECHA: form.FECHA,
    Usuario: form.Usuario,
    destino_id: form.destino_id ?? null,
    destino_tipo: form.destino_tipo || null,
    tercero_proveedor_id: form.tercero_proveedor_id ?? null,
    cuenta_tercera_id: form.cuenta_tercera_id ?? null,
    operacion: form.operacion || null,
    Id_transferencia: form.id_transferencia || null,
  });

const buildUpdatedRow = (form, destinosCatalogo = []) => {
  const dest = destinosCatalogo.find((d) => d.id === form.destino_id);
  return {
    id:                  form.id,
    CodigoTransferencia: form.codigo_transferencia,
    IDTransferencia:     form.id_transferencia,
    Monto:               form.monto,
    Concepto:            form.concepto,
    FechaComprobante:    form.fecha_comprobante,
    FechaRegistro:       form.fecha_registro,
    PersonaAsignada:     form.persona_asignada,
    CUITOrigen:          form.cuit_origen,
    CtaOrigen:           form.cta_origen,
    CBUOrigen:           form.cbu_origen,
    Banco:               form.banco,
    Destino:             form.destino_comprobante,
    CUITDestino:         form.cuit_destino,
    CtaDestino:          form.cta_destino,
    CBUDestino:          form.cbu_destino,
    Cliente:             form.cliente_razon_social,
    COD_CLIENT:          form.cod_client ?? null,
    TIPO_ORIGEN:         normalizeTipoOrigen(form.tipo_origen),
    Estado:              form.Estado,
    TipoTransaccion:     form.TipoTransaccion,
    FECHA:               form.FECHA,
    FechaEnvio:          null,
    Usuario:             form.Usuario,
    destino_id:          form.destino_id ?? null,
    destino_tipo:        form.destino_tipo ?? null,
    tercero_proveedor_id: form.tercero_proveedor_id ?? null,
    cuenta_tercera_id:   form.cuenta_tercera_id ?? null,
    DestinoCatalogoTipo: dest ? dest.tipo : null,
    DestinoNombreCatalogo: dest ? (dest.razon_social || dest.destinos) : null,
  };
};

// ── style constants ───────────────────────────────────────────────────────────
const INPUT_BASE = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '0.5px solid #DDDDDD', borderRadius: 8,
  color: '#3D3D3D', background: '#FFFFFF',
  outline: 'none', boxSizing: 'border-box',
  margin: 0, fontFamily: 'inherit',
};

const INPUT_READONLY = {
  ...INPUT_BASE,
  background: '#F5F5F5',
  color: '#939393',
};

const INPUT_MONTO = {
  ...INPUT_BASE,
  textAlign: 'right',
};

const focusIn  = (e) => { e.target.style.borderColor = '#553278'; };
const focusOut = (e) => { e.target.style.borderColor = '#DDDDDD'; };

// ── small presentational helpers ──────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 11, color: '#939393', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 12, marginTop: 24,
    borderBottom: '0.5px solid #E0E0E0', paddingBottom: 6,
  }}>
    {children}
  </div>
);

const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 12, color: '#939393', marginBottom: 4 }}>{children}</div>
);

// ── main component ─────────────────────────────────────────────────────────────
const EditarTransferenciaModal = ({ transferencia, onClose, onGuardado }) => {
  const [form,      setForm]      = useState(() => initForm(transferencia));
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState(null);

  const [optionsGva14, setOptionsGva14] = useState([]);
  const [optionsSba01, setOptionsSba01] = useState([]);
  const [loadingOrigen, setLoadingOrigen] = useState(false);
  const [selectedGva14, setSelectedGva14] = useState(null);
  const [selectedSba01, setSelectedSba01] = useState(null);
  const debounceOrigenRef = useRef(null);

  const [destinosCatalogo, setDestinosCatalogo] = useState([]);
  const [pickedDestino, setPickedDestino] = useState(null);
  const [cuentasTerceras, setCuentasTerceras] = useState([]);
  const [loadingDestinos, setLoadingDestinos] = useState(false);

  const mergedDestinoOptions = useMemo(() => {
    const o = normalizeTipoOrigen(form.tipo_origen);
    let base = destinosCatalogo;
    if (o === 'FINANCIERA' || o === 'CLIENTE_FINANCIERO') {
      base = base.filter((d) => d.tipo === 'PROVEEDOR');
    }
    if (!pickedDestino) return base;
    if (base.some((x) => x.id === pickedDestino.id)) return base;
    return [pickedDestino, ...base];
  }, [destinosCatalogo, pickedDestino, form.tipo_origen]);

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

  const loadCuentasTerceras = useCallback(async (destinoId) => {
    if (!destinoId) {
      setCuentasTerceras([]);
      return;
    }
    try {
      const res = await fetch(`/api/destinos/${destinoId}/cuentas-terceros`);
      const data = await res.json();
      setCuentasTerceras(data.items || []);
    } catch {
      setCuentasTerceras([]);
    }
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoadingDestinos(true);
      try {
        const res = await fetch('/api/destinos?activo=true&pageSize=200');
        const data = await res.json();
        if (!c) setDestinosCatalogo(data.items || []);
      } catch {
        if (!c) setDestinosCatalogo([]);
      } finally {
        if (!c) setLoadingDestinos(false);
      }
    })();
    return () => { c = true; };
  }, []);

  useEffect(() => {
    const tipo = normalizeTipoOrigen(transferencia.TIPO_ORIGEN);
    if (
      (tipo === 'FINANCIERA' || tipo === 'CLIENTE_FINANCIERO') &&
      (transferencia.COD_CLIENT || transferencia.Cliente)
    ) {
      setSelectedSba01({
        COD_CTA: transferencia.COD_CLIENT ?? '',
        DESCRIPCIO: transferencia.Cliente ?? '',
      });
      setSelectedGva14(null);
    } else if (transferencia.COD_CLIENT || transferencia.Cliente) {
      setSelectedGva14({
        COD_CLIENT: transferencia.COD_CLIENT ?? '',
        RAZON_SOCI: transferencia.Cliente ?? '',
      });
      setSelectedSba01(null);
    } else {
      setSelectedGva14(null);
      setSelectedSba01(null);
    }
    setOptionsGva14([]);
    setOptionsSba01([]);
  }, [transferencia.id, transferencia.TIPO_ORIGEN, transferencia.COD_CLIENT, transferencia.Cliente]);

  useEffect(() => {
    const did = form.destino_id;
    if (!did) {
      setPickedDestino(null);
      setCuentasTerceras([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/destinos/${did}`);
        const data = await r.json();
        if (cancelled || !data.destino) return;
        setPickedDestino(data.destino);
        if (data.destino.tipo === 'FINANCIERA' || data.destino.tipo === 'FINANCIERO') {
          await loadCuentasTerceras(did);
        } else if (!cancelled) setCuentasTerceras([]);
      } catch {
        if (!cancelled) setPickedDestino(null);
      }
    })();
    return () => { cancelled = true; };
  }, [form.destino_id, loadCuentasTerceras]);

  const handleDestinoCatalogChange = useCallback((_, newVal) => {
    if (!newVal) {
      setForm((p) => ({
        ...p,
        destino_id: null,
        destino_tipo: '',
        tercero_proveedor_id: null,
        cuenta_tercera_id: null,
      }));
      return;
    }
    setForm((p) => ({
      ...p,
      destino_id: newVal.id,
      destino_tipo: '',
      tercero_proveedor_id: null,
      cuenta_tercera_id:
        newVal.tipo === 'FINANCIERA' || newVal.tipo === 'FINANCIERO' ? p.cuenta_tercera_id : null,
    }));
  }, []);

  const handleChange = (campo, valor) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const montoInputProps = useMontoInput(String(form.monto ?? ''), (v) => handleChange('monto', v));

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setOptionsSba01(data.resultados || []);
      } catch {
        setOptionsSba01([]);
      } finally {
        setLoadingOrigen(false);
      }
    }, 400);
  }, []);

  const handleTipoOrigenChange = (e) => {
    const raw = e.target.value;
    const nuevo = ['CLIENTE', 'CLIENTE_FINANCIERO', 'FINANCIERA'].includes(raw)
      ? raw
      : normalizeTipoOrigen(raw);
    setForm((p) => ({
      ...p,
      tipo_origen: nuevo,
      cliente_razon_social: '',
      cod_client: '',
    }));
    setSelectedGva14(null);
    setSelectedSba01(null);
    setOptionsGva14([]);
    setOptionsSba01([]);
  };

  useEffect(() => {
    const o = normalizeTipoOrigen(form.tipo_origen);
    if (!pickedDestino?.tipo) return;
    const ok =
      o === 'FINANCIERA' || o === 'CLIENTE_FINANCIERO'
        ? pickedDestino.tipo === 'PROVEEDOR'
        : true;
    if (ok) return;
    setForm((p) => ({
      ...p,
      destino_id: null,
      destino_tipo: '',
      tercero_proveedor_id: null,
      cuenta_tercera_id: null,
    }));
    setPickedDestino(null);
    setCuentasTerceras([]);
  }, [form.tipo_origen, pickedDestino?.id, pickedDestino?.tipo]);

  // ── guardar ──
  const handleGuardar = async () => {
    setGuardando(true);
    setError(null);
    if (!String(form.cliente_razon_social || '').trim() || !String(form.cod_client || '').trim()) {
      setError('Seleccioná un origen (comercial GVA14 o cuenta SBA01) con código y descripción.');
      setGuardando(false);
      return;
    }
    try {
      await updateTransfer(form.id, buildApiPayload(form));
      onGuardado(buildUpdatedRow(form, destinosCatalogo));
      onClose();
    } catch {
      setError('No se pudo guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12,
        width: '100%', maxWidth: 680, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        margin: '0 16px',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 24px', borderBottom: '0.5px solid #E0E0E0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#3D3D3D' }}>
            Editar transferencia — {form.codigo_transferencia}
          </span>
          <CloseIcon
            onClick={onClose}
            sx={{ cursor: 'pointer', color: '#939393', fontSize: 20, '&:hover': { color: '#3D3D3D' } }}
          />
        </div>

        {/* ── Body ── */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>

          {/* Identificación */}
          <SectionLabel>Identificación</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel>Cód. transferencia *</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.codigo_transferencia}
                onChange={(e) => handleChange('codigo_transferencia', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>ID transferencia</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.id_transferencia || ''}
                onChange={(e) => handleChange('id_transferencia', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Monto *</FieldLabel>
              <input
                style={INPUT_MONTO}
                onFocus={(e) => { focusIn(e); montoInputProps.onFocus(); }}
                onBlur={(e) => { focusOut(e); montoInputProps.onBlur(); }}
                value={montoInputProps.value}
                onChange={montoInputProps.onChange}
                inputMode="decimal"
              />
            </div>
            <div>
              <FieldLabel>Concepto</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.concepto || ''}
                onChange={(e) => handleChange('concepto', e.target.value)}
              />
            </div>
          </div>

          {/* Fechas */}
          <SectionLabel>Fechas</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel>Fecha comprobante *</FieldLabel>
              <input
                type="date"
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.fecha_comprobante || ''}
                onChange={(e) => handleChange('fecha_comprobante', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Fecha registro</FieldLabel>
              <input
                type="date"
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.fecha_registro || ''}
                onChange={(e) => handleChange('fecha_registro', e.target.value)}
              />
            </div>
          </div>

          {/* Origen */}
          <SectionLabel>Origen</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel>Titular cuenta origen</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.persona_asignada || ''}
                onChange={(e) => handleChange('persona_asignada', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>CUIT/CUIL origen</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cuit_origen || ''}
                onChange={(e) => handleChange('cuit_origen', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Cuenta origen</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cta_origen || ''}
                onChange={(e) => handleChange('cta_origen', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>CBU origen</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cbu_origen || ''}
                onChange={(e) => handleChange('cbu_origen', e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Banco / Billetera</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.banco || ''}
                onChange={(e) => handleChange('banco', e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <SectionLabel>Origen de la transferencia (imputación contable)</SectionLabel>
              <FormControl component="fieldset" variant="standard" sx={{ width: '100%', mb: 1 }}>
                <FormLabel component="legend" sx={{ fontSize: 12, color: '#939393' }}>
                  Tipo de origen
                </FormLabel>
                <RadioGroup row value={form.tipo_origen} onChange={handleTipoOrigenChange}>
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
              {form.tipo_origen === 'CLIENTE' && (
                <Autocomplete
                  options={mergedGvaOptions}
                  loading={loadingOrigen}
                  value={selectedGva14}
                  onChange={(_, v) => {
                    setSelectedGva14(v);
                    if (v) {
                      setForm((p) => ({
                        ...p,
                        tipo_origen: 'CLIENTE',
                        cliente_razon_social: v.RAZON_SOCI ?? '',
                        cod_client: v.COD_CLIENT != null ? String(v.COD_CLIENT) : '',
                      }));
                    } else {
                      setForm((p) => ({ ...p, cliente_razon_social: '', cod_client: '' }));
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
                        <Typography variant="caption" color="text.secondary">Código: {option.COD_CLIENT}</Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Origen comercial (GVA14)"
                      size="small"
                      placeholder="Mín. 2 caracteres"
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
              )}
              {form.tipo_origen === 'CLIENTE_FINANCIERO' && (
                <Autocomplete
                  options={mergedSbaOptions}
                  loading={loadingOrigen}
                  value={selectedSba01}
                  onChange={(_, v) => {
                    setSelectedSba01(v);
                    if (v) {
                      setForm((p) => ({
                        ...p,
                        tipo_origen: 'CLIENTE_FINANCIERO',
                        cliente_razon_social: v.DESCRIPCIO ?? '',
                        cod_client: v.COD_CTA != null ? String(v.COD_CTA) : '',
                      }));
                    } else {
                      setForm((p) => ({ ...p, cliente_razon_social: '', cod_client: '' }));
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
                        <Typography variant="caption" color="text.secondary">Cuenta: {option.COD_CTA}</Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Cliente Financiero (SBA01)"
                      size="small"
                      placeholder="Mín. 2 caracteres"
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
              )}
              {form.tipo_origen === 'FINANCIERA' && (
                <Autocomplete
                  options={mergedSbaOptions}
                  loading={loadingOrigen}
                  value={selectedSba01}
                  onChange={(_, v) => {
                    setSelectedSba01(v);
                    if (v) {
                      setForm((p) => ({
                        ...p,
                        tipo_origen: 'FINANCIERA',
                        cliente_razon_social: v.DESCRIPCIO ?? '',
                        cod_client: v.COD_CTA != null ? String(v.COD_CTA) : '',
                      }));
                    } else {
                      setForm((p) => ({ ...p, cliente_razon_social: '', cod_client: '' }));
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
                        <Typography variant="caption" color="text.secondary">Cuenta: {option.COD_CTA}</Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Cuenta Financiera (SBA01)"
                      size="small"
                      placeholder="Mín. 2 caracteres"
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
              )}
            </div>
          </div>

          {/* Destino */}
          <SectionLabel>Destino</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Destino de imputación (catálogo)</FieldLabel>
              <Autocomplete
                options={mergedDestinoOptions}
                loading={loadingDestinos}
                value={pickedDestino}
                onChange={handleDestinoCatalogChange}
                getOptionLabel={(o) =>
                  `${o.destinos} — ${o.razon_social || ''} (${labelTipoDestinoCatalogo(o.tipo)})`
                }
                isOptionEqualToValue={(a, b) => a?.id === b?.id}
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
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Buscar en NSFW_Destinos…"
                    size="small"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingDestinos ? <CircularProgress color="inherit" size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </div>
            {(pickedDestino?.tipo === 'FINANCIERA' || pickedDestino?.tipo === 'FINANCIERO') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>Cuenta de tercero (opcional)</FieldLabel>
                <select
                  style={INPUT_BASE}
                  value={form.cuenta_tercera_id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleChange('cuenta_tercera_id', v === '' ? null : Number(v));
                  }}
                >
                  <option value="">— Sin cuenta específica —</option>
                  {cuentasTerceras.filter((c) => c.activo).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titular} — {String(c.cbu || '').slice(0, 8)}…
                    </option>
                  ))}
                </select>
                {cuentasTerceras.filter((c) => c.activo).length === 0 ? (
                  <div style={{ fontSize: 11, color: '#939393', marginTop: 4 }}>
                    No hay cuentas de terceros activas cargadas para este destino.
                  </div>
                ) : null}
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <FieldLabel>Destino según comprobante (texto libre)</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.destino_comprobante || ''}
                onChange={(e) => handleChange('destino_comprobante', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>CUIT/CUIL destino</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cuit_destino || ''}
                onChange={(e) => handleChange('cuit_destino', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Cuenta destino</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cta_destino || ''}
                onChange={(e) => handleChange('cta_destino', e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>CBU destino</FieldLabel>
              <input
                style={INPUT_BASE} onFocus={focusIn} onBlur={focusOut}
                value={form.cbu_destino || ''}
                onChange={(e) => handleChange('cbu_destino', e.target.value)}
              />
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '16px 24px', borderTop: '0.5px solid #E0E0E0',
          display: 'flex', justifyContent: 'flex-end', gap: 12,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px', border: '0.5px solid #939393',
              borderRadius: 8, background: 'transparent',
              color: '#3D3D3D', cursor: 'pointer', fontSize: 14,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            style={{
              padding: '8px 20px',
              background: guardando ? '#7B5A9E' : '#553278',
              border: 'none', borderRadius: 8,
              color: '#FFFFFF',
              cursor: guardando ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
            onMouseEnter={(e) => { if (!guardando) e.currentTarget.style.background = '#3D2158'; }}
            onMouseLeave={(e) => { if (!guardando) e.currentTarget.style.background = '#553278'; }}
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#d32f2f', fontSize: 13, padding: '0 24px 12px', textAlign: 'right' }}>
            {error}
          </div>
        )}

      </div>
    </div>
  );
};

export default EditarTransferenciaModal;
