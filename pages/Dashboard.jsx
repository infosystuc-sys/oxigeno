import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Paper, Typography, IconButton, Container, Button,
  CircularProgress, Alert, Chip, Snackbar, Select, MenuItem, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, AlertTitle,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PostAddIcon from '@mui/icons-material/PostAdd';
import PaymentIcon from '@mui/icons-material/Payment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { DataGrid } from '@mui/x-data-grid';
import {
  getTransfers, getDestinos, updateTransfer, deleteTransfer, sanitizeTransferWritePayload,
} from '../hooks/useTransferAPI';
import EditarTransferenciaModal from '../components/EditarTransferenciaModal';
import AsignarCuentaProveedorDialog from '../components/AsignarCuentaProveedorDialog';
import DocumentoPreviewDialog from '../components/DocumentoPreviewDialog';
import { formatMontoConSimbolo } from '../utils/moneyFormat';

// ─── Celda con Select inline ─────────────────────────────────────────────────
function SelectCell({ value, options, rowId, field, onSave }) {
  const isObj = options.length > 0 && typeof options[0] === 'object';
  return (
    <Select
      value={value ?? ''}
      size="small"
      variant="standard"
      disableUnderline
      fullWidth
      displayEmpty
      onChange={(e) => onSave(rowId, field, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      sx={{
        fontSize: '0.85rem',
        height: '100%',
        '& .MuiSelect-select': { py: 0 },
      }}
    >
      <MenuItem value="" disabled sx={{ fontStyle: 'italic', color: '#999' }}>
        — seleccionar —
      </MenuItem>
      {isObj
        ? options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value} dense>{opt.label}</MenuItem>
          ))
        : options.map((opt) => (
            <MenuItem key={opt} value={opt} dense>{opt}</MenuItem>
          ))}
    </Select>
  );
}

function buildUpdatePayload(r) {
  return {
    CodigoTransferencia: r.CodigoTransferencia,
    PersonaAsignada:     r.PersonaAsignada  ?? null,
    Cliente:             r.Cliente          ?? null,
    COD_CLIENT:          r.COD_CLIENT       ?? null,
    TIPO_ORIGEN:         r.TIPO_ORIGEN      ?? 'CLIENTE',
    Destino:             r.Destino          ?? null,
    Usuario:             r.Usuario          ?? null,
    TipoTransaccion:     r.TipoTransaccion  ?? 'Transferencia',
    Monto:               r.Monto,
    Estado:              r.Estado           ?? 'Disponible',
    FECHA:               r.FECHA,
    FechaComprobante:    r.FechaComprobante,
    FechaEnvio:          r.FechaEnvio,
    FechaRegistro:       r.FechaRegistro    ?? null,
    IDTransferencia:     r.IDTransferencia  ?? null,
    CUITOrigen:          r.CUITOrigen       ?? null,
    CtaOrigen:           r.CtaOrigen        ?? null,
    CBUOrigen:           r.CBUOrigen        ?? null,
    CUITDestino:         r.CUITDestino      ?? null,
    CtaDestino:          r.CtaDestino       ?? null,
    CBUDestino:          r.CBUDestino       ?? null,
    Banco:               r.Banco            ?? null,
    Concepto:            r.Concepto         ?? null,
    destino_id:          r.destino_id != null && r.destino_id !== '' ? Number(r.destino_id) : null,
    destino_tipo:        r.destino_tipo     ?? null,
    cuenta_tercera_id:   r.cuenta_tercera_id != null && r.cuenta_tercera_id !== '' ? Number(r.cuenta_tercera_id) : null,
    tercero_proveedor_id:
      r.tercero_proveedor_id != null && r.tercero_proveedor_id !== ''
        ? Number(r.tercero_proveedor_id)
        : null,
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [rows,                   setRows]                   = useState([]);
  const [loading,                setLoading]                = useState(true);
  const [apiError,               setApiError]               = useState(null);
  const [destinos,               setDestinos]               = useState([]);
  const [snack,                  setSnack]                  = useState({ open: false, msg: '', severity: 'success' });
  const [transferenciaEditando,  setTransferenciaEditando]  = useState(null);
  const [modalAbierto,           setModalAbierto]           = useState(false);
  const [asignarCuentaOpen,      setAsignarCuentaOpen]      = useState(false);
  const [transferenciaAsignar,  setTransferenciaAsignar]    = useState(null);
  const [documentoPreview, setDocumentoPreview] = useState({
    open: false,
    previewUrl: '',
    tipo: 'recibo',
    transferenciaId: null,
    modo: 'visualizar',
  });
  const [generandoRecibo, setGenerandoRecibo] = useState(false);
  const [confirmGenerar, setConfirmGenerar] = useState({ open: false, transferencia: null });

  // Ref para leer el estado actual dentro de callbacks memoizados
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // ── carga inicial ──
  const loadAll = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [txRes, destRes] = await Promise.all([
        getTransfers(),
        getDestinos({ activo: 'true', pageSize: 500 }),
      ]);
      setRows(
        (txRes.transfers || []).map((row) => ({
          ...row,
          REC_EMITIDO: row.REC_EMITIDO ?? null,
          OP_EMITIDA: row.OP_EMITIDA ?? null,
        }))
      );
      setDestinos(destRes.items || []);
    } catch {
      setApiError('Sin conexión con la BD.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── guardar cambio de celda ──
  const handleSave = useCallback(async (rowId, field, value) => {
    const original = rowsRef.current.find((r) => r.id === rowId);
    if (!original) return;

    let updated = { ...original, [field]: value };
    if (field === 'destino_id') {
      const idNum = value === '' || value == null ? null : Number(value);
      const dest = idNum != null ? destinos.find((d) => d.id === idNum) : null;
      updated = {
        ...updated,
        destino_id: idNum,
        destino_tipo: null,
        tercero_proveedor_id: null,
        cuenta_tercera_id: null,
        DestinoCatalogoTipo: dest ? dest.tipo : null,
        DestinoNombreCatalogo: dest ? (dest.razon_social || dest.destinos) : null,
        TerceroProveedorNombre: null,
      };
    }
    if (field === 'Estado' && value === 'Disponible') {
      updated = {
        ...updated,
        destino_tipo: null,
        tercero_proveedor_id: null,
        TerceroProveedorNombre: null,
      };
    }

    setRows((prev) => prev.map((r) => (r.id === rowId ? updated : r)));

    try {
      await updateTransfer(rowId, sanitizeTransferWritePayload(buildUpdatePayload(updated)));
      setSnack({ open: true, msg: 'Registro actualizado', severity: 'success' });
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === rowId ? original : r)));
      setSnack({ open: true, msg: `Error al guardar: ${err.message}`, severity: 'error' });
    }
  }, [destinos]);

  // ── abrir / cerrar modal de edición ──
  const handleAbrirModal = useCallback((row) => {
    setTransferenciaEditando(row);
    setModalAbierto(true);
  }, []);

  const handleTransferenciaActualizada = useCallback((actualizado) => {
    setRows((prev) => prev.map((r) => (r.id === actualizado.id ? { ...r, ...actualizado } : r)));
    setSnack({ open: true, msg: 'Transferencia actualizada correctamente', severity: 'success' });
  }, []);

  const handleCerrarDocumentoPreview = useCallback(() => {
    setDocumentoPreview({
      open: false,
      previewUrl: '',
      tipo: 'recibo',
      transferenciaId: null,
      modo: 'visualizar',
    });
  }, []);

  const handleVisualizarRecibo = useCallback((row) => {
    setDocumentoPreview({
      open: true,
      previewUrl: `/api/transfers/${row.id}/visualizar-recibo`,
      tipo: 'recibo',
      transferenciaId: row.id,
      modo: 'visualizar',
    });
  }, []);

  const handleGenerarReciboClick = useCallback((row) => {
    setConfirmGenerar({ open: true, transferencia: row });
  }, []);

  const handleConfirmGenerar = useCallback(async () => {
    const transferencia = confirmGenerar.transferencia;
    if (!transferencia) return;
    setConfirmGenerar({ open: false, transferencia: null });
    setGenerandoRecibo(true);

    try {
      const response = await fetch(
        `/api/transfers/${transferencia.id}/generar-recibo`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );

      const data = await response.json();

      // HTTP 409: recibo ya emitido
      if (response.status === 409) {
        alert('⚠️ Este recibo ya fue generado anteriormente.\n\nUse el botón "Visualizar" para verlo.');
        return;
      }

      // Cualquier otro error
      if (!response.ok) {
        throw new Error(data.error || 'Error al generar recibo');
      }

      // Éxito: actualizar la fila en el grid localmente
      setRows((prev) =>
        prev.map((t) =>
          t.id === transferencia.id
            ? { ...t, REC_EMITIDO: 'S' }
            : t
        )
      );

      // Mensaje diferenciado según si se insertó en GVA12 o no
      const mensajeGVA12 = data['insertó_gva12']
        ? `ID Tango GVA12: ${data.id_gva12}`
        : 'Origen no comercial — GVA12 no aplica';

      alert(`✅ Recibo generado correctamente\n\nN° Comprobante: ${data.n_comp}\n${mensajeGVA12}`);

      // Abrir preview
      setDocumentoPreview({
        open: true,
        previewUrl: `/api/transfers/${transferencia.id}/visualizar-recibo`,
        tipo: 'recibo',
        transferenciaId: transferencia.id,
        modo: 'generado',
      });
    } catch (err) {
      console.error('Error al generar recibo:', err);
      alert(`❌ Error al generar recibo: ${err.message}`);
    } finally {
      setGenerandoRecibo(false);
    }
  }, [confirmGenerar.transferencia]);

  const handleAbrirComprobantePago = useCallback((row) => {
    if (String(row.Estado || '').trim() !== 'Utilizada') return;
    setDocumentoPreview({
      open: true,
      previewUrl: `/api/transfers/${row.id}/generar-comprobante-pago`,
      tipo: 'pago',
      transferenciaId: row.id,
      modo: 'visualizar',
    });
  }, []);

  const handleEliminarTransferencia = useCallback(async (row) => {
    const codigo = row.CodigoTransferencia || `ID ${row.id}`;
    if (!window.confirm(`¿Eliminar la transferencia "${codigo}"?\nEsta acción no se puede deshacer.`)) return;
    try {
      await deleteTransfer(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setSnack({ open: true, msg: 'Transferencia eliminada', severity: 'success' });
      if (transferenciaEditando?.id === row.id) {
        setModalAbierto(false);
        setTransferenciaEditando(null);
      }
    } catch (err) {
      setSnack({ open: true, msg: err.message || 'No se pudo eliminar', severity: 'error' });
    }
  }, [transferenciaEditando?.id]);

  const destSelectOptionsForOrigen = useCallback(
    (tipoOrigen) => {
      const u = String(tipoOrigen ?? '').trim().toUpperCase();
      let list = destinos;
      if (u === 'FINANCIERA' || u === 'CLIENTE_FINANCIERO') {
        list = destinos.filter((d) => d.tipo === 'PROVEEDOR');
      }
      // CLIENTE: todos los destinos
      return list.map((d) => ({
        value: String(d.id),
        label: `${d.destinos}${d.razon_social ? ` — ${d.razon_social}` : ''} (${d.tipo})`,
      }));
    },
    [destinos]
  );

  const aplicarAsignacionProveedorYEstado = async (row, { destino_tipo, tercero_proveedor_id }) => {
    const updated = {
      ...row,
      Estado: 'Utilizada',
      destino_tipo,
      tercero_proveedor_id,
    };
    try {
      await updateTransfer(row.id, sanitizeTransferWritePayload(buildUpdatePayload(updated)));
      setSnack({ open: true, msg: 'Registro actualizado', severity: 'success' });
      setAsignarCuentaOpen(false);
      setTransferenciaAsignar(null);
      await loadAll();
    } catch (err) {
      setSnack({ open: true, msg: `Error al guardar: ${err.message}`, severity: 'error' });
    }
  };

  // ── definición de columnas (memo para estabilidad) ──
  const columns = useMemo(() => [
    {
      field: 'id',
      headerName: 'ID',
      width: 60,
    },
    {
      field: 'FECHA',
      headerName: 'Fecha',
      width: 110,
    },
    {
      field: 'CodigoTransferencia',
      headerName: 'Cód. Transferencia',
      width: 100,
      sortable: false,
      renderCell: (p) => (
        <Tooltip title={p.row.CodigoTransferencia || ''}>
          <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem', maxWidth: '100%' }}>
            {p.row.CodigoTransferencia || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'PersonaAsignada',
      headerName: 'Titular Cuenta Origen',
      width: 160,
      sortable: false,
      renderCell: (p) => (
        <Tooltip title={p.row.PersonaAsignada || ''}>
          <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem', maxWidth: '100%' }}>
            {p.row.PersonaAsignada || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'TIPO_ORIGEN',
      headerName: 'Origen',
      width: 150,
      sortable: false,
      renderCell: (p) => {
        const tipo = String(p.row.TIPO_ORIGEN ?? '').toUpperCase();
        let label = tipo || 'Sin origen';
        let color = 'default';
        switch (tipo) {
          case 'CLIENTE':
            label = 'Comercial';
            color = 'info';
            break;
          case 'CLIENTE_FINANCIERO':
            label = 'Cliente Financiero';
            color = 'warning';
            break;
          case 'FINANCIERA':
            label = 'Financiera';
            color = 'success';
            break;
          default:
            break;
        }
        return (
          <Chip label={label} size="small" color={color} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
        );
      },
    },
    {
      field: 'COD_CLIENT',
      headerName: 'Cód. Origen',
      width: 90,
      sortable: false,
      renderCell: (p) => (
        <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem' }}>
          {p.row.COD_CLIENT || '—'}
        </Typography>
      ),
    },
    {
      field: 'Cliente',
      headerName: 'Cliente/Cuenta',
      width: 210,
      sortable: false,
      renderCell: (p) => (
        <Tooltip title={p.row.Cliente || ''}>
          <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem', maxWidth: '100%' }}>
            {p.row.Cliente || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'Monto',
      headerName: 'Monto',
      width: 200,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          width: '100%',
          height: '100%',
          pr: 1,
          fontWeight: 600,
        }}
        >
          {formatMontoConSimbolo(p.value)}
        </Box>
      ),
    },
    {
      field: 'Destino',
      headerName: 'Cuenta Recepción',
      width: 200,
      sortable: false,
      renderCell: (p) => (
        <Tooltip title={p.row.Destino || ''}>
          <Typography variant="body2" noWrap sx={{ fontSize: '0.85rem', maxWidth: '100%' }}>
            {p.row.Destino || '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'destino_id',
      headerName: 'Imputacion Transferencia',
      width: 300,
      sortable: false,
      renderCell: (p) => {
        const cat = String(p.row.DestinoCatalogoTipo ?? '').toUpperCase();
        const chipCatalog = cat === 'FINANCIERO' ? 'FINANCIERA' : cat;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', gap: 0.5 }}>
            {chipCatalog ? (
              <Chip
                label={
                  chipCatalog === 'CTA_PROPIA'
                    ? 'Cta. Propia'
                    : chipCatalog === 'CLIENTE_FINANCIERO'
                      ? 'Cliente Fin.'
                      : chipCatalog === 'FINANCIERA'
                        ? 'Financiera'
                        : chipCatalog === 'PROVEEDOR'
                          ? 'Proveedor'
                          : chipCatalog
                }
                size="small"
                sx={{
                  flexShrink: 0,
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  ...(chipCatalog === 'PROVEEDOR'
                    ? { bgcolor: 'primary.light', color: 'primary.dark' }
                    : chipCatalog === 'FINANCIERA'
                      ? { bgcolor: 'success.light', color: 'success.dark' }
                      : chipCatalog === 'CLIENTE_FINANCIERO'
                        ? { bgcolor: 'warning.light', color: 'warning.dark' }
                        : chipCatalog === 'CTA_PROPIA'
                          ? { bgcolor: 'secondary.light', color: 'secondary.dark' }
                          : { bgcolor: 'action.hover', color: 'text.primary' }),
                }}
              />
            ) : null}
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={p.row.DestinoNombreCatalogo || ''}>
              {p.row.DestinoNombreCatalogo || 'Sin asignar'}
            </Typography>
            {p.row.cuenta_tercera_id ? (
              <Tooltip title={`Tercero: ${p.row.CuentaTerceroTitular || ''} — CBU ${p.row.CuentaTerceroCBU || ''}`}>
                <InfoOutlinedIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
              </Tooltip>
            ) : null}
            <Box sx={{ flexShrink: 0, minWidth: 120 }}>
              <SelectCell
                value={p.row.destino_id != null ? String(p.row.destino_id) : ''}
                options={destSelectOptionsForOrigen(p.row.TIPO_ORIGEN)}
                rowId={p.row.id}
                field="destino_id"
                onSave={handleSave}
              />
            </Box>
          </Box>
        );
      },
    },
    {
      field: 'cuenta_asignacion',
      headerName: 'Tipo cuenta',
      width: 170,
      sortable: false,
      renderCell: (p) => {
        const rawTipo = p.row.destino_tipo;
        const tipo = rawTipo == null || rawTipo === '' ? '' : String(rawTipo).trim().toUpperCase();
        const nom = p.row.TerceroProveedorNombre;
        const esAsig = tipo === 'PROPIA' || tipo === 'TERCERO';
        if (!tipo || !esAsig) {
          return <Chip label="Sin asignar" size="small" color="warning" sx={{ fontSize: '0.7rem' }} />;
        }
        if (tipo === 'PROPIA') {
          return <Chip label="Propia" size="small" color="success" sx={{ fontSize: '0.7rem' }} />;
        }
        return (
          <Tooltip title={nom || 'Tercero'}>
            <Chip label={`Tercero: ${nom || '?'}`} size="small" color="info" sx={{ fontSize: '0.7rem' }} />
          </Tooltip>
        );
      },
    },
    {
      field: 'Estado',
      headerName: 'Estado',
      width: 140,
      sortable: false,
      disableClickEventBubbling: true,
      renderCell: (p) => {
        const estado = p.row.Estado;
        const chipColor =
          estado === 'Disponible'
            ? 'success'
            : estado === 'Utilizada'
              ? 'default'
              : estado === 'Pendiente'
                ? 'warning'
                : 'default';
        return (
          <Chip
            label={estado || 'Sin estado'}
            size="small"
            color={chipColor}
            onClick={(e) => {
              e.stopPropagation();
              if (estado === 'Disponible') {
                const cat = String(p.row.DestinoCatalogoTipo ?? '').toUpperCase();
                const asig = String(p.row.destino_tipo ?? '').trim().toUpperCase();
                const tieneAsignacion = asig === 'PROPIA' || asig === 'TERCERO';
                const origen = String(p.row.TIPO_ORIGEN ?? '').trim().toUpperCase();
                const requiereDialogoProveedor =
                  (origen === 'FINANCIERA' || origen === 'CLIENTE_FINANCIERO') &&
                  cat === 'PROVEEDOR' &&
                  !tieneAsignacion;
                if (requiereDialogoProveedor) {
                  setTransferenciaAsignar(p.row);
                  setAsignarCuentaOpen(true);
                  return;
                }
                handleSave(p.row.id, 'Estado', 'Utilizada');
              } else if (estado === 'Utilizada') {
                handleSave(p.row.id, 'Estado', 'Disponible');
              } else {
                handleSave(p.row.id, 'Estado', 'Disponible');
              }
            }}
            sx={{
              cursor: 'pointer',
              fontWeight: 'bold',
              '&:hover': {
                opacity: 0.88,
                transform: 'scale(1.05)',
                transition: 'all 0.2s',
              },
            }}
          />
        );
      },
    },
    {
      field: 'acciones',
      headerName: 'Acciones',
      width: 240,
      sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          <Tooltip title="Editar transferencia">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleAbrirModal(p.row);
              }}
              sx={{ color: '#553278' }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Visualizar recibo (sin registrar en Tango)">
            <IconButton
              size="small"
              color="info"
              onClick={(e) => {
                e.stopPropagation();
                handleVisualizarRecibo(p.row);
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {/* Botón GENERAR Recibo */}
          <Tooltip title={
            p.row.REC_EMITIDO === 'S'
              ? 'Recibo ya generado — usar Visualizar para ver'
              : 'Generar recibo y registrar en Tango'
          }
          >
            <span>
              <IconButton
                size="small"
                color={p.row.REC_EMITIDO === 'S' ? 'default' : 'primary'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerarReciboClick(p.row);
                }}
                disabled={generandoRecibo || p.row.REC_EMITIDO === 'S'}
              >
                <PostAddIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {String(p.row.Estado || '').trim() === 'Utilizada' ? (
            <Tooltip title="Comprobante de pago">
              <IconButton
                size="small"
                color="success"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAbrirComprobantePago(p.row);
                }}
              >
                <PaymentIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title="Eliminar transferencia">
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                handleEliminarTransferencia(p.row);
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ], [
    handleSave,
    destSelectOptionsForOrigen,
    handleAbrirModal,
    handleEliminarTransferencia,
    handleVisualizarRecibo,
    handleGenerarReciboClick,
    handleAbrirComprobantePago,
    generandoRecibo,
  ]);

  return (
    <Container maxWidth={false} sx={{ mt: 2, mb: 3, px: { xs: 1, sm: 2 } }}>
      <Paper sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', boxShadow: 2 }}>

        {/* Header */}
        <Box sx={{
          p: 2,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #e0e0e0',
        }}>
          <Typography variant="h6" color="#1A237E" fontWeight="bold">
            Transferencias
            {!loading && !apiError && (
              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                ({rows.length} registros)
              </Typography>
            )}
          </Typography>
          <IconButton size="small" onClick={loadAll} disabled={loading}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>

        {apiError && <Alert severity="warning" sx={{ mx: 2, mt: 1 }}>{apiError}</Alert>}

        <Box sx={{ height: 540 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress size={40} sx={{ color: '#1A237E' }} />
            </Box>
          ) : (
            <DataGrid
              rows={rows}
              columns={columns}
              initialState={{ pagination: { paginationModel: { page: 0, pageSize: 10 } } }}
              pageSizeOptions={[10, 25, 50]}
              disableRowSelectionOnClick
              rowHeight={46}
              sx={{
                border: 0,
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: '#f5f5f5',
                  color: '#1A237E',
                  fontWeight: 'bold',
                  borderBottom: '2px solid #e0e0e0',
                },
                '& .MuiDataGrid-row:hover': { backgroundColor: '#f3f5ff' },
                '& .MuiDataGrid-cell': { alignItems: 'center', display: 'flex' },
              }}
            />
          )}
        </Box>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>

      <DocumentoPreviewDialog
        open={documentoPreview.open}
        onClose={handleCerrarDocumentoPreview}
        previewUrl={documentoPreview.previewUrl}
        tipo={documentoPreview.tipo}
        transferenciaId={documentoPreview.transferenciaId}
        modo={documentoPreview.modo}
      />

      {/* Diálogo de confirmación — Generar Recibo en Tango */}
      <Dialog
        open={confirmGenerar.open}
        onClose={() => setConfirmGenerar({ open: false, transferencia: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Generar Recibo en Tango
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Atenci&oacute;n</AlertTitle>
            Esta acci&oacute;n crear&aacute; un registro en la tabla GVA12 de Tango.
            No se puede deshacer.
          </Alert>
          {confirmGenerar.transferencia && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="body2">
                <strong>C&oacute;digo:</strong> {confirmGenerar.transferencia.CodigoTransferencia}
              </Typography>
              <Typography variant="body2">
                <strong>Cliente:</strong> {confirmGenerar.transferencia.Cliente}
              </Typography>
              <Typography variant="body2">
                <strong>C&oacute;d. Cliente:</strong> {confirmGenerar.transferencia.COD_CLIENT || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Monto:</strong> {formatMontoConSimbolo(confirmGenerar.transferencia.Monto)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmGenerar({ open: false, transferencia: null })}
            color="inherit"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmGenerar}
            variant="contained"
            color="primary"
            disabled={generandoRecibo}
            startIcon={generandoRecibo ? <CircularProgress size={16} /> : <PostAddIcon />}
          >
            {generandoRecibo ? 'Generando...' : 'Confirmar y Generar'}
          </Button>
        </DialogActions>
      </Dialog>

      {modalAbierto && transferenciaEditando && (
        <EditarTransferenciaModal
          transferencia={transferenciaEditando}
          onClose={() => setModalAbierto(false)}
          onGuardado={(actualizado) => handleTransferenciaActualizada(actualizado)}
        />
      )}

      <AsignarCuentaProveedorDialog
        open={asignarCuentaOpen}
        onClose={() => { setAsignarCuentaOpen(false); setTransferenciaAsignar(null); }}
        transferencia={transferenciaAsignar}
        onConfirm={(payload) => {
          if (transferenciaAsignar) aplicarAsignacionProveedorYEstado(transferenciaAsignar, payload);
        }}
      />
    </Container>
  );
};

export default Dashboard;
