import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import { formatMontoConSimbolo } from '../utils/moneyFormat';

export default function AsignarCuentaProveedorDialog({ open, onClose, transferencia, onConfirm }) {
  const [tipoCuenta, setTipoCuenta] = useState('PROPIA');
  const [terceroId, setTerceroId] = useState('');
  const [terceros, setTerceros] = useState([]);
  const [loadingTerceros, setLoadingTerceros] = useState(false);
  const [aceptaTerceros, setAceptaTerceros] = useState(false);

  useEffect(() => {
    if (!open || !transferencia?.destino_id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingTerceros(true);
        setTerceroId('');
        setTipoCuenta('PROPIA');
        const destinoResponse = await fetch(`/api/destinos/${transferencia.destino_id}`);
        const destinoData = await destinoResponse.json();
        if (cancelled) return;
        const dest = destinoData.destino;
        const acepta = Boolean(dest?.acepta_terceros);
        setAceptaTerceros(acepta);
        if (acepta) {
          const tercerosResponse = await fetch(
            `/api/destinos/${transferencia.destino_id}/terceros-proveedores`
          );
          const tercerosData = await tercerosResponse.json();
          if (!cancelled) setTerceros(tercerosData.terceros || []);
        } else if (!cancelled) setTerceros([]);
      } catch {
        if (!cancelled) {
          setAceptaTerceros(false);
          setTerceros([]);
        }
      } finally {
        if (!cancelled) setLoadingTerceros(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, transferencia]);

  const handleConfirm = () => {
    if (tipoCuenta === 'TERCERO' && !terceroId) {
      window.alert('Debe seleccionar un tercero');
      return;
    }
    onConfirm({
      destino_tipo: tipoCuenta,
      tercero_proveedor_id: tipoCuenta === 'TERCERO' ? Number(terceroId) : null,
    });
  };

  const montoVal = transferencia?.Monto;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Asignar tipo de cuenta del proveedor</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Destino: <strong>{transferencia?.DestinoNombreCatalogo || '—'}</strong>
          </Typography>
          <Typography variant="body2">
            Monto:{' '}
            <strong>
              {montoVal === undefined || montoVal === null || montoVal === ''
                ? '—'
                : formatMontoConSimbolo(montoVal)}
            </strong>
          </Typography>
        </Alert>

        <FormControl component="fieldset" fullWidth disabled={loadingTerceros}>
          <FormLabel component="legend">¿A qué cuenta va esta transferencia?</FormLabel>
          <RadioGroup value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)}>
            <FormControlLabel value="PROPIA" control={<Radio />} label="Cuenta propia del proveedor" />
            {aceptaTerceros && terceros.length > 0 ? (
              <FormControlLabel value="TERCERO" control={<Radio />} label="Cuenta de tercero" />
            ) : null}
          </RadioGroup>
        </FormControl>

        {tipoCuenta === 'TERCERO' && aceptaTerceros ? (
          <FormControl fullWidth sx={{ mt: 2 }} disabled={loadingTerceros}>
            <FormLabel>Tercero</FormLabel>
            <Select
              value={terceroId}
              onChange={(e) => setTerceroId(e.target.value)}
              displayEmpty
            >
              <MenuItem value="" disabled>
                Seleccione…
              </MenuItem>
              {terceros.map((tercero) => (
                <MenuItem key={tercero.id} value={String(tercero.id)}>
                  {tercero.nombre_tercero} — {tercero.cbu || 'Sin CBU'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {!aceptaTerceros ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Este proveedor no acepta transferencias a terceros. Solo puede imputarse a cuenta propia.
          </Alert>
        ) : null}
        {aceptaTerceros && terceros.length === 0 && !loadingTerceros ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            No hay terceros activos cargados para este proveedor. Solo puede elegir cuenta propia.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={loadingTerceros}>
          Confirmar y marcar utilizada
        </Button>
      </DialogActions>
    </Dialog>
  );
}
