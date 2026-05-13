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
    <div className="min-h-screen bg-surface-subtle flex items-center justify-center p-6">
      <div className="bg-white border border-rim rounded-lg shadow-sm p-10 max-w-md w-full text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-ok-subtle flex items-center justify-center">
          <svg className="w-7 h-7 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-1">Remito guardado</h2>
        <p className="text-sm text-ink-muted mb-5">Ingresado correctamente en Tango Gestión</p>

        <div className="bg-primary-50 border border-primary-100 rounded px-6 py-4 mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-600 mb-1.5">
            Nro. Comprobante
          </p>
          <p className="text-3xl font-mono font-bold text-ink">
            {resultado.nro_comprobante}
          </p>
        </div>

        <p className="text-sm text-ink-muted mb-5">
          <span className="font-semibold text-ink">{totalSeries}</span>{' '}
          {totalSeries === 1 ? 'cilindro ingresado' : 'cilindros ingresados'}
        </p>

        <button
          onClick={onNuevo}
          className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                     text-white text-sm font-semibold rounded transition-colors"
        >
          Nuevo remito
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function RemitoClienteForm() {
  const [remito,       setRemito]       = useState('');
  const [fecha,        setFecha]        = useState(todayISO);
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
  const allSeriesRef = useRef<Set<string>>(new Set());
  const scanZoneRef  = useRef<HTMLDivElement>(null);

  const [saving,    setSaving]    = useState(false);
  const [resultado, setResultado] = useState<RemitoClienteResponse | null>(null);
  const [apiError,  setApiError]  = useState<string | null>(null);

  useEffect(() => {
    obtenerGases().then(setGases).catch(console.error);
  }, []);

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
    currentSlot.series.forEach(s => allSeriesRef.current.delete(s));
    setCurrentSlot({ articulo: null, series: [], gasSearch: '', showDropdown: false, manualInput: '' });
  }

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

  const handleScan = useCallback(
    (code: string) => {
      if (!currentSlot.articulo) return;
      addSerie(code);
    },
    [currentSlot.articulo, addSerie]
  );

  useBarcodeScanner(handleScan, !!currentSlot.articulo && !saving && resultado === null);

  const totalConfirmed = confirmedGroups.reduce((n, g) => n + g.series.length, 0);
  const totalSeries    = totalConfirmed + currentSlot.series.length;
  const canSave        = !!remito.trim() && !!cliente && totalSeries > 0 && !saving;

  function removeCurrentSerie(serie: string) {
    allSeriesRef.current.delete(serie);
    setCurrentSlot(prev => ({ ...prev, series: prev.series.filter(s => s !== serie) }));
  }

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

  function removeConfirmedGroup(codArticu: string) {
    setConfirmedGroups(prev => {
      const group = prev.find(g => g.articulo.cod_articu === codArticu);
      if (group) group.series.forEach(s => allSeriesRef.current.delete(s));
      return prev.filter(g => g.articulo.cod_articu !== codArticu);
    });
  }

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

  if (resultado?.success) {
    return <SuccessScreen resultado={resultado} totalSeries={totalSeries} onNuevo={handleNuevo} />;
  }

  // ─── Clase reutilizable para inputs ───────────────────────────────────────
  const inputCls =
    'w-full border border-rim rounded px-3 py-2 text-sm text-ink bg-white ' +
    'focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors';

  return (
    <div className="flex-1 overflow-y-auto bg-surface-subtle">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-rim px-8 py-5">
        <p className="text-[11px] font-medium text-ink-subtle uppercase tracking-wider mb-0.5">
          Ventas
        </p>
        <h1 className="text-xl font-semibold text-ink">Remito a Clientes</h1>
      </div>

      {/* ── Overlay de guardado ───────────────────────────────────────────── */}
      {saving && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center">
          <div className="bg-white border border-rim rounded-lg shadow-lg px-10 py-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-semibold text-ink">Guardando en Tango…</p>
            <p className="text-sm text-ink-muted">El trigger puede tardar hasta 90 segundos</p>
          </div>
        </div>
      )}

      {/* ── Layout de dos columnas ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-5 gap-5 items-start">

          {/* ══ Columna izquierda (60%) ══════════════════════════════════════ */}
          <div className="col-span-3 space-y-4">

            {/* Error de API */}
            {apiError && (
              <div className="flex items-start gap-3 bg-fail-subtle border border-fail-muted text-fail rounded px-4 py-3">
                <span className="text-lg leading-none mt-0.5 shrink-0">⚠</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Error al guardar</p>
                  <p className="text-xs mt-0.5">{apiError}</p>
                </div>
                <button
                  onClick={() => setApiError(null)}
                  className="text-fail/50 hover:text-fail text-lg leading-none mt-0.5"
                >×</button>
              </div>
            )}

            {/* ── Card: Datos del remito ──────────────────────────────────── */}
            <section className="bg-white border border-rim rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-rim">
                <h2 className="text-sm font-semibold text-ink">Datos del Remito</h2>
              </div>
              <div className="px-6 py-5 space-y-4">

                <div className="grid grid-cols-2 gap-4">
                  {/* Nro. Comprobante (solo lectura) */}
                  <div>
                    <label className="block text-xs font-medium text-ink-muted mb-1.5">
                      Nro. Comprobante
                    </label>
                    <div className="flex items-center gap-2 border border-rim rounded bg-surface-subtle px-3 py-2 h-9">
                      <span className="text-xs text-ink-subtle italic flex-1">Se asignará al guardar</span>
                      <svg className="w-3.5 h-3.5 text-ink-subtle shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <p className="text-[11px] text-ink-subtle mt-1">Asignado automáticamente</p>
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="block text-xs font-medium text-ink-muted mb-1.5">
                      Fecha <span className="text-fail">*</span>
                    </label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={e => setFecha(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Nro. Remito */}
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">
                    Nro. Remito <span className="text-fail">*</span>
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
                    className={inputCls}
                  />
                </div>

                {/* Cliente */}
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">
                    Cliente <span className="text-fail">*</span>
                  </label>

                  {cliente ? (
                    <div className="flex items-center gap-3 border border-ok-muted bg-ok-subtle rounded px-3 py-2">
                      <span className="font-mono text-xs text-ink-subtle shrink-0">{cliente.cod_client}</span>
                      <span className="flex-1 text-sm font-semibold text-ink leading-tight">
                        {cliente.RAZON_SOCI}
                      </span>
                      <button
                        onClick={() => { setCliente(null); setCliSearch(''); }}
                        className="text-ink-subtle hover:text-fail text-xl leading-none"
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
                        className={inputCls}
                      />
                      {cliLoading && (
                        <span className="absolute right-3 top-2 text-xs text-ink-subtle animate-pulse">
                          Buscando…
                        </span>
                      )}
                      {showDropdown && cliResults.length > 0 && (
                        <ul className="absolute z-30 w-full mt-1 bg-white border border-rim rounded shadow-md
                                       max-h-60 overflow-y-auto divide-y divide-rim-light">
                          {cliResults.map(c => (
                            <li key={c.cod_client}>
                              <button
                                onMouseDown={() => {
                                  setCliente(c);
                                  setShowDropdown(false);
                                  setCliSearch('');
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-primary-50 flex items-center gap-3 transition-colors"
                              >
                                <span className="font-mono text-xs text-ink-subtle w-20 shrink-0">{c.cod_client}</span>
                                <span className="text-sm text-ink">{c.RAZON_SOCI}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {showDropdown && !cliLoading && cliSearch.length >= 2 && cliResults.length === 0 && (
                        <div className="absolute z-30 w-full mt-1 bg-white border border-rim rounded shadow-sm
                                        p-4 text-center text-sm text-ink-subtle">
                          Sin resultados para "{cliSearch}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Card: Escaneo de cilindros ──────────────────────────────── */}
            <section className="bg-white border border-rim rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-rim">
                <h2 className="text-sm font-semibold text-ink">Escaneo de Cilindros</h2>
              </div>
              <div className="px-6 py-5 space-y-4">

                {/* Selector de gas */}
                <div>
                  <label className="block text-xs font-medium text-ink-muted mb-1.5">
                    Tipo de Gas
                  </label>

                  {currentSlot.articulo ? (
                    <div className="flex items-center gap-3 border border-ok-muted bg-ok-subtle rounded px-3 py-2">
                      <span className="font-mono text-xs text-ink-subtle shrink-0">{currentSlot.articulo.cod_articu}</span>
                      <span className="flex-1 text-sm font-semibold text-ink leading-tight">
                        {currentSlot.articulo.descrip}
                      </span>
                      <button
                        onClick={clearCurrentSlot}
                        className="text-ink-subtle hover:text-fail text-xl leading-none"
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
                        className={inputCls}
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
                            <div className="absolute z-30 w-full mt-1 bg-white border border-rim rounded shadow-sm
                                            p-4 text-center text-sm text-ink-subtle">
                              Sin resultados para "{currentSlot.gasSearch}"
                            </div>
                          );
                        }
                        if (filtered.length === 0) return null;
                        return (
                          <ul className="absolute z-30 w-full mt-1 bg-white border border-rim rounded shadow-md
                                         max-h-60 overflow-y-auto divide-y divide-rim-light">
                            {filtered.map(g => (
                              <li key={g.cod_articu}>
                                <button
                                  onMouseDown={() => selectGas(g)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-primary-50 flex items-center gap-3 transition-colors"
                                >
                                  <span className="font-mono text-xs text-ink-subtle w-28 shrink-0">{g.cod_articu}</span>
                                  <span className="text-sm text-ink">{g.descrip}</span>
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
                    {/* Zona para lector de barras */}
                    <div
                      ref={scanZoneRef}
                      tabIndex={0}
                      onClick={() => scanZoneRef.current?.focus()}
                      className="border-2 border-dashed border-primary-100 rounded-lg p-5 text-center
                                 cursor-pointer select-none outline-none transition-all bg-primary-50
                                 hover:border-primary-200 focus:border-primary-600
                                 focus:ring-2 focus:ring-primary-600/10 focus:bg-primary-50"
                    >
                      <div className="flex justify-center mb-1.5 text-primary-600/40">
                        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm2 0h2v16H7V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h1v16h-1V4zm2 0h2v16h-2V4z"/>
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-primary-600">Listo para escanear</p>
                      <p className="text-xs text-ink-muted mt-1">Apunte el lector al código de barras</p>
                    </div>

                    {/* Ingreso manual */}
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1.5">
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
                          className="flex-1 border border-rim rounded px-3 py-2 text-sm font-mono text-ink bg-white
                                     focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors"
                        />
                        <button
                          onClick={() => {
                            addSerie(currentSlot.manualInput);
                            setCurrentSlot(prev => ({ ...prev, manualInput: '' }));
                          }}
                          disabled={currentSlot.manualInput.trim().length < 3}
                          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-rim
                                     disabled:text-ink-subtle disabled:cursor-not-allowed
                                     text-white text-sm font-medium rounded transition-colors"
                        >
                          Agregar
                        </button>
                      </div>
                    </div>

                    {/* Series del slot actual */}
                    {currentSlot.series.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                          Series ingresadas ({currentSlot.series.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {currentSlot.series.map(serie => (
                            <div key={serie}
                              className="flex items-center gap-1 bg-rim-light border border-rim rounded px-2.5 py-1">
                              <span className="font-mono text-xs text-ink">{serie}</span>
                              <button
                                onClick={() => removeCurrentSerie(serie)}
                                className="text-ink-subtle hover:text-fail text-sm leading-none ml-0.5 transition-colors"
                                title={`Eliminar ${serie}`}
                              >×</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Botón confirmar */}
                    <button
                      onClick={confirmCurrentSlot}
                      disabled={currentSlot.series.length === 0}
                      className="w-full py-2.5 bg-ok hover:bg-ok-dark disabled:bg-rim disabled:text-ink-subtle
                                 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors"
                    >
                      {currentSlot.series.length > 0
                        ? `Confirmar ${currentSlot.series.length} serie${currentSlot.series.length !== 1 ? 's' : ''} — ${currentSlot.articulo?.descrip}`
                        : 'Confirmar series'}
                    </button>
                  </>
                ) : (
                  <div className="border border-dashed border-rim rounded-lg p-8 text-center">
                    <p className="text-sm text-ink-subtle">Seleccione un tipo de gas para activar el scanner</p>
                  </div>
                )}
              </div>
            </section>

            {/* Limpiar todo */}
            <div className="pb-8">
              <button
                onClick={handleNuevo}
                className="px-4 py-2 border border-rim text-sm text-ink-muted rounded
                           hover:bg-rim-light transition-colors"
              >
                Limpiar todo
              </button>
            </div>
          </div>

          {/* ══ Columna derecha (40%) ════════════════════════════════════════ */}
          <div className="col-span-2">
            <div className="sticky top-6 space-y-3">

              {/* Panel de cilindros */}
              <div className="bg-white border border-rim rounded-lg shadow-sm overflow-hidden">

                {/* Header del panel */}
                <div className="bg-surface-subtle border-b border-rim px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-ink-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                    </svg>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                      Cilindros a remitir
                    </span>
                  </div>
                  {totalSeries > 0 && (
                    <span className="bg-primary-50 text-primary-600 border border-primary-100 text-xs font-semibold
                                     px-2 py-0.5 rounded-full">
                      {totalSeries}
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">

                  {/* Grupos confirmados */}
                  {confirmedGroups.map(group => (
                    <div key={group.articulo.cod_articu}
                      className="border border-rim rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-semibold text-ink leading-tight">
                          {group.articulo.descrip}
                        </span>
                        <span className="font-mono text-[10px] text-ink-subtle bg-rim-light px-1.5 py-0.5 rounded shrink-0">
                          {group.articulo.cod_articu}
                        </span>
                        <span className="text-[10px] font-semibold text-ok bg-ok-subtle border border-ok-muted
                                         px-1.5 py-0.5 rounded shrink-0">
                          {group.series.length}
                        </span>
                        <button
                          onClick={() => removeConfirmedGroup(group.articulo.cod_articu)}
                          className="text-ink-subtle hover:text-fail text-base leading-none shrink-0 transition-colors"
                          title="Eliminar grupo"
                        >×</button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {group.series.map(s => (
                          <div key={s}
                            className="flex items-center gap-0.5 bg-rim-light border border-rim rounded px-2 py-0.5">
                            <span className="font-mono text-[10px] text-ink-muted">{s}</span>
                            <button
                              onClick={() => removeConfirmedSerie(group.articulo.cod_articu, s)}
                              className="text-ink-subtle hover:text-fail text-xs leading-none ml-0.5 transition-colors"
                              title={`Eliminar ${s}`}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Slot actual en curso */}
                  {currentSlot.articulo && currentSlot.series.length > 0 && (
                    <div className="border border-primary-100 bg-primary-50 rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-xs font-semibold text-primary-600 leading-tight">
                          {currentSlot.articulo.descrip}
                        </span>
                        <span className="font-mono text-[10px] text-primary-600/60 bg-primary-100
                                         px-1.5 py-0.5 rounded shrink-0">
                          {currentSlot.articulo.cod_articu}
                        </span>
                        <span className="text-[10px] font-semibold text-primary-600 bg-primary-100
                                         border border-primary-200 px-1.5 py-0.5 rounded shrink-0">
                          {currentSlot.series.length}
                        </span>
                        <span className="text-[9px] font-bold bg-primary-600 text-white px-1.5 py-0.5 rounded shrink-0">
                          EN CURSO
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {currentSlot.series.map(s => (
                          <div key={s}
                            className="flex items-center gap-0.5 bg-primary-100 border border-primary-200 rounded px-2 py-0.5">
                            <span className="font-mono text-[10px] text-primary-700">{s}</span>
                            <button
                              onClick={() => removeCurrentSerie(s)}
                              className="text-primary-400 hover:text-fail text-xs leading-none ml-0.5 transition-colors"
                              title={`Eliminar ${s}`}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Estado vacío */}
                  {totalSeries === 0 && (
                    <p className="text-center text-ink-subtle text-xs italic py-8">
                      Los cilindros escaneados aparecerán aquí
                    </p>
                  )}
                </div>
              </div>

              {/* Botón Guardar remito */}
              <button
                onClick={handleGuardar}
                disabled={!canSave}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                           disabled:bg-rim disabled:text-ink-subtle disabled:cursor-not-allowed
                           text-white font-semibold text-sm rounded transition-colors shadow-sm"
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
