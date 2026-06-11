import { useState, useEffect, useRef, useCallback } from 'react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import {
  buscarClientes,
  guardarRemitoCliente,
  obtenerProximoRemito,
  validarSerie,
} from '../../api/clientes';
import { obtenerGases } from '../../api/recepcion';
import type {
  Cliente,
  Articulo,
  PostRemitoClientePayload,
  RemitoClienteResponse,
} from '@oxigeno/shared-types';
import { imprimirComprobante, type ComprobantePrintData } from '../../utils/imprimirComprobante';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function beep(): void {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* sin audio — ignorar */ }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ConfirmedGroup {
  articulo: Articulo;
  series:   string[];
}

interface CurrentSlot {
  articulo:     Articulo | null;
  series:       string[];
  gasSearch:    string;
  showDropdown: boolean;
  manualInput:  string;
}

// ─── Pantalla de éxito ────────────────────────────────────────────────────────

function SuccessScreen({
  resultado,
  totalSeries,
  onNuevo,
  onImprimir,
}: {
  resultado:   RemitoClienteResponse;
  totalSeries: number;
  onNuevo:     () => void;
  onImprimir:  () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Remito guardado</h2>
        <p className="text-gray-400 mb-4">Ingresado correctamente en Tango Gestión</p>

        <div className="bg-blue-50 rounded-xl py-5 px-6 mb-4">
          <p className="text-xs text-blue-500 uppercase tracking-widest font-semibold mb-1">
            Nro. Comprobante
          </p>
          <p className="text-4xl font-mono font-bold text-blue-700">
            {resultado.nro_comprobante}
          </p>
        </div>

        <p className="text-gray-500 mb-6">
          <span className="font-bold text-gray-700">{totalSeries}</span>{' '}
          {totalSeries === 1 ? 'cilindro ingresado' : 'cilindros ingresados'}
        </p>

        <button
          onClick={onImprimir}
          className="w-full py-3 mb-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300
                     text-gray-700 text-base font-semibold rounded-xl transition-colors
                     flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir comprobante
        </button>

        <button
          onClick={onNuevo}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                     text-white text-lg font-bold rounded-xl transition-colors"
        >
          Nuevo remito
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function RemitoClienteForm() {
  const [fecha,        setFecha]        = useState(todayISO);
  const [nroComprobante, setNroComprobante] = useState<string | null>(null);
  const [nroCompLoading, setNroCompLoading] = useState(true);
  const [cliente,      setCliente]      = useState<Cliente | null>(null);
  const [cliSearch,    setCliSearch]    = useState('');
  const [cliResults,   setCliResults]   = useState<Cliente[]>([]);
  const [cliLoading,   setCliLoading]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [gases,           setGases]           = useState<Articulo[]>([]);
  const [currentSlot,     setCurrentSlot]     = useState<CurrentSlot>({
    articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '',
  });
  const [confirmedGroups, setConfirmedGroups] = useState<ConfirmedGroup[]>([]);

  // Envases vacíos devueltos por el cliente (opcional)
  const [vacioSlot,   setVacioSlot]   = useState<CurrentSlot>({
    articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '',
  });
  const [vacioGroups, setVacioGroups] = useState<ConfirmedGroup[]>([]);
  const [scanTarget,  setScanTarget]  = useState<'cilindro' | 'vacio'>('cilindro');

  const allSeriesRef     = useRef<Set<string>>(new Set());
  const invalidSeriesRef = useRef<Set<string>>(new Set());
  const scanZoneRef      = useRef<HTMLDivElement>(null);
  const vacioScanZoneRef = useRef<HTMLDivElement>(null);
  const fechaRef         = useRef<HTMLInputElement>(null);
  const cliSearchRef     = useRef<HTMLInputElement>(null);
  const gasSearchRef     = useRef<HTMLInputElement>(null);

  const [saving,           setSaving]           = useState(false);
  const [validating,       setValidating]       = useState(false);
  const [hasInvalidSeries, setHasInvalidSeries] = useState(false);
  const [resultado,        setResultado]        = useState<RemitoClienteResponse | null>(null);
  const [apiError,         setApiError]         = useState<string | null>(null);
  const [printData,        setPrintData]        = useState<ComprobantePrintData | null>(null);
  const validatingRef = useRef(false);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    obtenerGases().then(setGases).catch(console.error);
  }, []);

  useEffect(() => {
    setNroCompLoading(true);
    obtenerProximoRemito()
      .then(nro => setNroComprobante(nro))
      .catch(() => setNroComprobante(null))
      .finally(() => setNroCompLoading(false));
  }, []);

  // ── Búsqueda de cliente (debounce 300ms) ──────────────────────────────────
  useEffect(() => {
    if (cliSearch.length < 2) {
      setCliResults([]);
      setShowDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      setCliLoading(true);
      try {
        const res = await buscarClientes(cliSearch);
        setCliResults(res);
        setShowDropdown(res.length > 0);
      } catch {
        setCliResults([]);
      } finally {
        setCliLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [cliSearch]);

  // ── Confirmar slot actual ─────────────────────────────────────────────────
  function confirmCurrentSlot() {
    if (!currentSlot.articulo || currentSlot.series.length === 0) return;
    const art    = currentSlot.articulo;
    const series = currentSlot.series;
    setConfirmedGroups(prev => {
      const idx = prev.findIndex(g => g.articulo.cod_articu === art.cod_articu);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], series: [...updated[idx].series, ...series] };
        return updated;
      }
      return [...prev, { articulo: art, series }];
    });
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });

    // Pre-sugerir el mismo artículo en la card de envases vacíos si está libre
    setVacioSlot(prev =>
      prev.articulo === null && prev.series.length === 0
        ? { ...prev, articulo: art }
        : prev
    );
  }

  function selectGas(gas: Articulo) {
    confirmCurrentSlot();
    setCurrentSlot({ articulo: gas, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setScanTarget('cilindro');
    setTimeout(() => scanZoneRef.current?.focus(), 50);
  }

  function clearCurrentSlot() {
    const cod = currentSlot.articulo?.cod_articu ?? '';
    currentSlot.series.forEach(s => {
      allSeriesRef.current.delete(cod + ':' + s);
      invalidSeriesRef.current.delete(cod + ':' + s);
    });
    setHasInvalidSeries(invalidSeriesRef.current.size > 0);
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
  }

  // ── Envases vacíos: confirmar / seleccionar / limpiar slot ────────────────
  function confirmVacioSlot() {
    if (!vacioSlot.articulo || vacioSlot.series.length === 0) return;
    const art    = vacioSlot.articulo;
    const series = vacioSlot.series;
    setVacioGroups(prev => {
      const idx = prev.findIndex(g => g.articulo.cod_articu === art.cod_articu);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], series: [...updated[idx].series, ...series] };
        return updated;
      }
      return [...prev, { articulo: art, series }];
    });
    setVacioSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
  }

  function selectVacioGas(gas: Articulo) {
    confirmVacioSlot();
    setVacioSlot({ articulo: gas, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setScanTarget('vacio');
    setTimeout(() => vacioScanZoneRef.current?.focus(), 50);
  }

  function clearVacioSlot() {
    const cod = vacioSlot.articulo?.cod_articu ?? '';
    vacioSlot.series.forEach(s => allSeriesRef.current.delete(cod + ':' + s));
    setVacioSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
  }

  // Envases vacíos: sin validación contra sta06 (devolución del cliente)
  const addVacioSerie = useCallback((code: string, codArticu: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    const key = codArticu + ':' + trimmed;
    if (allSeriesRef.current.has(key)) {
      beep(); setTimeout(beep, 150);
      alert(`⚠️  La serie "${trimmed}" ya fue ingresada para este artículo en este remito.`);
      return;
    }
    beep();
    allSeriesRef.current.add(key);
    setVacioSlot(prev => ({ ...prev, series: [...prev.series, trimmed] }));
  }, []);

  function removeVacioCurrentSerie(serie: string) {
    const key = (vacioSlot.articulo?.cod_articu ?? '') + ':' + serie;
    allSeriesRef.current.delete(key);
    setVacioSlot(prev => ({ ...prev, series: prev.series.filter(s => s !== serie) }));
  }

  function removeVacioConfirmedSerie(codArticu: string, serie: string) {
    allSeriesRef.current.delete(codArticu + ':' + serie);
    setVacioGroups(prev =>
      prev
        .map(g => g.articulo.cod_articu === codArticu
          ? { ...g, series: g.series.filter(s => s !== serie) }
          : g
        )
        .filter(g => g.series.length > 0)
    );
  }

  function removeVacioConfirmedGroup(codArticu: string) {
    const group = vacioGroups.find(g => g.articulo.cod_articu === codArticu);
    if (group) group.series.forEach(s => allSeriesRef.current.delete(codArticu + ':' + s));
    setVacioGroups(prev => prev.filter(g => g.articulo.cod_articu !== codArticu));
  }

  const addSerie = useCallback(async (code: string, codArticu: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    if (validatingRef.current) return;       // evitar concurrencia

    const key = codArticu + ':' + trimmed;
    if (allSeriesRef.current.has(key)) {
      beep(); setTimeout(beep, 150);
      alert(`⚠️  La serie "${trimmed}" ya fue ingresada para este artículo en este remito.`);
      return;
    }

    // ── Validar en sta06 ──────────────────────────────────────────────────
    validatingRef.current = true;
    setValidating(true);
    let serieInvalida = false;
    try {
      const v = await validarSerie(codArticu, trimmed);
      if (!v.existe) {
        serieInvalida = true;
        // No bloqueamos: se agrega en rojo
      } else if (v.cod_deposi !== '30') {
        alert(`⚠️  La serie "${trimmed}" está en el depósito ${v.cod_deposi}, no en el depósito 30. Se agrega de todos modos.`);
      }
    } catch {
      alert(`Error al validar la serie "${trimmed}". Intente nuevamente.`);
      return;
    } finally {
      validatingRef.current = false;
      setValidating(false);
    }

    if (serieInvalida) {
      invalidSeriesRef.current.add(key);
      setHasInvalidSeries(true);
    }

    beep();
    allSeriesRef.current.add(key);
    setCurrentSlot(prev => ({ ...prev, series: [...prev.series, trimmed] }));
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      if (scanTarget === 'vacio' && vacioSlot.articulo) {
        addVacioSerie(code, vacioSlot.articulo.cod_articu); return;
      }
      if (scanTarget === 'cilindro' && currentSlot.articulo) {
        addSerie(code, currentSlot.articulo.cod_articu); return;
      }
      if (currentSlot.articulo) addSerie(code, currentSlot.articulo.cod_articu);
      else if (vacioSlot.articulo) addVacioSerie(code, vacioSlot.articulo.cod_articu);
    },
    [scanTarget, currentSlot.articulo, vacioSlot.articulo, addSerie, addVacioSerie]
  );

  useBarcodeScanner(
    handleScan,
    (!!currentSlot.articulo || !!vacioSlot.articulo) && !saving && resultado === null,
  );

  const totalConfirmed = confirmedGroups.reduce((n, g) => n + g.series.length, 0);
  const totalSeries    = totalConfirmed + currentSlot.series.length;

  // Cantidades por artículo (incluyendo slot en curso) para validar balance
  const llenosByArt = new Map<string, number>();
  for (const g of confirmedGroups) {
    llenosByArt.set(g.articulo.cod_articu, (llenosByArt.get(g.articulo.cod_articu) ?? 0) + g.series.length);
  }
  if (currentSlot.articulo && currentSlot.series.length > 0) {
    const k = currentSlot.articulo.cod_articu;
    llenosByArt.set(k, (llenosByArt.get(k) ?? 0) + currentSlot.series.length);
  }
  const vaciosByArt = new Map<string, number>();
  for (const g of vacioGroups) {
    vaciosByArt.set(g.articulo.cod_articu, (vaciosByArt.get(g.articulo.cod_articu) ?? 0) + g.series.length);
  }
  if (vacioSlot.articulo && vacioSlot.series.length > 0) {
    const k = vacioSlot.articulo.cod_articu;
    vaciosByArt.set(k, (vaciosByArt.get(k) ?? 0) + vacioSlot.series.length);
  }
  const desbalance: { cod_articu: string; descrip: string; llenos: number; vacios: number }[] = [];
  const codArticus = new Set<string>([...llenosByArt.keys(), ...vaciosByArt.keys()]);
  for (const c of codArticus) {
    const l = llenosByArt.get(c) ?? 0;
    const v = vaciosByArt.get(c) ?? 0;
    if (l !== v) {
      const fromLlenos = confirmedGroups.find(g => g.articulo.cod_articu === c)?.articulo
                       ?? (currentSlot.articulo?.cod_articu === c ? currentSlot.articulo : null);
      const fromVacios = vacioGroups.find(g => g.articulo.cod_articu === c)?.articulo
                       ?? (vacioSlot.articulo?.cod_articu === c ? vacioSlot.articulo : null);
      const descrip = fromLlenos?.descrip ?? fromVacios?.descrip ?? c;
      desbalance.push({ cod_articu: c, descrip, llenos: l, vacios: v });
    }
  }
  const balanceado = desbalance.length === 0 && totalSeries > 0;
  const canSave    = !!cliente && totalSeries > 0 && balanceado && !saving && !nroCompLoading;

  function removeCurrentSerie(serie: string) {
    const key = (currentSlot.articulo?.cod_articu ?? '') + ':' + serie;
    allSeriesRef.current.delete(key);
    invalidSeriesRef.current.delete(key);
    setHasInvalidSeries(invalidSeriesRef.current.size > 0);
    setCurrentSlot(prev => ({ ...prev, series: prev.series.filter(s => s !== serie) }));
  }

  function removeConfirmedSerie(codArticu: string, serie: string) {
    const key = codArticu + ':' + serie;
    allSeriesRef.current.delete(key);
    invalidSeriesRef.current.delete(key);
    setHasInvalidSeries(invalidSeriesRef.current.size > 0);
    setConfirmedGroups(prev =>
      prev
        .map(g => g.articulo.cod_articu === codArticu
          ? { ...g, series: g.series.filter(s => s !== serie) }
          : g
        )
        .filter(g => g.series.length > 0)
    );
  }

  function removeConfirmedGroup(codArticu: string) {
    const group = confirmedGroups.find(g => g.articulo.cod_articu === codArticu);
    if (group) {
      group.series.forEach(s => {
        allSeriesRef.current.delete(codArticu + ':' + s);
        invalidSeriesRef.current.delete(codArticu + ':' + s);
      });
      setHasInvalidSeries(invalidSeriesRef.current.size > 0);
    }
    setConfirmedGroups(prev => prev.filter(g => g.articulo.cod_articu !== codArticu));
  }

  async function handleGuardar() {
    if (!canSave || !cliente) return;

    if (hasInvalidSeries) {
      const ok = window.confirm(
        '⚠️ Hay series que no están registradas en stock (marcadas en rojo).\n\n¿Desea continuar y guardar el remito de todos modos?'
      );
      if (!ok) return;
    }

    setSaving(true);
    setApiError(null);

    const allGroups: ConfirmedGroup[] = confirmedGroups.map(g => ({ ...g }));
    if (currentSlot.articulo && currentSlot.series.length > 0) {
      const art = currentSlot.articulo;
      const idx = allGroups.findIndex(g => g.articulo.cod_articu === art.cod_articu);
      if (idx >= 0) {
        allGroups[idx] = { ...allGroups[idx], series: [...allGroups[idx].series, ...currentSlot.series] };
      } else {
        allGroups.push({ articulo: art, series: currentSlot.series });
      }
    }

    // Merge vacíos confirmados + slot vacío actual
    const allVacios: ConfirmedGroup[] = vacioGroups.map(g => ({ ...g }));
    if (vacioSlot.articulo && vacioSlot.series.length > 0) {
      const art = vacioSlot.articulo;
      const idx = allVacios.findIndex(g => g.articulo.cod_articu === art.cod_articu);
      if (idx >= 0) {
        allVacios[idx] = { ...allVacios[idx], series: [...allVacios[idx].series, ...vacioSlot.series] };
      } else {
        allVacios.push({ articulo: art, series: vacioSlot.series });
      }
    }

    const payload: PostRemitoClientePayload = {
      cod_client:     cliente.cod_client,
      fecha,
      items:          allGroups.map(g => ({ cod_articu: g.articulo.cod_articu, series: g.series })),
      envases_vacios: allVacios.length > 0
        ? allVacios.map(g => ({ cod_articu: g.articulo.cod_articu, series: g.series }))
        : undefined,
    };

    try {
      const res = await guardarRemitoCliente(payload);
      const pd: ComprobantePrintData = {
        tipo:            'remito-cliente',
        nro_comprobante: res.nro_comprobante,
        fecha,
        entidad_cod:     cliente.cod_client,
        entidad_nombre:  cliente.RAZON_SOCI,
        items:           allGroups.map(g => ({
          cod_articu: g.articulo.cod_articu,
          descrip:    g.articulo.descrip,
          series:     g.series,
        })),
      };
      setPrintData(pd);
      imprimirComprobante(pd);
      setResultado(res);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Error desconocido');
      setApiError(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleNuevo() {
    setFecha(todayISO());
    setCliente(null);
    setCliSearch('');
    setCliResults([]);
    setShowDropdown(false);
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setConfirmedGroups([]);
    setVacioSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setVacioGroups([]);
    setScanTarget('cilindro');
    allSeriesRef.current = new Set();
    invalidSeriesRef.current = new Set();
    setHasInvalidSeries(false);
    setResultado(null);
    setApiError(null);
    setPrintData(null);
    // Recargar el próximo comprobante
    setNroCompLoading(true);
    obtenerProximoRemito()
      .then(nro => setNroComprobante(nro))
      .catch(() => setNroComprobante(null))
      .finally(() => setNroCompLoading(false));
  }

  if (resultado?.success) {
    return (
      <SuccessScreen
        resultado={resultado}
        totalSeries={totalSeries}
        onNuevo={handleNuevo}
        onImprimir={() => printData && imprimirComprobante(printData)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100">

      {/* Overlay de guardado */}
      {saving && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-5">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xl font-bold text-gray-700">Guardando en Tango…</p>
            <p className="text-sm text-gray-400">El trigger puede tardar hasta 90 segundos</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-5 gap-6 items-start">

          {/* ══ Columna izquierda: formulario ════════════════════════════════ */}
          <div className="col-span-3 space-y-5">

            {/* Error de API */}
            {apiError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3">
                <span className="text-2xl leading-none mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="font-semibold">Error al guardar</p>
                  <p className="text-sm mt-0.5">{apiError}</p>
                </div>
                <button onClick={() => setApiError(null)}
                  className="text-red-400 hover:text-red-600 text-xl leading-none mt-0.5">×</button>
              </div>
            )}

            {/* Banner: series inválidas */}
            {hasInvalidSeries && (
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-400 text-orange-800 rounded-xl px-4 py-3">
                <span className="text-2xl leading-none mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="font-semibold">Series no encontradas en stock</p>
                  <p className="text-sm mt-0.5">
                    Hay series marcadas en rojo que no están registradas en sta06. Revíselas antes de guardar.
                  </p>
                </div>
              </div>
            )}

            {/* ── Card: Datos del remito ──────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow p-6 space-y-5">
              <h2 className="text-lg font-bold text-gray-700 border-b border-gray-100 pb-3">
                Datos del Remito
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Nro. Comprobante (pre-cargado) */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Nro. Comprobante
                  </label>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 min-h-[48px]">
                    {nroCompLoading ? (
                      <span className="text-gray-400 text-sm animate-pulse">Cargando…</span>
                    ) : nroComprobante ? (
                      <span className="font-mono text-base font-bold text-blue-700 tracking-wide">
                        {nroComprobante}
                      </span>
                    ) : (
                      <span className="text-red-400 text-sm">Error al obtener número</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Asignado automáticamente al guardar</p>
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Fecha <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    ref={fechaRef}
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cliSearchRef.current?.focus(); } }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Cliente <span className="text-red-400">*</span>
                </label>

                {cliente ? (
                  <div className="flex items-center gap-3 border border-green-400 bg-green-50 rounded-xl px-4 py-3">
                    <span className="font-mono text-sm text-gray-400 shrink-0">{cliente.cod_client}</span>
                    <span className="flex-1 text-base font-semibold text-gray-800 leading-tight">
                      {cliente.RAZON_SOCI}
                    </span>
                    <button
                      onClick={() => { setCliente(null); setCliSearch(''); }}
                      className="text-gray-400 hover:text-red-500 text-2xl font-light leading-none"
                      title="Cambiar cliente"
                    >×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      ref={cliSearchRef}
                      value={cliSearch}
                      onChange={e => setCliSearch(e.target.value)}
                      onFocus={() => { if (cliResults.length > 0) setShowDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (cliResults.length > 0) {
                            setCliente(cliResults[0]);
                            setShowDropdown(false);
                            setCliSearch('');
                            setTimeout(() => gasSearchRef.current?.focus(), 50);
                          } else {
                            gasSearchRef.current?.focus();
                          }
                        }
                      }}
                      placeholder="Buscar por nombre… (mín. 2 caracteres)"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                                 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                    {cliLoading && (
                      <span className="absolute right-4 top-3.5 text-sm text-gray-400 animate-pulse">
                        Buscando…
                      </span>
                    )}
                    {showDropdown && cliResults.length > 0 && (
                      <ul className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                                     rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                        {cliResults.map(c => (
                          <li key={c.cod_client}>
                            <button
                              onMouseDown={() => {
                                setCliente(c);
                                setShowDropdown(false);
                                setCliSearch('');
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                            >
                              <span className="font-mono text-sm text-gray-400 w-20 shrink-0">{c.cod_client}</span>
                              <span className="text-sm text-gray-800">{c.RAZON_SOCI}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showDropdown && !cliLoading && cliSearch.length >= 2 && cliResults.length === 0 && (
                      <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                                      rounded-xl shadow p-4 text-center text-gray-400 text-sm">
                        Sin resultados para "{cliSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Card: Escaneo de cilindros ──────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow p-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-700 border-b border-gray-100 pb-3">
                Escaneo de Cilindros
              </h2>

              {/* Selector de gas */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Tipo de Gas
                </label>

                {currentSlot.articulo ? (
                  <div className="flex items-center gap-3 border border-green-400 bg-green-50 rounded-xl px-4 py-3">
                    <span className="font-mono text-sm text-gray-400 shrink-0">{currentSlot.articulo.cod_articu}</span>
                    <span className="flex-1 text-base font-semibold text-gray-800 leading-tight">
                      {currentSlot.articulo.descrip}
                    </span>
                    <button
                      onClick={clearCurrentSlot}
                      className="text-gray-400 hover:text-red-500 text-2xl font-light leading-none"
                      title="Cambiar gas"
                    >×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      ref={gasSearchRef}
                      value={currentSlot.gasSearch}
                      onChange={e => setCurrentSlot(prev => ({ ...prev, gasSearch: e.target.value, showDropdown: true }))}
                      onFocus={() => setCurrentSlot(prev => ({ ...prev, showDropdown: true }))}
                      onBlur={() => setTimeout(() => setCurrentSlot(prev => ({ ...prev, showDropdown: false })), 200)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const filtered = currentSlot.gasSearch
                            ? gases.filter(g =>
                                g.descrip.toLowerCase().includes(currentSlot.gasSearch.toLowerCase()) ||
                                g.cod_articu.toLowerCase().includes(currentSlot.gasSearch.toLowerCase())
                              )
                            : gases;
                          if (filtered.length > 0) selectGas(filtered[0]);
                        }
                      }}
                      placeholder="Buscar tipo de gas…"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                                 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                    {currentSlot.showDropdown && (() => {
                      const filtered = currentSlot.gasSearch
                        ? gases.filter(g =>
                            g.descrip.toLowerCase().includes(currentSlot.gasSearch.toLowerCase()) ||
                            g.cod_articu.toLowerCase().includes(currentSlot.gasSearch.toLowerCase())
                          )
                        : gases;
                      if (filtered.length === 0 && currentSlot.gasSearch.length > 0) {
                        return (
                          <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                                          rounded-xl shadow p-4 text-center text-gray-400 text-sm">
                            Sin resultados para "{currentSlot.gasSearch}"
                          </div>
                        );
                      }
                      if (filtered.length === 0) return null;
                      return (
                        <ul className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                                       rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                          {filtered.map(g => (
                            <li key={g.cod_articu}>
                              <button
                                onMouseDown={() => selectGas(g)}
                                className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="font-mono text-sm text-gray-400 w-28 shrink-0">{g.cod_articu}</span>
                                <span className="text-sm text-gray-800">{g.descrip}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Zona de escaneo + ingreso manual */}
              {currentSlot.articulo ? (
                <>
                  <div
                    ref={scanZoneRef}
                    tabIndex={0}
                    onClick={() => { if (!validating) { setScanTarget('cilindro'); scanZoneRef.current?.focus(); } }}
                    onFocus={() => setScanTarget('cilindro')}
                    className={[
                      'border-2 border-dashed rounded-xl p-4 text-center select-none outline-none transition-colors',
                      validating
                        ? 'border-yellow-300 bg-yellow-50 cursor-wait'
                        : scanTarget === 'cilindro'
                          ? 'border-blue-600 bg-blue-100 ring-4 ring-blue-200 cursor-pointer'
                          : 'border-blue-300 bg-blue-50 cursor-pointer hover:border-blue-500',
                    ].join(' ')}
                  >
                    <div className={`flex justify-center mb-1 ${validating ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {validating ? (
                        <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm2 0h2v16H7V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h1v16h-1V4zm2 0h2v16h-2V4z"/>
                        </svg>
                      )}
                    </div>
                    <p className={`font-bold ${validating ? 'text-yellow-600' : 'text-blue-700'}`}>
                      {validating ? 'Validando serie…' : 'Listo para escanear'}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">Apunte el lector al código de barras</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Ingreso manual
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentSlot.manualInput}
                        onChange={e => setCurrentSlot(prev => ({ ...prev, manualInput: e.target.value }))}
                        disabled={validating}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && currentSlot.articulo) {
                            e.preventDefault();
                            const val = currentSlot.manualInput;
                            setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                            await addSerie(val, currentSlot.articulo!.cod_articu);
                          }
                        }}
                        placeholder="Escribir serie y presionar Enter…"
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base font-mono
                                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                                   disabled:bg-gray-100 disabled:cursor-wait"
                      />
                      <button
                        onClick={async () => {
                          if (!currentSlot.articulo) return;
                          const val = currentSlot.manualInput;
                          setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                          await addSerie(val, currentSlot.articulo!.cod_articu);
                        }}
                        disabled={currentSlot.manualInput.trim().length < 3 || validating}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
                                   disabled:cursor-not-allowed text-white font-bold rounded-xl
                                   text-sm transition-colors"
                      >
                        {validating ? '…' : 'Agregar'}
                      </button>
                    </div>
                  </div>

                  {currentSlot.series.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Series ingresadas ({currentSlot.series.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {currentSlot.series.map(serie => {
                          const inv = invalidSeriesRef.current.has((currentSlot.articulo?.cod_articu ?? '') + ':' + serie);
                          return (
                            <div key={serie}
                              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                                inv ? 'bg-red-100 hover:bg-red-200' : 'bg-gray-100 hover:bg-gray-200'
                              }`}>
                              {inv && <span className="text-red-500 text-xs font-bold leading-none">!</span>}
                              <span className={`font-mono text-sm tracking-wide ${inv ? 'text-red-700' : 'text-gray-700'}`}>
                                {serie}
                              </span>
                              <button
                                onClick={() => removeCurrentSerie(serie)}
                                className={`text-lg leading-none transition-colors ${
                                  inv ? 'text-red-400 hover:text-red-600' : 'text-gray-400 hover:text-red-500'
                                }`}
                                title={`Eliminar ${serie}`}
                              >×</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={confirmCurrentSlot}
                    disabled={currentSlot.series.length === 0}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 active:bg-green-800
                               disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                               text-white font-bold rounded-xl transition-colors"
                  >
                    {currentSlot.series.length > 0
                      ? `Confirmar ${currentSlot.series.length} serie${currentSlot.series.length !== 1 ? 's' : ''} — ${currentSlot.articulo?.descrip}`
                      : 'Confirmar series'}
                  </button>
                </>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
                  <p className="text-gray-400">Seleccione un tipo de gas para activar el scanner</p>
                </div>
              )}
            </section>

            {/* ── Card: Envases vacíos devueltos por el cliente (opcional) ── */}
            <section className="bg-white rounded-2xl shadow p-6 space-y-4 border-l-4 border-amber-400">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h2 className="text-lg font-bold text-gray-700">
                  Envases vacíos devueltos <span className="text-xs text-gray-400 font-normal">(opcional · entra al depósito 33)</span>
                </h2>
                <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-1 rounded uppercase tracking-wide">
                  VE
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Tipo de Gas (envase vacío)
                </label>

                {vacioSlot.articulo ? (
                  <div className="flex items-center gap-3 border border-amber-400 bg-amber-50 rounded-xl px-4 py-3">
                    <span className="font-mono text-sm text-gray-400 shrink-0">{vacioSlot.articulo.cod_articu}</span>
                    <span className="flex-1 text-base font-semibold text-gray-800 leading-tight">
                      {vacioSlot.articulo.descrip}
                    </span>
                    <button
                      onClick={clearVacioSlot}
                      className="text-gray-400 hover:text-red-500 text-2xl font-light leading-none"
                      title="Cambiar gas"
                    >×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={vacioSlot.gasSearch}
                      onChange={e => setVacioSlot(prev => ({ ...prev, gasSearch: e.target.value, showDropdown: true }))}
                      onFocus={() => setVacioSlot(prev => ({ ...prev, showDropdown: true }))}
                      onBlur={() => setTimeout(() => setVacioSlot(prev => ({ ...prev, showDropdown: false })), 200)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const filtered = vacioSlot.gasSearch
                            ? gases.filter(g =>
                                g.descrip.toLowerCase().includes(vacioSlot.gasSearch.toLowerCase()) ||
                                g.cod_articu.toLowerCase().includes(vacioSlot.gasSearch.toLowerCase())
                              )
                            : gases;
                          if (filtered.length > 0) selectVacioGas(filtered[0]);
                        }
                      }}
                      placeholder="Buscar tipo de gas…"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                                 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                    {vacioSlot.showDropdown && (() => {
                      const filtered = vacioSlot.gasSearch
                        ? gases.filter(g =>
                            g.descrip.toLowerCase().includes(vacioSlot.gasSearch.toLowerCase()) ||
                            g.cod_articu.toLowerCase().includes(vacioSlot.gasSearch.toLowerCase())
                          )
                        : gases;
                      if (filtered.length === 0) return null;
                      return (
                        <ul className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                                       rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                          {filtered.map(g => (
                            <li key={g.cod_articu}>
                              <button
                                onMouseDown={() => selectVacioGas(g)}
                                className="w-full text-left px-4 py-3 hover:bg-amber-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="font-mono text-sm text-gray-400 w-28 shrink-0">{g.cod_articu}</span>
                                <span className="text-sm text-gray-800">{g.descrip}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                )}
              </div>

              {vacioSlot.articulo && (
                <>
                  <div
                    ref={vacioScanZoneRef}
                    tabIndex={0}
                    onClick={() => { setScanTarget('vacio'); vacioScanZoneRef.current?.focus(); }}
                    onFocus={() => setScanTarget('vacio')}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer
                                select-none outline-none transition-colors
                                ${scanTarget === 'vacio'
                                  ? 'border-amber-500 bg-amber-100 ring-4 ring-amber-200'
                                  : 'border-amber-300 bg-amber-50 hover:border-amber-500'}`}
                  >
                    <p className="text-amber-700 font-bold">
                      {scanTarget === 'vacio' ? 'Listo para escanear (envases vacíos)' : 'Click para activar scanner de envases'}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      {scanTarget === 'vacio' ? 'Apunte el lector al código de barras' : 'Actualmente el scanner apunta a cilindros'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Ingreso manual
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={vacioSlot.manualInput}
                        onChange={e => setVacioSlot(prev => ({ ...prev, manualInput: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && vacioSlot.articulo) {
                            e.preventDefault();
                            const val = vacioSlot.manualInput;
                            setVacioSlot(prev => ({ ...prev, manualInput: '' }));
                            addVacioSerie(val, vacioSlot.articulo!.cod_articu);
                          }
                        }}
                        placeholder="Escribir serie y presionar Enter…"
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base font-mono
                                   focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                      />
                      <button
                        onClick={() => {
                          if (!vacioSlot.articulo) return;
                          const val = vacioSlot.manualInput;
                          setVacioSlot(prev => ({ ...prev, manualInput: '' }));
                          addVacioSerie(val, vacioSlot.articulo!.cod_articu);
                        }}
                        disabled={vacioSlot.manualInput.trim().length < 3}
                        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300
                                   disabled:cursor-not-allowed text-white font-bold rounded-xl
                                   text-sm transition-colors"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>

                  {vacioSlot.series.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Series ingresadas ({vacioSlot.series.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {vacioSlot.series.map(serie => (
                          <div key={serie}
                            className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200
                                       rounded-lg px-3 py-1.5 transition-colors">
                            <span className="font-mono text-sm text-amber-800 tracking-wide">{serie}</span>
                            <button
                              onClick={() => removeVacioCurrentSerie(serie)}
                              className="text-amber-500 hover:text-red-500 text-lg leading-none transition-colors"
                              title={`Eliminar ${serie}`}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={confirmVacioSlot}
                    disabled={vacioSlot.series.length === 0}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800
                               disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                               text-white font-bold rounded-xl transition-colors"
                  >
                    {vacioSlot.series.length > 0
                      ? `Confirmar ${vacioSlot.series.length} envase${vacioSlot.series.length !== 1 ? 's' : ''} — ${vacioSlot.articulo?.descrip}`
                      : 'Confirmar envases'}
                  </button>
                </>
              )}
            </section>

            <div className="pb-8">
              <button
                onClick={handleNuevo}
                className="px-6 py-3 border-2 border-gray-300 text-gray-600 rounded-xl
                           hover:bg-gray-50 active:bg-gray-100 font-semibold text-base transition-colors"
              >
                Limpiar todo
              </button>
            </div>
          </div>

          {/* ══ Columna derecha: cilindros en tiempo real ═════════════════════ */}
          <div className="col-span-2">
            <div className="sticky top-6 space-y-4">

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                      Cilindros a remitir
                    </span>
                  </div>
                  {totalSeries > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                      {totalSeries} {totalSeries === 1 ? 'cilindro' : 'cilindros'}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">

                  {confirmedGroups.map(group => (
                    <div key={group.articulo.cod_articu}
                      className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-bold text-gray-700 leading-tight">
                          {group.articulo.descrip}
                        </span>
                        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                          {group.articulo.cod_articu}
                        </span>
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                          {group.series.length}
                        </span>
                        <button
                          onClick={() => removeConfirmedGroup(group.articulo.cod_articu)}
                          className="text-gray-300 hover:text-red-500 text-xl leading-none transition-colors shrink-0"
                          title="Eliminar grupo"
                        >×</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.series.map(s => {
                          const inv = invalidSeriesRef.current.has(group.articulo.cod_articu + ':' + s);
                          return (
                            <div key={s}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                                inv ? 'bg-red-100 hover:bg-red-200' : 'bg-gray-100 hover:bg-gray-200'
                              }`}>
                              {inv && <span className="text-red-500 text-[10px] font-bold leading-none">!</span>}
                              <span className={`font-mono text-xs ${inv ? 'text-red-700' : 'text-gray-600'}`}>{s}</span>
                              <button
                                onClick={() => removeConfirmedSerie(group.articulo.cod_articu, s)}
                                className="text-gray-400 hover:text-red-500 text-sm leading-none transition-colors"
                                title={`Eliminar ${s}`}
                              >×</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {currentSlot.articulo && currentSlot.series.length > 0 && (
                    <div className="border border-blue-300 bg-blue-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-bold text-blue-800 leading-tight">
                          {currentSlot.articulo.descrip}
                        </span>
                        <span className="font-mono text-xs text-blue-400 bg-blue-100 px-2 py-0.5 rounded shrink-0">
                          {currentSlot.articulo.cod_articu}
                        </span>
                        <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                          {currentSlot.series.length}
                        </span>
                        <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                          EN CURSO
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentSlot.series.map(s => {
                          const inv = invalidSeriesRef.current.has((currentSlot.articulo?.cod_articu ?? '') + ':' + s);
                          return (
                            <div key={s}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                                inv ? 'bg-red-100 hover:bg-red-200' : 'bg-blue-100 hover:bg-blue-200'
                              }`}>
                              {inv && <span className="text-red-500 text-[10px] font-bold leading-none">!</span>}
                              <span className={`font-mono text-xs ${inv ? 'text-red-700' : 'text-blue-700'}`}>{s}</span>
                              <button
                                onClick={() => removeCurrentSerie(s)}
                                className="text-blue-400 hover:text-red-500 text-sm leading-none transition-colors"
                                title={`Eliminar ${s}`}
                              >×</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {totalSeries === 0 && (
                    <p className="text-center text-gray-300 text-xs italic py-8">
                      Los cilindros escaneados aparecerán aquí
                    </p>
                  )}
                </div>
              </div>

              {/* Panel de envases vacíos devueltos */}
              {(vacioGroups.length > 0 || (vacioSlot.articulo && vacioSlot.series.length > 0)) && (
                <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M20 13V7a2 2 0 00-2-2h-3l-2-2H9L7 5H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2z" />
                      </svg>
                      <span className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                        Envases vacíos devueltos
                      </span>
                    </div>
                    {(() => {
                      const totV = vacioGroups.reduce((n, g) => n + g.series.length, 0) + vacioSlot.series.length;
                      return totV > 0 ? (
                        <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">
                          {totV} {totV === 1 ? 'envase' : 'envases'}
                        </span>
                      ) : null;
                    })()}
                  </div>

                  <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto">
                    {vacioGroups.map(group => (
                      <div key={group.articulo.cod_articu}
                        className="border border-amber-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-bold text-gray-700 leading-tight">
                            {group.articulo.descrip}
                          </span>
                          <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                            {group.articulo.cod_articu}
                          </span>
                          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                            {group.series.length}
                          </span>
                          <button
                            onClick={() => removeVacioConfirmedGroup(group.articulo.cod_articu)}
                            className="text-gray-300 hover:text-red-500 text-xl leading-none transition-colors shrink-0"
                            title="Eliminar grupo"
                          >×</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.series.map(s => (
                            <div key={s}
                              className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100
                                         rounded-lg px-2.5 py-1 transition-colors">
                              <span className="font-mono text-xs text-amber-800">{s}</span>
                              <button
                                onClick={() => removeVacioConfirmedSerie(group.articulo.cod_articu, s)}
                                className="text-amber-400 hover:text-red-500 text-sm leading-none transition-colors"
                                title={`Eliminar ${s}`}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {vacioSlot.articulo && vacioSlot.series.length > 0 && (
                      <div className="border border-amber-300 bg-amber-50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-sm font-bold text-amber-800 leading-tight">
                            {vacioSlot.articulo.descrip}
                          </span>
                          <span className="font-mono text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded shrink-0">
                            {vacioSlot.articulo.cod_articu}
                          </span>
                          <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                            {vacioSlot.series.length}
                          </span>
                          <span className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                            EN CURSO
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {vacioSlot.series.map(s => (
                            <div key={s}
                              className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200
                                         rounded-lg px-2.5 py-1 transition-colors">
                              <span className="font-mono text-xs text-amber-700">{s}</span>
                              <button
                                onClick={() => removeVacioCurrentSerie(s)}
                                className="text-amber-400 hover:text-red-500 text-sm leading-none transition-colors"
                                title={`Eliminar ${s}`}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Aviso de desbalance llenos / vacíos */}
              {desbalance.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-sm font-semibold text-red-700">
                    Los envases vacíos no coinciden con los cilindros llenos
                  </p>
                  <ul className="text-xs text-red-700 space-y-0.5">
                    {desbalance.map(d => (
                      <li key={d.cod_articu} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-red-100 px-1.5 py-0.5 rounded">{d.cod_articu}</span>
                        <span className="flex-1 truncate">{d.descrip}</span>
                        <span className="font-semibold">{d.llenos} llenos / {d.vacios} vacíos</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={handleGuardar}
                disabled={!canSave}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                           disabled:bg-gray-300 disabled:cursor-not-allowed
                           text-white font-bold text-lg rounded-xl transition-colors shadow-sm"
              >
                {saving
                  ? 'Guardando…'
                  : !balanceado && totalSeries > 0
                    ? 'Faltan envases vacíos para guardar'
                    : totalSeries > 0
                      ? `Guardar remito (${totalSeries} cilindro${totalSeries !== 1 ? 's' : ''})`
                      : 'Guardar remito'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
