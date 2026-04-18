import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  TextField,
  MenuItem,
  Alert,
  LinearProgress,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import { DataGrid } from '@mui/x-data-grid';
import useDestinos from '../../hooks/useDestinos';
import {
  formatearCUIT,
  limpiarCUIT,
  formatearCBU,
  limpiarCBU,
  validarCUITCliente,
  validarCBUCliente,
  enmascararCBU,
} from '../../utils/validadores';

const TIPOS_CUENTA = ['Caja de Ahorro', 'Cuenta Corriente', 'Otro'];

const cuentaRowId = (r) => r?.id ?? r?.Id;
const cuentaActivo = (r) => Boolean(r?.activo ?? r?.Activo);

const emptyCuenta = () => ({
  titular: '',
  cuit_titular: '',
  banco: '',
  tipo_cuenta: '',
  numero_cuenta: '',
  cbu: '',
  alias_cbu: '',
  observaciones: '',
});

const CuentasTercerosModal = ({ open, onClose, destino, onChanged }) => {
  const {
    fetchCuentasTerceros,
    createCuentaTercera,
    updateCuentaTercera,
    toggleActivarCuentaTercera,
    softDeleteCuentaTercera,
  } = useDestinos();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [subOpen, setSubOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyCuenta);
  const [saving, setSaving] = useState(false);

  const destinoId = destino?.id ?? destino?.Id ?? destino?.ID;
  const tituloNombre =
    destino?.destinos ||
    destino?.Destinos ||
    destino?.razon_social ||
    destino?.Razon_Social ||
    '';

  const load = useCallback(async () => {
    if (!destinoId) return;
    setLoading(true);
    setErr(null);
    try {
      const { items } = await fetchCuentasTerceros(destinoId, true);
      setRows(items || []);
    } catch (e) {
      setErr(e.message || 'Error al cargar cuentas');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [destinoId, fetchCuentasTerceros]);

  useEffect(() => {
    if (open && destinoId) load();
  }, [open, destinoId, load]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyCuenta());
    setSubOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(cuentaRowId(row));
    const cuitR = row.cuit_titular ?? row.Cuit_Titular;
    const cbuR = row.cbu ?? row.CBU;
    setForm({
      titular: row.titular ?? row.Titular ?? '',
      cuit_titular: cuitR ? formatearCUIT(String(cuitR)) : '',
      banco: row.banco ?? row.Banco ?? '',
      tipo_cuenta: row.tipo_cuenta ?? row.Tipo_Cuenta ?? '',
      numero_cuenta: row.numero_cuenta ?? row.Numero_Cuenta ?? '',
      cbu: cbuR ? formatearCBU(String(cbuR).replace(/\D/g, '')) : '',
      alias_cbu: row.alias_cbu ?? row.Alias_CBU ?? '',
      observaciones: row.observaciones ?? row.Observaciones ?? '',
    });
    setSubOpen(true);
  };

  const cuitVal = validarCUITCliente(form.cuit_titular);
  const cuitErr = cuitVal.valido ? '' : cuitVal.error;
  const cbuVal = validarCBUCliente(form.cbu, { obligatorio: false });
  const cbuErr = cbuVal.valido ? '' : cbuVal.error;

  const canSaveSub =
    form.titular.trim() &&
    form.banco.trim() &&
    !cbuErr &&
    !cuitErr;

  const handleSaveSub = async () => {
    if (!canSaveSub || !destinoId) return;
    setSaving(true);
    try {
      const payload = {
        titular: form.titular.trim(),
        cuit_titular: form.cuit_titular.trim() ? limpiarCUIT(form.cuit_titular) : null,
        banco: form.banco.trim(),
        tipo_cuenta: form.tipo_cuenta?.trim() || null,
        numero_cuenta: form.numero_cuenta?.trim() || null,
        cbu: form.cbu.trim() ? limpiarCBU(form.cbu) : null,
        alias_cbu: form.alias_cbu?.trim() || null,
        observaciones: form.observaciones?.trim() || null,
      };
      if (editingId) {
        await updateCuentaTercera(destinoId, editingId, payload);
      } else {
        await createCuentaTercera(destinoId, payload);
      }
      setSubOpen(false);
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.message || 'Error al guardar cuenta');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (row) => {
    const a = cuentaActivo(row);
    const cid = cuentaRowId(row);
    if (!window.confirm(`¿${a ? 'Desactivar' : 'Activar'} esta cuenta de tercero?`)) return;
    try {
      if (a) {
        await softDeleteCuentaTercera(destinoId, cid);
      } else {
        await toggleActivarCuentaTercera(destinoId, cid, false);
      }
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e.message || 'Error');
    }
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'titular', headerName: 'Titular', flex: 1, minWidth: 140 },
    {
      field: 'cuit_titular',
      headerName: 'CUIT',
      width: 130,
      renderCell: (p) => (p.value ? formatearCUIT(p.value) : '—'),
    },
    { field: 'banco', headerName: 'Banco', width: 120 },
    {
      field: 'cbu',
      headerName: 'CBU',
      width: 120,
      renderCell: (p) => enmascararCBU(p.value),
    },
    {
      field: 'activo',
      headerName: 'Estado',
      width: 90,
      renderCell: (p) => (cuentaActivo(p.row) ? 'Activo' : 'Inactivo'),
    },
    {
      field: 'acciones',
      headerName: 'Acciones',
      width: 100,
      sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => openEdit(p.row)} aria-label="editar">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => handleToggle(p.row)} aria-label="toggle">
            {cuentaActivo(p.row) ? (
              <ToggleOffIcon fontSize="small" color="warning" />
            ) : (
              <ToggleOnIcon fontSize="small" color="success" />
            )}
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            Cuentas de terceros — <strong>{tituloNombre}</strong>
          </Box>
          <Box>
            <Button startIcon={<AddIcon />} size="small" variant="contained" onClick={openNew} sx={{ mr: 1, bgcolor: '#1A237E' }}>
              Agregar cuenta
            </Button>
            <IconButton size="small" onClick={onClose} aria-label="cerrar">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {err && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setErr(null)}>
              {err}
            </Alert>
          )}
          {loading ? (
            <LinearProgress />
          ) : (
            <Box sx={{ height: 400, width: '100%' }}>
              <DataGrid
                rows={rows}
                columns={columns}
                getRowId={(r) => String(cuentaRowId(r))}
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25]}
 initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={subOpen} onClose={() => !saving && setSubOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Editar cuenta' : 'Nueva cuenta de tercero'}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Banco y titular son obligatorios. CBU opcional (si se ingresa, debe tener 22 dígitos).
          </Typography>
          <TextField
            fullWidth
            required
            size="small"
            label="Titular"
            value={form.titular}
            onChange={(e) => setForm((p) => ({ ...p, titular: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            size="small"
            label="CUIT titular"
            value={form.cuit_titular}
            onChange={(e) => setForm((p) => ({ ...p, cuit_titular: formatearCUIT(e.target.value) }))}
            error={Boolean(cuitErr)}
            helperText={cuitErr || ' '}
            margin="dense"
            inputProps={{ maxLength: 13 }}
          />
          <TextField
            fullWidth
            required
            size="small"
            label="Banco"
            value={form.banco}
            onChange={(e) => setForm((p) => ({ ...p, banco: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            select
            size="small"
            label="Tipo de cuenta"
            value={form.tipo_cuenta}
            onChange={(e) => setForm((p) => ({ ...p, tipo_cuenta: e.target.value }))}
            margin="dense"
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
            margin="dense"
          />
          <TextField
            fullWidth
            required
            size="small"
            label="CBU"
            value={form.cbu}
            onChange={(e) => setForm((p) => ({ ...p, cbu: formatearCBU(limpiarCBU(e.target.value)) }))}
            error={Boolean(cbuErr)}
            helperText={cbuErr || ' '}
            margin="dense"
          />
          <TextField
            fullWidth
            size="small"
            label="Alias CBU"
            value={form.alias_cbu}
            onChange={(e) => setForm((p) => ({ ...p, alias_cbu: e.target.value }))}
            margin="dense"
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Observaciones"
            value={form.observaciones}
            onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleSaveSub} disabled={saving || !canSaveSub} sx={{ bgcolor: '#1A237E' }}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CuentasTercerosModal;
