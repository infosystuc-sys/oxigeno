import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  TextField,
  MenuItem,
  Snackbar,
  Alert,
  IconButton,
  Chip,
  Tooltip,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import { DataGrid } from '@mui/x-data-grid';
import useDestinos from '../hooks/useDestinos';
import DestinoFormModal from '../components/destinos/DestinoFormModal';
import CuentasTercerosModal from '../components/destinos/CuentasTercerosModal';
import TercerosProveedoresModal from '../components/destinos/TercerosProveedoresModal';
import { enmascararCBU } from '../utils/validadores';

/** Tedious/mssql puede devolver Id, Tipo, etc.; el DataGrid y el modal esperan id, tipo. */
const rowDestinoId = (r) => r?.id ?? r?.Id ?? r?.ID;
const rowDestinoTipoU = (r) =>
  String(r?.tipo ?? r?.Tipo ?? r?.TIPO ?? '')
    .trim()
    .toUpperCase();
const rowDestinoActivo = (r) => Boolean(r?.activo ?? r?.Activo);

const Destinos = () => {
  const { fetchDestinos, toggleActivarDestino, hardDeleteDestino, loading, error, setError, destinos, total } = useDestinos();

  const [tipo, setTipo] = useState('');
  const [activo, setActivo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [sortModel, setSortModel] = useState([{ field: 'id', sort: 'asc' }]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [cuentasDestino, setCuentasDestino] = useState(null);
  const [tercerosProveedorDestino, setTercerosProveedorDestino] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  const load = useCallback(async () => {
    const sort = sortModel[0];
    try {
      await fetchDestinos({
        tipo: tipo || undefined,
        activo: activo || undefined,
        buscar: buscar.trim() || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
        sortField: sort?.field || 'id',
        sortDir: sort?.sort || 'asc',
      });
    } catch {
      /* error en hook */
    }
  }, [
    fetchDestinos,
    tipo,
    activo,
    buscar,
    paginationModel.page,
    paginationModel.pageSize,
    sortModel,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const showSnack = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  const handleNuevo = () => {
    setEditId(null);
    setFormOpen(true);
  };

  const handleEdit = (row) => {
    const id = rowDestinoId(row);
    setEditId(id != null && id !== '' ? Number(id) : null);
    setFormOpen(true);
  };

  const handleToggleDestino = async (row) => {
    const activoRow = rowDestinoActivo(row);
    const msg = activoRow
      ? '¿Desactivar este destino? No aparecerá en futuras asignaciones.'
      : '¿Activar este destino?';
    if (!window.confirm(msg)) return;
    try {
      const res = await toggleActivarDestino(rowDestinoId(row), activoRow);
      if (res?.warning) showSnack(res.warning, 'warning');
      else showSnack(activoRow ? 'Destino desactivado' : 'Destino activado');
      await load();
    } catch (e) {
      showSnack(e.message || 'Error', 'error');
    }
  };

  const handleEliminarDestino = async (row) => {
    const nombre = row.razon_social || row.destinos || `ID ${rowDestinoId(row)}`;
    if (!window.confirm(`¿Eliminar permanentemente "${nombre}"?\n\nEsta acción no se puede deshacer.\nSolo es posible si el destino nunca fue utilizado en transferencias.`)) return;
    try {
      await hardDeleteDestino(rowDestinoId(row));
      showSnack('Destino eliminado permanentemente');
      await load();
    } catch (e) {
      showSnack(e.message || 'No se pudo eliminar el destino', 'error');
    }
  };

  const limpiarFiltros = () => {
    setTipo('');
    setActivo('');
    setBuscar('');
    setPaginationModel((p) => ({ ...p, page: 0 }));
  };

  const columns = useMemo(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        width: 70,
        valueGetter: (v, row) => row.id ?? row.Id ?? row.ID ?? v,
      },
      {
        field: 'destinos',
        headerName: 'Nombre',
        width: 130,
        valueGetter: (v, row) => row.destinos ?? row.Destinos ?? v ?? '',
      },
      {
        field: 'tipo',
        headerName: 'Tipo',
        width: 170,
        valueGetter: (v, row) =>
          String(row.tipo ?? row.Tipo ?? row.TIPO ?? v ?? '')
            .trim()
            .toUpperCase() || '',
        renderCell: (p) => {
          let tipo = rowDestinoTipoU(p.row) || String(p.value ?? '').trim().toUpperCase();
          if (tipo === 'FINANCIERO') tipo = 'FINANCIERA';
          if (tipo === 'PROVEEDOR_TERCEROS') tipo = 'PROVEEDOR';
          const configuracion = {
            PROVEEDOR: { color: 'primary', label: 'Proveedor' },
            FINANCIERA: { color: 'success', label: 'Financiera' },
            CLIENTE_FINANCIERO: { color: 'warning', label: 'Cliente Financiero' },
            CTA_PROPIA: { color: 'secondary', label: 'Cta. Propia' },
          };
          const config = configuracion[tipo] || { color: 'default', label: tipo || 'Sin tipo' };
          return (
            <Chip label={config.label} size="small" color={config.color} sx={{ fontWeight: 'bold' }} />
          );
        },
      },
      {
        field: 'razon_social',
        headerName: 'Razón social',
        flex: 1,
        minWidth: 160,
        valueGetter: (v, row) => row.razon_social ?? row.Razon_Social ?? row.RazonSocial ?? v ?? '',
      },
      {
        field: 'cuit',
        headerName: 'CUIT',
        width: 120,
        renderCell: (p) => p.value || '—',
      },
      {
        field: 'codigo_proveedor_tango',
        headerName: 'Código Tango',
        width: 110,
        renderCell: (p) => p.value || '—',
      },
      {
        field: 'acepta_terceros',
        headerName: 'Acepta terceros',
        width: 130,
        sortable: false,
        valueGetter: (v, row) =>
          row.tipo === 'PROVEEDOR' || rowDestinoTipoU(row) === 'PROVEEDOR'
            ? Boolean(row.acepta_terceros ?? row.Acepta_Terceros)
            : null,
        renderCell: (p) => {
          if (rowDestinoTipoU(p.row) !== 'PROVEEDOR') return null;
          const acepta = Boolean(p.row.acepta_terceros ?? p.row.Acepta_Terceros);
          return (
            <Chip
              label={acepta ? 'Sí' : 'No'}
              size="small"
              color={acepta ? 'success' : 'default'}
              sx={{ fontWeight: 600 }}
            />
          );
        },
      },
      {
        field: 'cbu',
        headerName: 'CBU',
        width: 110,
        renderCell: (p) => (p.value ? enmascararCBU(p.value) : '—'),
      },
      {
        field: 'activo',
        headerName: 'Estado',
        width: 100,
        renderCell: (p) => {
          const a = rowDestinoActivo(p.row);
          return (
            <Chip
              label={a ? 'Activo' : 'Inactivo'}
              size="small"
              color={a ? 'success' : 'default'}
              variant={a ? 'filled' : 'outlined'}
            />
          );
        },
      },
      {
        field: 'acciones',
        headerName: 'Acciones',
        width: 220,
        sortable: false,
        renderCell: (p) => (
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <Tooltip title="Ver / editar">
              <IconButton size="small" color="primary" onClick={() => handleEdit(p.row)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {(rowDestinoTipoU(p.row) === 'FINANCIERA' ||
              rowDestinoTipoU(p.row) === 'FINANCIERO') && (
              <Tooltip title="Gestionar cuentas de terceros">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => setCuentasDestino(p.row)}
                >
                  <AccountBalanceIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {rowDestinoTipoU(p.row) === 'PROVEEDOR' &&
              Boolean(p.row.acepta_terceros ?? p.row.Acepta_Terceros) && (
                <Tooltip title="Gestionar terceros del proveedor">
                  <IconButton
                    size="small"
                    color="warning"
                    onClick={() => setTercerosProveedorDestino(p.row)}
                  >
                    <PeopleIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            <Tooltip title={rowDestinoActivo(p.row) ? 'Desactivar' : 'Activar'}>
              <IconButton size="small" onClick={() => handleToggleDestino(p.row)}>
                {rowDestinoActivo(p.row) ? (
                  <ToggleOffIcon fontSize="small" color="warning" />
                ) : (
                  <ToggleOnIcon fontSize="small" color="success" />
                )}
              </IconButton>
            </Tooltip>
            {!rowDestinoActivo(p.row) && (
              <Tooltip title="Eliminar permanentemente">
                <IconButton size="small" color="error" onClick={() => handleEliminarDestino(p.row)}>
                  <DeleteForeverIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ),
      },
    ],
    []
  );

  return (
    <Container maxWidth={false} sx={{ mt: 2, mb: 4, px: { xs: 1, sm: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1A237E' }}>
          Gestión de Destinos
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNuevo} sx={{ bgcolor: '#1A237E' }}>
          Nuevo destino
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2,
          alignItems: 'center',
          p: 2,
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 1,
        }}
      >
        <TextField
          select
          label="Tipo"
          size="small"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="PROVEEDOR">Proveedor</MenuItem>
          <MenuItem value="FINANCIERA">Financiera</MenuItem>
          <MenuItem value="CLIENTE_FINANCIERO">Cliente Financiero</MenuItem>
          <MenuItem value="CTA_PROPIA">Cta. Propia</MenuItem>
        </TextField>
        <TextField
          select
          label="Estado"
          size="small"
          value={activo}
          onChange={(e) => setActivo(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Todos</MenuItem>
          <MenuItem value="true">Activos</MenuItem>
          <MenuItem value="false">Inactivos</MenuItem>
        </TextField>
        <TextField
          label="Buscar"
          size="small"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          sx={{ minWidth: 220, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          placeholder="Nombre, CUIT, código Tango…"
        />
        <Button variant="outlined" onClick={limpiarFiltros}>
          Limpiar filtros
        </Button>
      </Box>

      <Box sx={{ height: 560, width: '100%', bgcolor: 'background.paper', borderRadius: 2, boxShadow: 1, p: 1 }}>
        <DataGrid
          rows={destinos}
          columns={columns}
          rowCount={total}
          loading={loading}
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={paginationModel}
          paginationMode="server"
          onPaginationModelChange={setPaginationModel}
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={(m) => {
            setSortModel(m.length ? m : [{ field: 'id', sort: 'asc' }]);
            setPaginationModel((p) => ({ ...p, page: 0 }));
          }}
          getRowId={(r) => String(rowDestinoId(r))}
          disableRowSelectionOnClick
          sx={{
            border: 0,
            '& .MuiDataGrid-columnHeaders': { bgcolor: '#f5f5f5', color: '#1A237E', fontWeight: 'bold' },
          }}
        />
      </Box>

      <DestinoFormModal
        key={editId != null ? String(editId) : 'nuevo'}
        open={formOpen}
        destinoId={editId}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          showSnack(editId ? 'Destino actualizado' : 'Destino creado correctamente');
          load();
        }}
      />

      {cuentasDestino && (
        <CuentasTercerosModal
          open={Boolean(cuentasDestino)}
          destino={cuentasDestino}
          onClose={() => setCuentasDestino(null)}
          onChanged={() => showSnack('Cuentas actualizadas')}
        />
      )}

      {tercerosProveedorDestino && (
        <TercerosProveedoresModal
          open={Boolean(tercerosProveedorDestino)}
          destino={tercerosProveedorDestino}
          onClose={() => setTercerosProveedorDestino(null)}
        />
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Destinos;
