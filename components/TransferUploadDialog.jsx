import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  LinearProgress,
  CircularProgress,
  Fade,
  Alert,
  AlertTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import useOCRExtraction, {
  GEMINI_MODEL_OPTIONS,
  ANTHROPIC_MODEL_OPTIONS,
} from '../hooks/useOCRExtraction';

const PROCESS_STEPS = [
  'Analizando imagen del comprobante...',
  'Extrayendo datos con OCR...',
  'Validando campos requeridos...',
  'Ejecutando verificaciones de seguridad...',
  '¡Datos extraídos correctamente!',
];

const defaultGeminiModel =
  import.meta.env.VITE_GEMINI_MODEL || GEMINI_MODEL_OPTIONS[0].id;
const defaultAnthropicModel =
  import.meta.env.VITE_ANTHROPIC_MODEL || ANTHROPIC_MODEL_OPTIONS[0].id;

const TransferUploadDialog = ({ open, onClose }) => {
  const navigate = useNavigate();
  const {
    extractData,
    error: ocrError,
    isRetryable: ocrRetryable,
    hasPartialData: ocrHasPartial,
    partialData: ocrPartial,
    resetExtraction,
  } = useOCRExtraction();
  const extractedRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [ocrProvider, setOcrProvider] = useState('gemini');
  const [geminiModel, setGeminiModel] = useState(defaultGeminiModel);
  const [anthropicModel, setAnthropicModel] = useState(defaultAnthropicModel);

  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState(null);
  const [fileObject, setFileObject] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [processFinished, setProcessFinished] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsDragging(false);
    setDroppedFile(null);
    setFileObject(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setFilePreviewUrl(null);
    setProcessing(false);
    setProgress(0);
    setCurrentStep(0);
    setProcessFinished(false);
    extractedRef.current = null;
    resetExtraction();
  }, [open, resetExtraction]);

  const revokeAndClose = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    onClose();
  };

  const assignFile = (file) => {
    if (!file) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    setDroppedFile(file.name);
    setFileObject(file);
    setFilePreviewUrl(url);
    previewUrlRef.current = url;
  };

  const clearFile = (e) => {
    e?.stopPropagation();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setDroppedFile(null);
    setFileObject(null);
    setFilePreviewUrl(null);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); assignFile(e.dataTransfer.files?.[0]); };
  const handleFileInputChange = (e) => assignFile(e.target.files?.[0]);

  const runExtraction = async () => {
    if (!fileObject) return;

    setProcessing(true);
    setProgress(0);
    setCurrentStep(0);
    setProcessFinished(false);
    extractedRef.current = null;

    const animateSteps = async () => {
      const total = PROCESS_STEPS.length;
      for (let i = 0; i < total - 1; i++) {
        setCurrentStep(i);
        const start = (i / total) * 85;
        const end = ((i + 1) / total) * 85;
        for (let t = 0; t <= 12; t++) {
          await new Promise((r) => setTimeout(r, 50));
          setProgress(start + (end - start) * (t / 12));
        }
      }
    };

    try {
      const model = ocrProvider === 'gemini' ? geminiModel : anthropicModel;
      const [extracted] = await Promise.all([
        extractData(fileObject, { provider: ocrProvider, model }),
        animateSteps(),
      ]);
      if (!extracted || typeof extracted !== 'object') {
        throw new Error('La API no devolvió datos. Revisá la consola del navegador.');
      }
      extractedRef.current = extracted;
      setCurrentStep(PROCESS_STEPS.length - 1);
      for (let i = 0; i <= 20; i++) {
        await new Promise((r) => setTimeout(r, 12));
        setProgress(85 + i * 0.75);
      }
      setProcessFinished(true);
    } catch (err) {
      console.error('[TransferUpload]', err);
      setProcessFinished(true);
    }
  };

  const handleValidar = async (e) => {
    e.stopPropagation();
    await runExtraction();
  };

  const handleRetry = async () => {
    if (!fileObject) return;
    resetExtraction();
    setProcessFinished(false);
    await runExtraction();
  };

  const handleManualLoad = () => {
    const url = previewUrlRef.current;
    const file = fileObject;
    navigate('/detail/new', {
      state: {
        extractedData: ocrHasPartial && ocrPartial ? ocrPartial : null,
        partialData: ocrHasPartial ? ocrPartial : null,
        isManualLoad: true,
        filePreviewUrl: url,
        fileName: droppedFile,
        fileMimeType: file?.type ?? '',
      },
    });
    previewUrlRef.current = null;
    onClose();
  };

  const handleGoToDetail = () => {
    const data = extractedRef.current;
    const url = previewUrlRef.current;
    previewUrlRef.current = null;
    setProcessing(false);
    navigate('/detail/new', {
      state: {
        extractedData: data,
        filePreviewUrl: url,
        fileName: droppedFile,
        fileMimeType: fileObject?.type ?? '',
        isManualLoad: false,
        partialData: null,
      },
    });
    onClose();
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessFinished(false);
    resetExtraction();
  };

  const showUpload = !processing;
  const showProgress = processing && !processFinished;
  const showSuccess = processing && processFinished && !ocrError;
  const showErr = processing && processFinished && ocrError;

  const handleDialogClose = (_, reason) => {
    if (processing && !processFinished) return;
    revokeAndClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        Cargar transferencia
        <IconButton
          aria-label="cerrar"
          onClick={revokeAndClose}
          disabled={processing && !processFinished}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        <input
          type="file"
          id="transfer-upload-file"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif"
        />

        {showUpload && (
          <Paper
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            elevation={0}
            sx={{
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: isDragging ? '#e8eaf6' : '#fcfcfc',
              border: '2px dashed',
              borderColor: isDragging ? '#1A237E' : '#bdbdbd',
              borderRadius: 2,
            }}
          >
            <CloudUploadIcon sx={{ fontSize: 48, color: isDragging ? '#1A237E' : '#759efd', mb: 1.5 }} />
            {droppedFile ? (
              <Box sx={{ textAlign: 'center', width: '100%' }}>
                <Typography variant="body2" color="primary" sx={{ mb: 1.5, fontWeight: 'bold' }} noWrap title={droppedFile}>
                  {droppedFile}
                </Typography>
                <Box sx={{ mb: 2, textAlign: 'left' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Motor de análisis
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    fullWidth
                    size="small"
                    value={ocrProvider}
                    onChange={(_, v) => v && setOcrProvider(v)}
                    sx={{ mb: 1.5 }}
                  >
                    <ToggleButton value="gemini">Google Gemini</ToggleButton>
                    <ToggleButton value="anthropic">Anthropic Claude</ToggleButton>
                  </ToggleButtonGroup>
                  <FormControl fullWidth size="small">
                    <InputLabel id="ocr-model-label">Modelo</InputLabel>
                    <Select
                      labelId="ocr-model-label"
                      label="Modelo"
                      value={ocrProvider === 'gemini' ? geminiModel : anthropicModel}
                      onChange={(e) =>
                        ocrProvider === 'gemini'
                          ? setGeminiModel(e.target.value)
                          : setAnthropicModel(e.target.value)
                      }
                    >
                      {(ocrProvider === 'gemini' ? GEMINI_MODEL_OPTIONS : ANTHROPIC_MODEL_OPTIONS).map((opt) => (
                        <MenuItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {ocrProvider === 'anthropic' && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Claude solo procesa imágenes en este flujo; para PDF usá Gemini.
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Button variant="outlined" size="small" onClick={clearFile}>Quitar</Button>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleValidar}
                    sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#388e3c' } }}
                  >
                    Validar comprobante
                  </Button>
                </Box>
              </Box>
            ) : (
              <>
                <Typography variant="body2" sx={{ mb: 0.5 }}>PDF, JPG, PNG</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
                  Arrastrá aquí o elegí archivo
                </Typography>
                <Button variant="contained" component="label" htmlFor="transfer-upload-file" size="small"
                  sx={{ bgcolor: '#1A237E', '&:hover': { bgcolor: '#000666' } }}>
                  Seleccionar archivo
                </Button>
              </>
            )}
          </Paper>
        )}

        {showProgress && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3 }}>
              <CircularProgress size={72} thickness={3} sx={{ color: '#1A237E' }} />
              <Box sx={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CloudUploadIcon sx={{ color: '#1A237E', fontSize: 30 }} />
              </Box>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Procesando…</Typography>
                <Typography variant="caption" color="primary" fontWeight="bold">{Math.round(progress)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={progress} sx={{
                height: 8, borderRadius: 4, backgroundColor: '#e0e0e0',
                '& .MuiLinearProgress-bar': { backgroundColor: '#1A237E', borderRadius: 4 },
              }} />
            </Box>
            <Box sx={{ mt: 2, textAlign: 'left' }}>
              {PROCESS_STEPS.slice(0, -1).map((step, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  {i < currentStep ? <CheckCircleIcon sx={{ color: '#4caf50', fontSize: 16 }} />
                    : i === currentStep ? <CircularProgress size={14} thickness={5} sx={{ color: '#1A237E' }} />
                    : <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #bdbdbd' }} />}
                  <Typography variant="caption" sx={{ color: i <= currentStep ? '#1a1c1c' : '#bdbdbd' }}>{step}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {showSuccess && (
          <Fade in>
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 72, color: '#4caf50', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Comprobante procesado</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Revisá los datos y completá la validación.
              </Typography>
              <Button variant="contained" fullWidth size="large" onClick={handleGoToDetail}
                sx={{ bgcolor: '#1A237E', '&:hover': { bgcolor: '#000666' }, fontWeight: 'bold' }}>
                Ir a validar
              </Button>
            </Box>
          </Fade>
        )}

        {showErr && (
          <Fade in>
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <ErrorOutlineIcon sx={{ fontSize: 72, color: '#e53935', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>Error en la extracción</Typography>
              <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }} icon={<ErrorOutlineIcon />}>
                <AlertTitle>Error en la extracción</AlertTitle>
                {ocrError}
              </Alert>

              {ocrHasPartial && (
                <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                  <AlertTitle>Datos parciales</AlertTitle>
                  Se pudieron recuperar algunos campos del texto del modelo. En carga manual se
                  precompletarán; verificá todo antes de guardar.
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                {ocrRetryable && (
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<RefreshIcon />}
                    onClick={handleRetry}
                  >
                    Intentar de nuevo
                  </Button>
                )}
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<EditIcon />}
                  onClick={handleManualLoad}
                  sx={{ bgcolor: '#1A237E', '&:hover': { bgcolor: '#000666' } }}
                >
                  Cargar manualmente
                </Button>
                <Button variant="text" fullWidth onClick={handleCloseModal}>
                  Volver y elegir otro archivo
                </Button>
              </Box>
            </Box>
          </Fade>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransferUploadDialog;
