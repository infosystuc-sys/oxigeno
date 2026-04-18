import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Container, IconButton, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { getPersonasAsignadas, postPersonaAsignada, putPersonaAsignada, deletePersonaAsignada } from '../hooks/useTransferAPI';

const MAX = 20;

const rowDescripcion = (row) => row?.descripcion ?? row?.Descripcion ?? '';

const PersonasAsignadas = () => {
  const [items, setItems] = useState([]);
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: list } = await getPersonasAsignadas();
      setItems(list || []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el catálogo.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const d = descripcion.trim();
    if (!d) return;
    setSaving(true);
    setError(null);
    try {
      await postPersonaAsignada(d);
      setDescripcion('');
      await load();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setEditText(rowDescripcion(row));
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const t = editText.trim();
    if (!t || !editId) return;
    setSaving(true);
    setError(null);
    try {
      await putPersonaAsignada(editId, t);
      setEditOpen(false);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Error al actualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta persona asignada?')) return;
    try {
      await deletePersonaAsignada(id);
      await load();
    } catch (err) {
      setError(err.message || 'Error al eliminar.');
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 3, mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1A237E', mb: 2 }}>
        Persona asignada — ABM
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Id correlativo y descripcion (máximo {MAX} caracteres).
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper component="form" onSubmit={handleAdd} sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          label="Descripción"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value.slice(0, MAX))}
          fullWidth
          size="small"
          inputProps={{ maxLength: MAX }}
          helperText={`${descripcion.length}/${MAX}`}
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={<AddIcon />}
          disabled={saving || !descripcion.trim()}
          sx={{ bgcolor: '#1A237E', flexShrink: 0 }}
        >
          Alta
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress sx={{ color: '#1A237E' }} />
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', color: '#1A237E', width: 80 }}>Id</TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#1A237E' }}>descripcion</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>Sin registros. Usá el formulario de alta.</TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{row.id}</TableCell>
                    <TableCell>{rowDescripcion(row)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={() => openEdit(row)} aria-label="Modificar">
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(row.id)} aria-label="Eliminar">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Modificar persona asignada</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="descripcion"
            fullWidth
            value={editText}
            onChange={(e) => setEditText(e.target.value.slice(0, MAX))}
            size="small"
            inputProps={{ maxLength: MAX }}
            helperText={`${editText.length}/${MAX}`}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={saving || !editText.trim()} sx={{ bgcolor: '#1A237E' }}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PersonasAsignadas;
