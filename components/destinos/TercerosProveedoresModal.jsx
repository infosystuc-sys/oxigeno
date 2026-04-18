import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Alert,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

function TerceroFormDialog({ open, onClose, destino, tercero, onSave }) {
  const [formData, setFormData] = useState({
    nombre_tercero: '',
    cuit_tercero: '',
    banco: '',
    numero_cuenta: '',
    cbu: '',
    alias_cbu: '',
    observaciones: '',
  });

  useEffect(() => {
    if (!open) return;
    if (tercero) {
      setFormData({
        nombre_tercero: tercero.nombre_tercero ?? '',
        cuit_tercero: tercero.cuit_tercero ?? '',
        banco: tercero.banco ?? '',
        numero_cuenta: tercero.numero_cuenta ?? '',
        cbu: tercero.cbu ?? '',
        alias_cbu: tercero.alias_cbu ?? '',
        observaciones: tercero.observaciones ?? '',
      });
    } else {
      setFormData({
        nombre_tercero: '',
        cuit_tercero: '',
        banco: '',
        numero_cuenta: '',
        cbu: '',
        alias_cbu: '',
        observaciones: '',
      });
    }
  }, [tercero, open]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSave = async () => {
    if (!formData.nombre_tercero?.trim()) {
      window.alert('El nombre del tercero es obligatorio');
      return;
    }
    try {
      const url = tercero
        ? `/api/destinos/${destino.id}/terceros-proveedores/${tercero.id}`
        : `/api/destinos/${destino.id}/terceros-proveedores`;
      const method = tercero ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Error al guardar');
      }
      onSave();
    } catch (err) {
      window.alert(err.message || 'Error al guardar');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tercero ? 'Editar tercero' : 'Agregar tercero'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Nombre del tercero"
            name="nombre_tercero"
            value={formData.nombre_tercero}
            onChange={handleChange}
            required
            fullWidth
            size="small"
          />
          <TextField
            label="CUIT"
            name="cuit_tercero"
            value={formData.cuit_tercero}
            onChange={handleChange}
            fullWidth
            size="small"
          />
          <TextField
            label="Banco"
            name="banco"
            value={formData.banco}
            onChange={handleChange}
            fullWidth
            size="small"
          />
          <TextField
            label="Número de cuenta"
            name="numero_cuenta"
            value={formData.numero_cuenta}
            onChange={handleChange}
            fullWidth
            size="small"
          />
          <TextField
            label="CBU"
            name="cbu"
            value={formData.cbu}
            onChange={handleChange}
            inputProps={{ maxLength: 22 }}
            fullWidth
            size="small"
          />
          <TextField
            label="Alias CBU"
            name="alias_cbu"
            value={formData.alias_cbu}
            onChange={handleChange}
            fullWidth
            size="small"
          />
          <TextField
            label="Observaciones"
            name="observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            multiline
            rows={3}
            fullWidth
            size="small"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained">
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function TercerosProveedoresModal({ open, onClose, destino }) {
  const [terceros, setTerceros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openFormDialog, setOpenFormDialog] = useState(false);
  const [terceroEdit, setTerceroEdit] = useState(null);

  const destinoId = destino?.id ?? destino?.Id;
  const nombreDestino = destino?.destinos || destino?.Destinos || '';

  const cargarTerceros = async () => {
    if (!destinoId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/destinos/${destinoId}/terceros-proveedores`);
      const data = await response.json();
      setTerceros(data.terceros || []);
    } catch {
      setTerceros([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && destinoId) cargarTerceros();
  }, [open, destinoId]);

  const handleEliminarTercero = async (terceroId) => {
    if (!window.confirm('¿Desactivar este tercero?')) return;
    try {
      const response = await fetch(`/api/destinos/${destinoId}/terceros-proveedores/${terceroId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Error al eliminar');
      const body = await response.json().catch(() => ({}));
      if (body.warning) window.alert(body.warning);
      cargarTerceros();
    } catch {
      window.alert('Error al eliminar tercero');
    }
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'nombre_tercero', headerName: 'Nombre', flex: 1, minWidth: 160 },
    { field: 'cuit_tercero', headerName: 'CUIT', width: 120 },
    { field: 'banco', headerName: 'Banco', width: 120 },
    { field: 'cbu', headerName: 'CBU', width: 160 },
    {
      field: 'acciones',
      headerName: 'Acciones',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton size="small" onClick={() => { setTerceroEdit(params.row); setOpenFormDialog(true); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => handleEliminarTercero(params.row.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Terceros del proveedor: {nombreDestino}</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, mt: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setTerceroEdit(null); setOpenFormDialog(true); }}
              sx={{ bgcolor: '#1A237E' }}
            >
              Agregar tercero
            </Button>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            Las bajas son lógicas. Si un tercero tiene transferencias asociadas, se informará al desactivar.
          </Alert>
          <Box sx={{ height: 360, width: '100%' }}>
            <DataGrid
              rows={terceros}
              columns={columns}
              getRowId={(r) => String(r.id)}
              loading={loading}
              pageSizeOptions={[5, 10, 20]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              disableRowSelectionOnClick
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {destinoId ? (
        <TerceroFormDialog
          open={openFormDialog}
          onClose={() => setOpenFormDialog(false)}
          destino={{ id: destinoId }}
          tercero={terceroEdit}
          onSave={() => {
            setOpenFormDialog(false);
            cargarTerceros();
          }}
        />
      ) : null}
    </>
  );
}
