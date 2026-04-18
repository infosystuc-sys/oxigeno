/**
 * usePaymentValidation.js — ValidationService + REST (insert / update).
 */

import { useState, useCallback, useEffect } from 'react';
import ValidationService from './ValidationService';
import { checkDuplicate, insertTransfer, updateTransfer, formDataToApiPayload } from './useTransferAPI';

/**
 * @param {Object|null} extractedData - Payload para ValidationService (formato OCR / fila BD)
 * @param {{ editingId: number|null }} options - Si hay id, se actualiza fila y se excluye del duplicado
 */
const usePaymentValidation = (extractedData, options = {}) => {
  const { editingId = null, onSaveSuccess } = options;
  const [report, setReport] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  /** 'disponible' | 'utilizada' | null — para mostrar spinner solo en el botón pulsado */
  const [saveIntent, setSaveIntent] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  useEffect(() => {
    if (!extractedData?.CodigoTransferencia) {
      setReport(null);
      return;
    }

    const runValidation = async () => {
      let historicalRecords = [];
      try {
        const { isDuplicate, existingRecord } = await checkDuplicate(
          extractedData.CodigoTransferencia,
          editingId
        );
        if (isDuplicate) {
          historicalRecords = [{ CodigoTransferencia: extractedData.CodigoTransferencia }];
        }
        console.info('[ValidationService] BD — isDuplicate:', isDuplicate, existingRecord);
      } catch (err) {
        console.warn('[ValidationService] BD no disponible:', err.message);
      }
      const validationReport = ValidationService.validate(extractedData, historicalRecords);
      setReport(validationReport);
      console.info('[ValidationService] Reporte:', validationReport);
    };

    runValidation();
  }, [extractedData, editingId]);

  const handleApprove = useCallback(
    async (currentFormData) => {
      if (!editingId && (!report || report.blockApproval)) {
        if (report?.blockApproval) {
          setSaveResult({
            success: false,
            message: 'No se puede aprobar: ' + report.alerts.join(' | '),
          });
        }
        return;
      }
      if (editingId && report?.blockApproval) {
        setSaveResult({
          success: false,
          message: 'No se puede guardar: ' + report.alerts.join(' | '),
        });
        return;
      }

      setIsSaving(true);
      setSaveIntent('utilizada');
      setSaveResult(null);

      try {
        const payload = formDataToApiPayload({ ...currentFormData, estado: 'Utilizada' });
        const result = editingId
          ? await updateTransfer(editingId, payload)
          : await insertTransfer(payload);
        const message =
          result.message || (editingId ? 'Transferencia actualizada.' : 'Registro guardado como Utilizada.');
        if (onSaveSuccess) {
          onSaveSuccess(result);
        } else {
          setSaveResult({ success: true, message });
        }
      } catch (err) {
        setSaveResult({ success: false, message: err.message || 'Error al guardar.' });
      } finally {
        setIsSaving(false);
        setSaveIntent(null);
      }
    },
    [report, editingId, onSaveSuccess]
  );

  const handleReject = useCallback(
    async (currentFormData) => {
      setIsSaving(true);
      setSaveIntent('disponible');
      setSaveResult(null);

      try {
        const payload = formDataToApiPayload({ ...currentFormData, estado: 'Disponible' });
        const result = editingId
          ? await updateTransfer(editingId, payload)
          : await insertTransfer(payload);
        const message =
          result.message || (editingId ? 'Actualizado como Disponible.' : 'Registrado como Disponible.');
        if (onSaveSuccess) {
          onSaveSuccess(result);
        } else {
          setSaveResult({ success: true, message });
        }
      } catch (err) {
        setSaveResult({ success: false, message: err.message || 'Error al guardar.' });
      } finally {
        setIsSaving(false);
        setSaveIntent(null);
      }
    },
    [editingId, onSaveSuccess]
  );

  const clearSaveResult = useCallback(() => setSaveResult(null), []);

  return {
    report,
    isApproveBlocked: report?.blockApproval ?? false,
    confidenceScore: report?.confidenceScore ?? null,
    alerts: report?.alerts ?? [],
    statusSuggestion: report?.statusSuggestion ?? null,
    isDuplicate: report?.isDuplicate ?? false,
    handleApprove,
    handleReject,
    isSaving,
    saveIntent,
    saveResult,
    clearSaveResult,
  };
};

export default usePaymentValidation;
