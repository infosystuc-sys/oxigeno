import { useState, useEffect, useRef, useCallback } from 'react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import {
  buscarDepositos,
  obtenerProximoMovimiento,
  guardarMovimientoDeposito,
} from '../../api/depositos';
import { obtenerGases } from '../../api/recepcion';
import { validarSerie } from '../../api/clientes';
import type {
  Deposito,
  Articulo,
  PostMovimientoDepositoPayload,
  MovimientoDepositoResponse,
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
  } catch { /* sin audio */ }
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
  resultado:   MovimientoDepositoResponse;
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
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Movimiento guardado</h2>
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
          {totalSeries === 1 ? 'cilindro movido' : 'cilindros movidos'}
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
          Nuevo movimiento
        </button>
      </div>
    </div>
  );
}

// ─── Selector de depósito ─────────────────────────────────────────────────────

function DepositoSelector({
  label,
  value,
  onSelect,
  onClear,
  inputRef,
  onEnter,
  excludeCod,
}: {
  label:      string;
  value:      Deposito | null;
  onSelect:   (d: Deposito) => void;
  onClear:    () => void;
  inputRef?:  React.RefObject<HTMLInputElement>;
  onEnter?:   () => void;
  excludeCod?: string;
}) {
  const [search,      setSearch]      = useState('');
  const [results,     setResults]     = useState<Deposito[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (search.length < 1) { setResults([]); setShowDropdown(false); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await buscarDepositos(search);
        const filtered = excludeCod ? res.filter(d => d.cod_sucurs !== excludeCod) : res;
        setResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, excludeCod]);

  if (value) {
    return (
      <div className="flex items-center gap-3 border border-green-400 bg-green-50 rounded-xl px-4 py-3">
        <span className="font-mono text-sm text-gray-400 shrink-0">{value.cod_sucurs}</span>
        <span className="flex-1 text-base font-semibold text-gray-800 leading-tight">{value.nombre_suc}</span>
        <button
          onClick={() => { onClear(); setSearch(''); }}
          className="text-gray-400 hover:text-red-500 text-2xl font-light leading-none"
          title="Cambiar depósito"
        >×</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        ref={inputRef}
        value={search}
        onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (results.length > 0) {
              onSelect(results[0]);
              setSearch('');
              setShowDropdown(false);
              onEnter?.();
            } else {
              onEnter?.();
            }
          }
        }}
        placeholder={`Buscar ${label.toLowerCase()} por código o nombre…`}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
      />
      {loading && (
        <span className="absolute right-4 top-3.5 text-sm text-gray-400 animate-pulse">Buscando…</span>
      )}
      {showDropdown && results.length > 0 && (
        <ul className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                       rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-gray-100">
          {results.map(d => (
            <li key={d.cod_sucurs}>
              <button
                onMouseDown={() => { onSelect(d); setSearch(''); setShowDropdown(false); }}
                className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors"
              >
                <span className="font-mono text-sm text-gray-400 w-12 shrink-0">{d.cod_sucurs}</span>
                <span className="text-sm text-gray-800">{d.nombre_suc}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showDropdown && !loading && search.length >= 1 && results.length === 0 && (
        <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200
                        rounded-xl shadow p-4 text-center text-gray-400 text-sm">
          Sin resultados para "{search}"
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MovimientoDepositosForm() {
  const [fecha,           setFecha]           = useState(todayISO);
  const [nroComprobante,  setNroComprobante]  = useState<string | null>(null);
  const [nroCompLoading,  setNroCompLoading]  = useState(true);
  const [depositoOrigen,  setDepositoOrigen]  = useState<Deposito | null>(null);
  const [depositoDestino, setDepositoDestino] = useState<Deposito | null>(null);

  const [gases,           setGases]           = useState<Articulo[]>([]);
  const [currentSlot,     setCurrentSlot]     = useState<CurrentSlot>({
    articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '',
  });
  const [confirmedGroups, setConfirmedGroups] = useState<ConfirmedGroup[]>([]);
  const allSeriesRef     = useRef<Set<string>>(new Set());
  const invalidSeriesRef = useRef<Set<string>>(new Set());
  const validatingRef    = useRef(false);
  const scanZoneRef      = useRef<HTMLDivElement>(null);

  const [saving,           setSaving]           = useState(false);
  const [validating,       setValidating]       = useState(false);
  const [hasInvalidSeries, setHasInvalidSeries] = useState(false);
  const [resultado,        setResultado]        = useState<MovimientoDepositoResponse | null>(null);
  const [apiError,         setApiError]         = useState<string | null>(null);
  const [printData,        setPrintData]        = useState<ComprobantePrintData | null>(null);

  // Refs para navegación con teclado
  const fechaRef    = useRef<HTMLInputElement>(null);
  const origenRef   = useRef<HTMLInputElement>(null);
  const destinoRef  = useRef<HTMLInputElement>(null);
  const gasSearchRef = useRef<HTMLInputElement>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    obtenerGases().then(setGases).catch(console.error);
  }, []);

  useEffect(() => {
    setNroCompLoading(true);
    obtenerProximoMovimiento()
      .then(nro => setNroComprobante(nro))
      .catch(() => setNroComprobante(null))
      .finally(() => setNroCompLoading(false));
  }, []);

  // ── Slot de artículo ─────────────────────────────────────────────────────
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
  }

  function selectGas(gas: Articulo) {
    confirmCurrentSlot();
    setCurrentSlot({ articulo: gas, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
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

  const addSerie = useCallback(async (code: string, codArticu: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    if (validatingRef.current) return;

    const key = codArticu + ':' + trimmed;
    if (allSeriesRef.current.has(key)) {
      beep(); setTimeout(beep, 150);
      alert(`⚠️  La serie "${trimmed}" ya fue ingresada para este artículo en este movimiento.`);
      return;
    }

    validatingRef.current = true;
    setValidating(true);
    let serieInvalida = false;
    try {
      const v = await validarSerie(codArticu, trimmed);
      if (!v.existe) {
        serieInvalida = true;
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
    (code: string) => { if (currentSlot.articulo) addSerie(code, currentSlot.articulo.cod_articu); },
    [currentSlot.articulo, addSerie]
  );

  useBarcodeScanner(handleScan, !!currentSlot.articulo && !saving && resultado === null);

  const totalConfirmed = confirmedGroups.reduce((n, g) => n + g.series.length, 0);
  const totalSeries    = totalConfirmed + currentSlot.series.length;
  const canSave        = !!depositoOrigen && !!depositoDestino && totalSeries > 0 && !saving && !nroCompLoading;

  function removeCurrentSerie(serie: string) {
    const cod = currentSlot.articulo?.cod_articu ?? '';
    const key = cod + ':' + serie;
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
        const key = codArticu + ':' + s;
        allSeriesRef.current.delete(key);
        invalidSeriesRef.current.delete(key);
      });
      setHasInvalidSeries(invalidSeriesRef.current.size > 0);
    }
    setConfirmedGroups(prev => prev.filter(g => g.articulo.cod_articu !== codArticu));
  }

  async function handleGuardar() {
    if (!canSave || !depositoOrigen || !depositoDestino) return;
    if (hasInvalidSeries) {
      const ok = window.confirm(
        '⚠️  Hay series que no existen en el sistema.\n\n' +
        '¿Desea guardar el movimiento de todas formas?'
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

    const payload: PostMovimientoDepositoPayload = {
      cod_origen:  depositoOrigen.cod_sucurs,
      cod_destino: depositoDestino.cod_sucurs,
      fecha,
      items: allGroups.map(g => ({ cod_articu: g.articulo.cod_articu, series: g.series })),
    };

    try {
      const res = await guardarMovimientoDeposito(payload);
      const pd: ComprobantePrintData = {
        tipo:            'remito-cliente',   // reutiliza el layout "salida"
        nro_comprobante: res.nro_comprobante,
        fecha,
        entidad_cod:     `${depositoOrigen.cod_sucurs} → ${depositoDestino.cod_sucurs}`,
        entidad_nombre:  `${depositoOrigen.nombre_suc} → ${depositoDestino.nombre_suc}`,
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
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : 'Error desconocido');
      setApiError(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleNuevo() {
    setFecha(todayISO());
    setDepositoOrigen(null);
    setDepositoDestino(null);
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setConfirmedGroups([]);
    allSeriesRef.current     = new Set();
    invalidSeriesRef.current = new Set();
    setHasInvalidSeries(false);
    setResultado(null);
    setApiError(null);
    setPrintData(null);
    setNroCompLoading(true);
    obtenerProximoMovimiento()
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

          {/* ══ Columna izquierda ════════════════════════════════════════════ */}
          <div className="col-span-3 space-y-5">

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

            {hasInvalidSeries && (
              <div className="flex items-start gap-3 bg-orange-50 border border-orange-300 text-orange-700 rounded-xl px-4 py-3">
                <span className="text-2xl leading-none mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="font-semibold">Hay series que no existen en el sistema</p>
                  <p className="text-sm mt-0.5">
                    Las series marcadas en rojo no se encontraron en sta06. Puede guardar de todas formas o eliminarlas.
                  </p>
                </div>
              </div>
            )}

            {/* ── Card: Datos del movimiento ──────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow p-6 space-y-5">
              <h2 className="text-lg font-bold text-gray-700 border-b border-gray-100 pb-3">
                Datos del Movimiento
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Nro. Comprobante */}
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
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); origenRef.current?.focus(); } }}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Depósito Origen */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Depósito Origen <span className="text-red-400">*</span>
                </label>
                <DepositoSelector
                  label="Depósito Origen"
                  value={depositoOrigen}
                  onSelect={setDepositoOrigen}
                  onClear={() => setDepositoOrigen(null)}
                  inputRef={origenRef}
                  onEnter={() => destinoRef.current?.focus()}
                  excludeCod={depositoDestino?.cod_sucurs}
                />
              </div>

              {/* Depósito Destino */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Depósito Destino <span className="text-red-400">*</span>
                </label>
                <DepositoSelector
                  label="Depósito Destino"
                  value={depositoDestino}
                  onSelect={setDepositoDestino}
                  onClear={() => setDepositoDestino(null)}
                  inputRef={destinoRef}
                  onEnter={() => gasSearchRef.current?.focus()}
                  excludeCod={depositoOrigen?.cod_sucurs}
                />
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
                    onClick={() => scanZoneRef.current?.focus()}
                    className="border-2 border-dashed border-blue-400 rounded-xl p-4 text-center
                               cursor-pointer select-none outline-none transition-colors bg-blue-50
                               hover:border-blue-500 focus:border-blue-600 focus:bg-blue-100
                               focus:ring-4 focus:ring-blue-200"
                  >
                    {validating ? (
                      <>
                        <div className="flex justify-center mb-2">
                          <div className="w-7 h-7 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                        <p className="text-blue-700 font-bold">Validando serie…</p>
                        <p className="text-gray-400 text-xs mt-1">Consultando base de datos</p>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-center mb-1 text-blue-400">
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm2 0h2v16H7V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h1v16h-1V4zm2 0h2v16h-2V4z"/>
                          </svg>
                        </div>
                        <p className="text-blue-700 font-bold">Listo para escanear</p>
                        <p className="text-gray-400 text-xs mt-1">Apunte el lector al código de barras</p>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Ingreso manual
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentSlot.manualInput}
                        disabled={validating}
                        onChange={e => setCurrentSlot(prev => ({ ...prev, manualInput: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && currentSlot.articulo) {
                            e.preventDefault();
                            addSerie(currentSlot.manualInput, currentSlot.articulo.cod_articu);
                            setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                          }
                        }}
                        placeholder="Escribir serie y presionar Enter…"
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base font-mono
                                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                                   disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                      <button
                        onClick={() => {
                          if (!currentSlot.articulo) return;
                          addSerie(currentSlot.manualInput, currentSlot.articulo.cod_articu);
                          setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                        }}
                        disabled={currentSlot.manualInput.trim().length < 3 || validating}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
                                   disabled:cursor-not-allowed text-white font-bold rounded-xl
                                   text-sm transition-colors"
                      >
                        Agregar
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
                          const isInvalid = invalidSeriesRef.current.has(
                            (currentSlot.articulo?.cod_articu ?? '') + ':' + serie
                          );
                          return (
                            <div key={serie}
                              className={[
                                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors',
                                isInvalid
                                  ? 'bg-red-100 hover:bg-red-200'
                                  : 'bg-gray-100 hover:bg-gray-200',
                              ].join(' ')}>
                              {isInvalid && (
                                <span className="text-red-500 font-bold text-xs leading-none">!</span>
                              )}
                              <span className={[
                                'font-mono text-sm tracking-wide',
                                isInvalid ? 'text-red-700' : 'text-gray-700',
                              ].join(' ')}>{serie}</span>
                              <button
                                onClick={() => removeCurrentSerie(serie)}
                                className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors"
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

          {/* ══ Columna derecha: cilindros en tiempo real ════════════════════ */}
          <div className="col-span-2">
            <div className="sticky top-6 space-y-4">

              {/* Resumen de depósitos */}
              {(depositoOrigen || depositoDestino) && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                    Ruta del movimiento
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center">
                      {depositoOrigen ? (
                        <>
                          <p className="font-mono text-xs text-gray-400">{depositoOrigen.cod_sucurs}</p>
                          <p className="text-sm font-bold text-gray-700 leading-tight">{depositoOrigen.nombre_suc}</p>
                        </>
                      ) : (
                        <p className="text-gray-300 text-sm italic">Sin origen</p>
                      )}
                    </div>
                    <div className="text-2xl text-blue-400">→</div>
                    <div className="flex-1 text-center">
                      {depositoDestino ? (
                        <>
                          <p className="font-mono text-xs text-gray-400">{depositoDestino.cod_sucurs}</p>
                          <p className="text-sm font-bold text-gray-700 leading-tight">{depositoDestino.nombre_suc}</p>
                        </>
                      ) : (
                        <p className="text-gray-300 text-sm italic">Sin destino</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                      Cilindros a mover
                    </span>
                  </div>
                  {totalSeries > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                      {totalSeries} {totalSeries === 1 ? 'cilindro' : 'cilindros'}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
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
                          const isInvalid = invalidSeriesRef.current.has(group.articulo.cod_articu + ':' + s);
                          return (
                            <div key={s}
                              className={[
                                'flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors',
                                isInvalid
                                  ? 'bg-red-100 hover:bg-red-200'
                                  : 'bg-gray-100 hover:bg-gray-200',
                              ].join(' ')}>
                              {isInvalid && (
                                <span className="text-red-500 font-bold text-xs leading-none">!</span>
                              )}
                              <span className={[
                                'font-mono text-xs',
                                isInvalid ? 'text-red-700' : 'text-gray-600',
                              ].join(' ')}>{s}</span>
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
                          const isInvalid = invalidSeriesRef.current.has(
                            (currentSlot.articulo?.cod_articu ?? '') + ':' + s
                          );
                          return (
                            <div key={s}
                              className={[
                                'flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors',
                                isInvalid
                                  ? 'bg-red-100 hover:bg-red-200'
                                  : 'bg-blue-100 hover:bg-blue-200',
                              ].join(' ')}>
                              {isInvalid && (
                                <span className="text-red-500 font-bold text-xs leading-none">!</span>
                              )}
                              <span className={[
                                'font-mono text-xs',
                                isInvalid ? 'text-red-700' : 'text-blue-700',
                              ].join(' ')}>{s}</span>
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

              <button
                onClick={handleGuardar}
                disabled={!canSave}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                           disabled:bg-gray-300 disabled:cursor-not-allowed
                           text-white font-bold text-lg rounded-xl transition-colors shadow-sm"
              >
                {saving
                  ? 'Guardando…'
                  : totalSeries > 0
                    ? `Guardar movimiento (${totalSeries} cilindro${totalSeries !== 1 ? 's' : ''})`
                    : 'Guardar movimiento'}
              </button>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
