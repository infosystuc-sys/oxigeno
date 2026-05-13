import { useEffect, useRef, useCallback } from 'react';

/**
 * Escucha keydown en document y acumula caracteres en un buffer.
 * Al recibir Enter (o si pasan 50ms sin tecla) despacha el buffer como código
 * escaneado — siempre que tenga al menos 3 caracteres.
 *
 * Se ignoran los keypresses cuando el foco está en un <input>, <textarea>
 * o <select> convencional (para no interferir con otros campos del formulario).
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  enabled: boolean
): void {
  const bufferRef  = useRef<string[]>([]);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mantener siempre la versión más reciente del callback sin re-registrar el listener
  const onScanRef  = useRef(onScan);
  onScanRef.current = onScan;

  const flush = useCallback(() => {
    const code = bufferRef.current.join('');
    bufferRef.current = [];
    if (code.length >= 3) {
      onScanRef.current(code);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent): void {
      // No capturar si el foco está en un campo de texto estándar
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement  ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Enter') {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        flush();
        return;
      }

      // Solo caracteres imprimibles (longitud 1)
      if (e.key.length === 1) {
        bufferRef.current.push(e.key);

        // Reset del timer de inactividad
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          bufferRef.current = [];
          timerRef.current = null;
        }, 3000);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
      bufferRef.current = [];
    };
  }, [enabled, flush]);
}
