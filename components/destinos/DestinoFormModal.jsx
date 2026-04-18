import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  TextField,
  Box,
  Typography,
  MenuItem,
  Alert,
  AlertTitle,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  Checkbox,
  IconButton,
  LinearProgress,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import {
  formatearCUIT,
  limpiarCUIT,
  formatearCBU,
  limpiarCBU,
  validarCUITCliente,
  validarCBUCliente,
} from '../../utils/validadores';
import useDestinos from '../../hooks/useDestinos';

const TIPOS_CUENTA = ['Caja de Ahorro', 'Cuenta Corriente', 'Otro'];

const emptyForm = () => ({
  destinos: '',
  tipo: 'PROVEEDOR',
  razon_social: '',
  cuit: '',
  codigo_proveedor_tango: '',
  acepta_terceros: false,
  banco: '',
  tipo_cuenta: '',
  numero_cuenta: '',
  cbu: '',
  alias_cbu: '',
  observaciones: '',
});

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

const DestinoFormModal = ({ open, onClose, destinoId, onSaved }) => {
  const { fetchDestinoById, createDestino, updateDestino } = useDestinos();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState(null);

  // Estado del lookup Tango
  const [tangoLookup, setTangoLookup] = useState({ estado: 'idle', nombre: null });
  // idle | buscando | encontrado | no_encontrado | error
  const tangoDebounceRef = useRef(null);

  const editIdNum =
    destinoId != null && destinoId !== '' ? Number(destinoId) : NaN;
  const isEdit = Number.isInteger(editIdNum) && editIdNum > 0;

  const cuitErr = useMemo(() => {
    const v = validarCUITCliente(form.cuit);
    return v.valido ? '' : v.error;
  }, [form.cuit]);

  const cbuErr = useMemo(() => {
    const v = validarCBUCliente(form.cbu, { obligatorio: false });
    return v.valido ? '' : v.error;
  }, [form.cbu]);

  const canSave = useMemo(() => {
    if (!form.destinos.trim()) return false;
    if (
      ![
        'PROVEEDOR',
        'FINANCIERA',
        'CLIENTE_FINANCIERO',
        'CTA_PROPIA',
      ].includes(form.tipo)
    ) {
      return false;
    }
    if (cuitErr || cbuErr) return false;
    return true;
  }, [form.destinos, form.tipo, cuitErr, cbuErr]);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    setLoadErr(null);
    setTangoLookup({ estado: 'idle', nombre: null });

    if (!isEdit) {
      setForm(emptyForm());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const d = await fetchDestinoById(editIdNum, { incluirCuentas: false });
        if (cancelled) return;
        const row = d.destino ?? d.Destino;
        if (!row) throw new Error('No encontrado');
        const tipoRaw = String(row.tipo ?? row.Tipo ?? 'PROVEEDOR')
          .trim()
          .toUpperCase();
        const tr = tipoRaw === 'FINANCIERO' ? 'FINANCIERA' : tipoRaw;
        const tiposOk = new Set([
          'PROVEEDOR',
          'FINANCIERA',
          'CLIENTE_FINANCIERO',
          'CTA_PROPIA',
        ]);
        let tipo = tiposOk.has(tr) ? tr : 'PROVEEDOR';
        if (tr === 'PROVEEDOR_TERCEROS') tipo = 'PROVEEDOR';
        const aceptaRaw = row.acepta_terceros ?? row.Acepta_Terceros ?? row.AceptaTerceros;
        const acepta_terceros =
          tipo === 'PROVEEDOR' ? Boolean(aceptaRaw === true || aceptaRaw === 1 || aceptaRaw === '1') : false;
        setForm({
          destinos: String(row.destinos ?? row.Destinos ?? '').trim(),
          tipo,
          razon_social: String(row.razon_social ?? row.Razon_Social ?? row.RazonSocial ?? '').trim(),
          cuit: row.cuit ?? row.CUIT ? formatearCUIT(String(row.cuit ?? row.CUIT)) : '',
          codigo_proveedor_tango: String(row.codigo_proveedor_tango ?? row.Codigo_Proveedor_Tango ?? '').trim(),
          acepta_terceros,
          banco: String(row.banco ?? row.Banco ?? '').trim(),
          tipo_cuenta: String(row.tipo_cuenta ?? row.Tipo_Cuenta ?? '').trim(),
          numero_cuenta: String(row.numero_cuenta ?? row.Numero_Cuenta ?? '').trim(),
          cbu: row.cbu ?? row.CBU ? formatearCBU(String(row.cbu ?? row.CBU).replace(/\D/g, '')) : '',
          alias_cbu: String(row.alias_cbu ?? row.Alias_CBU ?? '').trim(),
          observaciones: String(row.observaciones ?? row.Observaciones ?? '').trim(),
        });
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isEdit, editIdNum, fetchDestinoById]);

  // Lookup automático en tablas Tango cuando cambia el código
  useEffect(() => {
    if (form.tipo !== 'PROVEEDOR') {
      clearTimeout(tangoDebounceRef.current);
      setTangoLookup({ estado: 'idle', nombre: null });
      return;
    }

    const codigo = form.codigo_proveedor_tango?.trim() ?? '';

    // Limpiar resultado si el campo está vacío
    if (!codigo) {
      setTangoLookup({ estado: 'idle', nombre: null });
      return;
    }

    setTangoLookup({ estado: 'buscando', nombre: null });

    // Debounce: esperar 500 ms sin cambios antes de disparar la consulta
    clearTimeout(tangoDebounceRef.current);
    tangoDebounceRef.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ tipo: form.tipo, codigo });
        const res = await fetch(`/api/tango/buscar-codigo?${qs}`);
        const data = await res.json();
        if (!res.ok || !data.encontrado) {
          setTangoLookup({ estado: 'no_encontrado', nombre: null });
        } else {
          setTangoLookup({ estado: 'encontrado', nombre: data.nombre });
          // Actualizar Razón social automáticamente
          setForm((prev) => {
            const actual = prev.razon_social?.trim() ?? '';
            // Si ya tiene un valor distinto al que traería Tango, pedir confirmación
            if (actual && actual !== data.nombre) {
              if (!window.confirm(
                `Razón social tiene "${actual}".\n¿Reemplazar con "${data.nombre}" obtenido de Tango?`
              )) return prev;
            }
            return { ...prev, razon_social: data.nombre };
          });
        }
      } catch {
        setTangoLookup({ estado: 'error', nombre: null });
      }
    }, 500);

    return () => clearTimeout(tangoDebounceRef.current);
  }, [form.codigo_proveedor_tango, form.tipo]);

  const handleCuitChange = (e) => {
    const masked = formatearCUIT(e.target.value);
    setForm((p) => ({ ...p, cuit: masked }));
  };

  const handleCbuChange = (e) => {
    const raw = limpiarCBU(e.target.value);
    setForm((p) => ({ ...p, cbu: formatearCBU(raw) }));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        destinos: form.destinos.trim(),
        tipo: form.tipo,
        razon_social: form.razon_social?.trim() || null,
        cuit: form.cuit.trim() ? limpiarCUIT(form.cuit) : null,
        codigo_proveedor_tango: form.codigo_proveedor_tango?.trim() || null,
        acepta_terceros: form.tipo === 'PROVEEDOR' ? Boolean(form.acepta_terceros) : false,
        banco: form.banco?.trim() || null,
        tipo_cuenta: form.tipo_cuenta?.trim() || null,
        numero_cuenta: form.numero_cuenta?.trim() || null,
        cbu: form.cbu.trim() ? limpiarCBU(form.cbu) : null,
        alias_cbu: form.alias_cbu?.trim() || null,
        observaciones: form.observaciones?.trim() || null,
      };
      if (isEdit) {
        await updateDestino(editIdNum, payload);
      } else {
        await createDestino(payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setLoadErr(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {isEdit ? 'Editar destino' : 'Nuevo destino'}
        <IconButton size="small" onClick={onClose} disabled={saving} aria-label="cerrar">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 420 }}>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {loadErr && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLoadErr(null)}>
            {loadErr}
          </Alert>
        )}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Datos básicos" />
          <Tab label="Específicos" />
          <Tab label="Datos bancarios" />
          <Tab label="Observaciones" />
        </Tabs>

        <TabPanel value={tab} index={0}>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Datos básicos
          </Typography>
          <TextField
            fullWidth
            required
            size="small"
            label="Nombre corto (destinos)"
            value={form.destinos}
            onChange={(e) => setForm((p) => ({ ...p, destinos: e.target.value.slice(0, 20) }))}
            helperText={`${form.destinos.length}/20 caracteres`}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <FormControl component="fieldset" margin="normal" fullWidth required>
            <Typography variant="caption" color="text.secondary" component="div">
              Tipo de Destino *
            </Typography>
            <RadioGroup
              value={form.tipo}
              onChange={(e) =>
                setForm((p) => {
                  const next = e.target.value;
                  return {
                    ...p,
                    tipo: next,
                    acepta_terceros: next === 'PROVEEDOR' ? p.acepta_terceros : false,
                  };
                })
              }
            >
              <FormControlLabel value="PROVEEDOR" control={<Radio color="primary" />} label="Proveedor" />
              <FormControlLabel value="FINANCIERA" control={<Radio color="success" />} label="Financiera" />
              <FormControlLabel
                value="CLIENTE_FINANCIERO"
                control={<Radio color="warning" />}
                label="Cliente Financiero"
              />
              <FormControlLabel value="CTA_PROPIA" control={<Radio color="secondary" />} label="Cta. Propia" />
            </RadioGroup>
          </FormControl>
          <TextField
            fullWidth
            size="small"
            label="Razón social"
            placeholder="Nombre completo o denominación"
            value={form.razon_social}
            onChange={(e) => setForm((p) => ({ ...p, razon_social: e.target.value }))}
            margin="normal"
            InputLabelProps={{ shrink: true }}
            helperText="Opcional — nombre legal o fantasía del destino"
          />
          <TextField
            fullWidth
            size="small"
            label="CUIT"
            value={form.cuit}
            onChange={handleCuitChange}
            error={Boolean(cuitErr)}
            helperText={cuitErr || '11 dígitos (se muestra con guiones)'}
            margin="normal"
            inputProps={{ maxLength: 13 }}
          />
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {form.tipo === 'PROVEEDOR' && (
              <TextField
                fullWidth
                size="small"
                label="Código Proveedor Tango"
                value={form.codigo_proveedor_tango}
                onChange={(e) =>
                  setForm((p) => ({ ...p, codigo_proveedor_tango: e.target.value.slice(0, 6) }))
                }
                margin="normal"
                inputProps={{ maxLength: 6 }}
                InputLabelProps={{ shrink: true }}
                placeholder="6 caracteres"
                helperText="Código del proveedor en Tango si existe"
                InputProps={{
                  endAdornment: tangoLookup.estado === 'buscando' ? (
                    <InputAdornment position="end">
                      <CircularProgress size={16} />
                    </InputAdornment>
                  ) : tangoLookup.estado === 'encontrado' ? (
                    <InputAdornment position="end">
                      <CheckCircleIcon fontSize="small" color="success" />
                    </InputAdornment>
                  ) : tangoLookup.estado === 'no_encontrado' && form.codigo_proveedor_tango?.trim() ? (
                    <InputAdornment position="end">
                      <ErrorIcon fontSize="small" color="error" />
                    </InputAdornment>
                  ) : null,
                }}
                FormHelperTextProps={{
                  sx: {
                    color:
                      tangoLookup.estado === 'encontrado'
                        ? 'success.main'
                        : tangoLookup.estado === 'no_encontrado' && form.codigo_proveedor_tango?.trim()
                          ? 'error.main'
                          : 'text.secondary',
                  },
                }}
              />
            )}

            {form.tipo === 'PROVEEDOR' && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(form.acepta_terceros)}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, acepta_terceros: e.target.checked }))
                      }
                    />
                  }
                  label="Este proveedor acepta transferencias a cuentas de terceros"
                />
                {form.acepta_terceros ? (
                  <Alert severity="info">
                    <AlertTitle>Terceros del proveedor</AlertTitle>
                    Tras guardar, podrá administrar las cuentas de terceros desde el ícono correspondiente
                    en la tabla de destinos.
                  </Alert>
                ) : null}
              </>
            )}

            {form.tipo === 'FINANCIERA' && (
              <Alert severity="info" icon={<AccountBalanceIcon fontSize="inherit" />}>
                <AlertTitle>Cuentas de Terceros</AlertTitle>
                {isEdit ? (
                  <>
                    Este destino financiero puede tener cuentas de terceros. Para gestionarlas, cerrá
                    este modal y en la tabla principal pulsá el ícono{' '}
                    <strong>«Cuentas de Terceros»</strong>.
                  </>
                ) : (
                  <>
                    Primero debés <strong>guardar</strong> este destino. Luego podrás agregar cuentas
                    de terceros desde el ícono correspondiente en la tabla.
                  </>
                )}
              </Alert>
            )}

            {form.tipo === 'CLIENTE_FINANCIERO' && (
              <Alert severity="warning">
                <AlertTitle>Cliente Financiero</AlertTitle>
                Este destino representa un cliente con operaciones financieras. No requiere
                configuración adicional de terceros.
              </Alert>
            )}

            {form.tipo === 'CTA_PROPIA' && (
              <Alert severity="success">
                <AlertTitle>Cuenta Propia</AlertTitle>
                Este destino representa una cuenta propia de la empresa. No requiere configuración
                adicional.
              </Alert>
            )}

          </Box>
        </TabPanel>

        <TabPanel value={tab} index={2}>
          <TextField
            fullWidth
            size="small"
            label="Banco"
            value={form.banco}
            onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))}
            margin="normal"
          />
          <TextField
            fullWidth
            select
            size="small"
            label="Tipo de cuenta"
            value={form.tipo_cuenta}
            onChange={(e) => setForm((p) => ({ ...p, tipo_cuenta: e.target.value }))}
            margin="normal"
          >
            <MenuItem value="">
              <em>Sin especificar</em>
            </MenuItem>
            {TIPOS_CUENTA.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            size="small"
            label="Número de cuenta"
            value={form.numero_cuenta}
            onChange={(e) => setForm((p) => ({ ...p, numero_cuenta: e.target.value }))}
            margin="normal"
          />
          <TextField
            fullWidth
            size="small"
            label="CBU"
            value={form.cbu}
            onChange={handleCbuChange}
            error={Boolean(cbuErr)}
            helperText={cbuErr || '22 dígitos (visualización con espacios)'}
            margin="normal"
          />
          <TextField
            fullWidth
            size="small"
            label="Alias CBU"
            value={form.alias_cbu}
            onChange={(e) => setForm((p) => ({ ...p, alias_cbu: e.target.value }))}
            margin="normal"
          />
        </TabPanel>

        <TabPanel value={tab} index={3}>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label="Observaciones"
            value={form.observaciones}
            onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
            margin="normal"
          />
        </TabPanel>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !canSave || loading} sx={{ bgcolor: '#1A237E' }}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DestinoFormModal;
