import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Chip,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function DocumentoPreviewDialog({
  open,
  onClose,
  previewUrl,
  tipo,
  transferenciaId,
  modo = 'visualizar',
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) setLoading(true);
  }, [open, previewUrl]);

  const handlePrint = () => {
    const iframe = document.getElementById('documento-preview-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }
  };

  const handleDownloadPDF = () => {
    if (transferenciaId == null) return;
    let pdfUrl;
    if (tipo === 'recibo') {
      pdfUrl = `/api/transfers/${transferenciaId}/visualizar-recibo-pdf`;
    } else {
      pdfUrl = `/api/transfers/${transferenciaId}/generar-comprobante-pago-pdf`;
    }
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const titulo =
    tipo === 'recibo'
      ? modo === 'generado'
        ? 'Recibo Generado en Tango'
        : 'Vista previa — Recibo'
      : 'Vista previa — Comprobante de pago';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 5, display: 'flex', alignItems: 'center', gap: 1 }}>
        {titulo}
        {modo === 'generado' && (
          <Chip
            icon={<CheckCircleIcon />}
            label="Registrado en Tango"
            color="success"
            size="small"
            sx={{ ml: 1 }}
          />
        )}
        <IconButton
          aria-label="cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ height: '70vh', p: 0, position: 'relative' }}>
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'background.paper',
              zIndex: 1,
            }}
          >
            <CircularProgress />
          </Box>
        )}
        {open && previewUrl ? (
          <iframe
            id="documento-preview-iframe"
            key={previewUrl}
            title={titulo}
            src={previewUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
            onLoad={() => setLoading(false)}
          />
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handlePrint} startIcon={<PrintIcon />} color="inherit">
          Imprimir
        </Button>
        <Button onClick={handleDownloadPDF} variant="contained" startIcon={<DownloadIcon />}>
          Descargar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
