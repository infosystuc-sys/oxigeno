import { useState, useCallback } from 'react';
import { formatMontoEsAR, montoToCanonical, parseMontoInput } from '../utils/moneyFormat';

/**
 * Input de importe: muestra miles + 2 decimales al perder foco; al editar, texto libre.
 * @param {string} valueCanonical del padre ("1234.56" o "")
 * @param {(next: string) => void} onCanonicalChange
 */
export function useMontoInput(valueCanonical, onCanonicalChange) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const canon =
    valueCanonical === null || valueCanonical === undefined || valueCanonical === ''
      ? ''
      : montoToCanonical(valueCanonical);

  const shown = focused ? draft : (canon !== '' ? formatMontoEsAR(canon) : '');

  const onFocus = useCallback(() => {
    setFocused(true);
    setDraft(canon !== '' ? formatMontoEsAR(canon) : '');
  }, [canon]);

  const onBlur = useCallback(() => {
    setFocused(false);
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCanonicalChange('');
    } else {
      const p = parseMontoInput(trimmed);
      if (p !== '') onCanonicalChange(p);
    }
    setDraft('');
  }, [draft, onCanonicalChange]);

  const onChange = useCallback((e) => {
    setDraft(e.target.value);
  }, []);

  return { value: shown, onFocus, onBlur, onChange };
}
