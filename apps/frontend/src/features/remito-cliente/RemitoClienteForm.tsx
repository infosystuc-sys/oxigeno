import { useState, useEffect, useRef, useCallback } from 'react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { buscarClientes, guardarRemitoCliente } from '../../api/clientes';
import { obtenerGases } from '../../api/recepcion';
import type {
  Cliente,
  Articulo,
  PostRemitoClientePayload,
  RemitoClienteResponse,
} from '@oxigeno/shared-types';

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
}: {
  resultado:   RemitoClienteResponse;
  totalSeries: number;
  onNuevo:     () => void;
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
  // Datos del remito
  const [remito,       setRemito]       = useState('');
  const [fecha,        setFecha]        = useState(todayISO);
  const [cliente,      setCliente]      = useState<Cliente | null>(null);
  const [cliSearch,    setCliSearch]    = useState('');
  const [cliResults,   setCliResults]   = useState<Cliente[]>([]);
  const [cliLoading,   setCliLoading]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Artículos / gases
  const [gases,           setGases]           = useState<Articulo[]>([]);
  const [currentSlot,     setCurrentSlot]     = useState<CurrentSlot>({
    articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '',
  });
  const [confirmedGroups, setConfirmedGroups] = useState<ConfirmedGroup[]>([]);
  const allSeriesRef = useRef<Set<string>>(new Set());
  const scanZoneRef  = useRef<HTMLDivElement>(null);

  // Estado de guardado / resultado
  const [saving,    setSaving]    = useState(false);
  const [resultado, setResultado] = useState<RemitoClienteResponse | null>(null);
  const [apiError,  setApiError]  = useState<string | null>(null);

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    obtenerGases().then(setGases).catch(console.error);
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
  }

  // ── Seleccionar gas ───────────────────────────────────────────────────────
  function selectGas(gas: Articulo) {
    confirmCurrentSlot();
    setCurrentSlot({ articulo: gas, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setTimeout(() => scanZoneRef.current?.focus(), 50);
  }

  // ── Limpiar slot actual ───────────────────────────────────────────────────
  function clearCurrentSlot() {
    currentSlot.series.forEach(s => allSeriesRef.current.delete(s));
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
  }

  // ── Agregar serie al slot actual ──────────────────────────────────────────
  const addSerie = useCallback((code: string) => {
    const trimmed = code.trim();
    if (trimmed.length < 3) return;
    if (allSeriesRef.current.has(trimmed)) {
      beep(); setTimeout(beep, 150);
      alert(`⚠️  La serie "${trimmed}" ya fue ingresada en este remito.`);
      return;
    }
    beep();
    allSeriesRef.current.add(trimmed);
    setCurrentSlot(prev => ({ ...prev, series: [...prev.series, trimmed] }));
  }, []);

  // ── Callback del scanner ──────────────────────────────────────────────────
  const handleScan = useCallback(
    (code: string) => {
      if (!currentSlot.articulo) return;
      addSerie(code);
    },
    [currentSlot.articulo, addSerie]
  );

  useBarcodeScanner(handleScan, !!currentSlot.articulo && !saving && resultado === null);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const totalConfirmed = confirmedGroups.reduce((n, g) => n + g.series.length, 0);
  const totalSeries    = totalConfirmed + currentSlot.series.length;
  const canSave        = !!remito.trim() && !!cliente && totalSeries > 0 && !saving;

  // ── Eliminar serie del slot actual ────────────────────────────────────────
  function removeCurrentSerie(serie: string) {
    allSeriesRef.current.delete(serie);
    setCurrentSlot(prev => ({ ...prev, series: prev.series.filter(s => s !== serie) }));
  }

  // ── Eliminar serie de un grupo confirmado ─────────────────────────────────
  function removeConfirmedSerie(codArticu: string, serie: string) {
    allSeriesRef.current.delete(serie);
    setConfirmedGroups(prev =>
      prev
        .map(g => g.articulo.cod_articu === codArticu
          ? { ...g, series: g.series.filter(s => s !== serie) }
          : g
        )
        .filter(g => g.series.length > 0)
    );
  }

  // ── Eliminar grupo confirmado completo ────────────────────────────────────
  function removeConfirmedGroup(codArticu: string) {
    setConfirmedGroups(prev => {
      const group = prev.find(g => g.articulo.cod_articu === codArticu);
      if (group) group.series.forEach(s => allSeriesRef.current.delete(s));
      return prev.filter(g => g.articulo.cod_articu !== codArticu);
    });
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleGuardar() {
    if (!canSave || !cliente) return;
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

    const payload: PostRemitoClientePayload = {
      cod_client: cliente.cod_client,
      nro_remito: remito.trim(),
      fecha,
      items: allGroups.map(g => ({ cod_articu: g.articulo.cod_articu, series: g.series })),
    };

    try {
      const res = await guardarRemitoCliente(payload);
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

  // ── Limpiar formulario ────────────────────────────────────────────────────
  function handleNuevo() {
    setRemito('');
    setFecha(todayISO());
    setCliente(null);
    setCliSearch('');
    setCliResults([]);
    setShowDropdown(false);
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
    setConfirmedGroups([]);
    allSeriesRef.current = new Set();
    setResultado(null);
    setApiError(null);
  }

  // ── Pantalla de éxito ─────────────────────────────────────────────────────
  if (resultado?.success) {
    return <SuccessScreen resultado={resultado} totalSeries={totalSeries} onNuevo={handleNuevo} />;
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

            {/* ── Card: Datos del remito ──────────────────────────────────── */}
            <section className="bg-white rounded-2xl shadow p-6 space-y-5">
              <h2 className="text-lg font-bold text-gray-700 border-b border-gray-100 pb-3">
                Datos del Remito
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {/* Nro comprobante */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Nro. Comprobante
                  </label>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <span className="text-gray-400 text-sm italic">Se asignará al guardar</span>
                    <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
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
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base
                               focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Nro. Remito */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Nro. Remito <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={remito}
                  maxLength={14}
                  onChange={e => {
                    const raw = e.target.value;
                    let filtered = '';
                    for (let i = 0; i < Math.min(raw.length, 14); i++) {
                      if (i === 0) {
                        if (/[a-zA-Z]/.test(raw[i])) filtered += raw[i].toUpperCase();
                      } else {
                        if (/[0-9]/.test(raw[i])) filtered += raw[i];
                      }
                    }
                    setRemito(filtered);
                  }}
                  placeholder="Ej: R00010012345"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
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
                      value={cliSearch}
                      onChange={e => setCliSearch(e.target.value)}
                      onFocus={() => { if (cliResults.length > 0) setShowDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
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
                      value={currentSlot.gasSearch}
                      onChange={e => setCurrentSlot(prev => ({ ...prev, gasSearch: e.target.value, showDropdown: true }))}
                      onFocus={() => setCurrentSlot(prev => ({ ...prev, showDropdown: true }))}
                      onBlur={() => setTimeout(() => setCurrentSlot(prev => ({ ...prev, showDropdown: false })), 200)}
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
                    <div className="flex justify-center mb-1 text-blue-400">
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm2 0h2v16H7V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h1v16h-1V4zm2 0h2v16h-2V4z"/>
                      </svg>
                    </div>
                    <p className="text-blue-700 font-bold">Listo para escanear</p>
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
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSerie(currentSlot.manualInput);
                            setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                          }
                        }}
                        placeholder="Escribir serie y presionar Enter…"
                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-base font-mono
                                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      />
                      <button
                        onClick={() => {
                          addSerie(currentSlot.manualInput);
                          setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                        }}
                        disabled={currentSlot.manualInput.trim().length < 3}
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
                        {currentSlot.series.map(serie => (
                          <div key={serie}
                            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200
                                       rounded-lg px-3 py-1.5 transition-colors">
                            <span className="font-mono text-sm text-gray-700 tracking-wide">{serie}</span>
                            <button
                              onClick={() => removeCurrentSerie(serie)}
                              className="text-gray-400 hover:text-red-500 text-lg leading-none transition-colors"
                              title={`Eliminar ${serie}`}
                            >×</button>
                          </div>
                        ))}
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
                        {group.series.map(s => (
                          <div key={s}
                            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200
                                       rounded-lg px-2.5 py-1 transition-colors">
                            <span className="font-mono text-xs text-gray-600">{s}</span>
                            <button
                              onClick={() => removeConfirmedSerie(group.articulo.cod_articu, s)}
                              className="text-gray-400 hover:text-red-500 text-sm leading-none transition-colors"
                              title={`Eliminar ${s}`}
                            >×</button>
                          </div>
                        ))}
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
                        {currentSlot.series.map(s => (
                          <div key={s}
                            className="flex items-center gap-1 bg-blue-100 hover:bg-blue-200
                                       rounded-lg px-2.5 py-1 transition-colors">
                            <span className="font-mono text-xs text-blue-700">{s}</span>
                            <button
                              onClick={() => removeCurrentSerie(s)}
                              className="text-blue-400 hover:text-red-500 text-sm leading-none transition-colors"
                              title={`Eliminar ${s}`}
                            >×</button>
                          </div>
                        ))}
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
