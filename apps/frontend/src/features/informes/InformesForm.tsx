import React, { useState, useRef, useEffect } from 'react';
import {
  fetchRecepciones,
  fetchRemitos,
  fetchMovimientos,
  fetchDetalle,
  fetchTrazabilidad,
} from '../../api/informes';
import type {
  ComprobanteRecepcion,
  ComprobanteRemito,
  ComprobanteMovimiento,
  ComprobanteDetalle,
  TrazabilidadSerie,
} from '@oxigeno/shared-types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MainTab        = 'comprobantes' | 'trazabilidad';
type ComprobantesTab = 'recepciones' | 'remitos' | 'movimientos';

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6
                     bg-blue-100 text-blue-700 text-xs font-bold rounded-full px-2">
      {n}
    </span>
  );
}

function TipoIcon({ tipo }: { tipo: string }) {
  if (tipo === 'Recepción')
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />;
  if (tipo === 'Remito a Cliente')
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />;
}

// ─── Fila expandible genérica ─────────────────────────────────────────────────

function DetallePanel({ idSta14 }: { idSta14: number }) {
  const [data,    setData]    = useState<ComprobanteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDetalle(idSta14)
      .then(d  => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Error al cargar detalle'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idSta14]);

  if (loading) return (
    <div className="px-6 py-4 text-sm text-gray-400 animate-pulse">Cargando detalle…</div>
  );
  if (error) return (
    <div className="px-6 py-4 text-sm text-red-500">{error}</div>
  );
  if (!data || data.items.length === 0) return (
    <div className="px-6 py-4 text-sm text-gray-400 italic">Sin detalle disponible</div>
  );

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 space-y-4">
      {data.items.map(item => (
        <div key={item.cod_articu} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-700">{item.descrip}</span>
            <span className="font-mono text-xs text-gray-400 bg-white border border-gray-200
                             px-1.5 py-0.5 rounded">
              {item.cod_articu}
            </span>
            <Badge n={item.series.length} />
          </div>
          {item.series.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.series.map(s => (
                <span key={s}
                  className="font-mono text-xs bg-white border border-gray-200
                             text-gray-600 px-2.5 py-1 rounded-lg">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Panel de filtros ─────────────────────────────────────────────────────────

interface FiltroProps {
  values:   Record<string, string>;
  onChange: (k: string, v: string) => void;
  onSearch: () => void;
  loading:  boolean;
  fields:   { key: string; label: string; placeholder?: string; type?: string }[];
}

function FiltroPanel({ values, onChange, onSearch, loading, fields }: FiltroProps) {
  return (
    <form
      className="bg-white rounded-2xl shadow p-5 space-y-4"
      onSubmit={e => { e.preventDefault(); onSearch(); }}
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {f.label}
            </label>
            <input
              type={f.type ?? 'text'}
              value={values[f.key] ?? ''}
              onChange={e => onChange(f.key, e.target.value)}
              placeholder={f.placeholder ?? ''}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
                     text-white text-sm font-bold rounded-xl transition-colors"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
        <button
          type="button"
          onClick={() => {
            fields.forEach(f => onChange(f.key, ''));
          }}
          className="px-5 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium
                     rounded-xl hover:bg-gray-50 transition-colors"
        >
          Limpiar filtros
        </button>
      </div>
    </form>
  );
}

// ─── Tabla de resultados con filas expandibles ────────────────────────────────

function ResultsTable<T extends { id_sta14: number }>({
  rows,
  headers,
  renderRow,
  emptyMsg,
}: {
  rows:      T[];
  headers:   string[];
  renderRow: (row: T) => React.ReactNode[];
  emptyMsg:  string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-400 text-sm italic">
        {emptyMsg}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map(h => (
              <th key={h}
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {h}
              </th>
            ))}
            <th className="w-10 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <React.Fragment key={row.id_sta14}>
              <tr
                onClick={() => setExpandedId(prev => prev === row.id_sta14 ? null : row.id_sta14)}
                className="hover:bg-blue-50 cursor-pointer transition-colors"
              >
                {renderRow(row).map((cell, i) => (
                  <td key={i} className="px-4 py-3 text-gray-700">{cell}</td>
                ))}
                <td className="px-4 py-3 text-gray-400 text-center">
                  <span className={`inline-block transition-transform duration-150 ${expandedId === row.id_sta14 ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </td>
              </tr>
              {expandedId === row.id_sta14 && (
                <tr>
                  <td colSpan={headers.length + 1} className="p-0">
                    <DetallePanel idSta14={row.id_sta14} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
        {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
      </div>
    </div>
  );
}

// ─── Tab Recepciones ──────────────────────────────────────────────────────────

function TabRecepciones() {
  const initFiltro = { fecha_desde: monthStart(), fecha_hasta: today(), cod_proveedor: '', cod_articulo: '' };
  const [filtro,   setFiltro]   = useState(initFiltro);
  const [rows,     setRows]     = useState<ComprobanteRecepcion[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function setF(k: string, v: string) { setFiltro(prev => ({ ...prev, [k]: v })); }

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecepciones({
        fecha_desde:   filtro.fecha_desde   || undefined,
        fecha_hasta:   filtro.fecha_hasta   || undefined,
        cod_proveedor: filtro.cod_proveedor || undefined,
        cod_articulo:  filtro.cod_articulo  || undefined,
      });
      setRows(data);
      setSearched(true);
    } catch {
      setError('Error al consultar. Verifique la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <FiltroPanel
        values={filtro}
        onChange={setF}
        onSearch={buscar}
        loading={loading}
        fields={[
          { key: 'fecha_desde',   label: 'Fecha desde',  type: 'date' },
          { key: 'fecha_hasta',   label: 'Fecha hasta',  type: 'date' },
          { key: 'cod_proveedor', label: 'Proveedor',    placeholder: 'Código o nombre…' },
          { key: 'cod_articulo',  label: 'Artículo',     placeholder: 'Código o nombre…' },
        ]}
      />
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {searched && (
        <ResultsTable
          rows={rows}
          headers={['Fecha', 'Comprobante', 'Proveedor', 'Artículos', 'Cilindros']}
          emptyMsg="Sin recepciones para los filtros seleccionados"
          renderRow={r => [
            <span className="font-mono text-xs text-gray-500">{r.fecha}</span>,
            <span className="font-mono font-bold text-blue-700">{r.n_comp.trim()}</span>,
            <span>
              <span className="font-mono text-xs text-gray-400 mr-1.5">{r.cod_proveedor}</span>
              {r.nombre_proveedor}
            </span>,
            <Badge n={r.total_articulos} />,
            <Badge n={r.total_series} />,
          ]}
        />
      )}
    </div>
  );
}

// ─── Tab Remitos a Clientes ───────────────────────────────────────────────────

function TabRemitos() {
  const initFiltro = { fecha_desde: monthStart(), fecha_hasta: today(), cod_cliente: '', cod_articulo: '' };
  const [filtro,   setFiltro]   = useState(initFiltro);
  const [rows,     setRows]     = useState<ComprobanteRemito[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function setF(k: string, v: string) { setFiltro(prev => ({ ...prev, [k]: v })); }

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRemitos({
        fecha_desde:  filtro.fecha_desde  || undefined,
        fecha_hasta:  filtro.fecha_hasta  || undefined,
        cod_cliente:  filtro.cod_cliente  || undefined,
        cod_articulo: filtro.cod_articulo || undefined,
      });
      setRows(data);
      setSearched(true);
    } catch {
      setError('Error al consultar. Verifique la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <FiltroPanel
        values={filtro}
        onChange={setF}
        onSearch={buscar}
        loading={loading}
        fields={[
          { key: 'fecha_desde',  label: 'Fecha desde', type: 'date' },
          { key: 'fecha_hasta',  label: 'Fecha hasta', type: 'date' },
          { key: 'cod_cliente',  label: 'Cliente',     placeholder: 'Código o nombre…' },
          { key: 'cod_articulo', label: 'Artículo',    placeholder: 'Código o nombre…' },
        ]}
      />
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {searched && (
        <ResultsTable
          rows={rows}
          headers={['Fecha', 'Comprobante', 'Cliente', 'Artículos', 'Cilindros']}
          emptyMsg="Sin remitos para los filtros seleccionados"
          renderRow={r => [
            <span className="font-mono text-xs text-gray-500">{r.fecha}</span>,
            <span className="font-mono font-bold text-orange-700">{r.n_comp.trim()}</span>,
            <span>
              <span className="font-mono text-xs text-gray-400 mr-1.5">{r.cod_cliente}</span>
              {r.nombre_cliente}
            </span>,
            <Badge n={r.total_articulos} />,
            <Badge n={r.total_series} />,
          ]}
        />
      )}
    </div>
  );
}

// ─── Tab Movimientos entre Depósitos ──────────────────────────────────────────

function TabMovimientos() {
  const initFiltro = { fecha_desde: monthStart(), fecha_hasta: today(), cod_deposito: '', cod_articulo: '' };
  const [filtro,   setFiltro]   = useState(initFiltro);
  const [rows,     setRows]     = useState<ComprobanteMovimiento[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function setF(k: string, v: string) { setFiltro(prev => ({ ...prev, [k]: v })); }

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMovimientos({
        fecha_desde:  filtro.fecha_desde  || undefined,
        fecha_hasta:  filtro.fecha_hasta  || undefined,
        cod_deposito: filtro.cod_deposito || undefined,
        cod_articulo: filtro.cod_articulo || undefined,
      });
      setRows(data);
      setSearched(true);
    } catch {
      setError('Error al consultar. Verifique la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <FiltroPanel
        values={filtro}
        onChange={setF}
        onSearch={buscar}
        loading={loading}
        fields={[
          { key: 'fecha_desde',  label: 'Fecha desde', type: 'date' },
          { key: 'fecha_hasta',  label: 'Fecha hasta', type: 'date' },
          { key: 'cod_deposito', label: 'Depósito',    placeholder: 'Código o nombre…' },
          { key: 'cod_articulo', label: 'Artículo',    placeholder: 'Código o nombre…' },
        ]}
      />
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {searched && (
        <ResultsTable
          rows={rows}
          headers={['Fecha', 'Comprobante', 'Origen', 'Destino', 'Artículos', 'Cilindros']}
          emptyMsg="Sin movimientos para los filtros seleccionados"
          renderRow={r => [
            <span className="font-mono text-xs text-gray-500">{r.fecha}</span>,
            <span className="font-mono font-bold text-blue-700">{r.n_comp.trim()}</span>,
            <span>
              <span className="font-mono text-xs text-gray-400 mr-1">{r.cod_origen}</span>
              {r.nombre_origen}
            </span>,
            <span>
              <span className="font-mono text-xs text-gray-400 mr-1">{r.cod_destino}</span>
              {r.nombre_destino}
            </span>,
            <Badge n={r.total_articulos} />,
            <Badge n={r.total_series} />,
          ]}
        />
      )}
    </div>
  );
}

// ─── Tab Trazabilidad ─────────────────────────────────────────────────────────

function TabTrazabilidad() {
  const [input,   setInput]   = useState('');
  const [data,    setData]    = useState<TrazabilidadSerie | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function buscar() {
    const serie = input.trim();
    if (!serie) return;
    setLoading(true);
    setData(null);
    setNotFound(false);
    setError(null);
    try {
      const d = await fetchTrazabilidad(serie);
      setData(d);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setNotFound(true);
      else setError('Error al consultar. Verifique la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  const TIPO_COLORS: Record<string, string> = {
    'Recepción':                 'bg-green-500',
    'Remito a Cliente':          'bg-orange-500',
    'Movimiento entre Depósitos': 'bg-blue-500',
  };

  const TIPO_LABELS: Record<string, string> = {
    'Recepción':                 'Ingreso',
    'Remito a Cliente':          'Salida',
    'Movimiento entre Depósitos': 'Traslado',
  };

  return (
    <div className="space-y-5">
      {/* Buscador */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Buscar serie
        </h3>
        <form
          className="flex gap-3"
          onSubmit={e => { e.preventDefault(); buscar(); }}
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Número de serie…"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base font-mono
                       focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
                       disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* No encontrada */}
      {notFound && (
        <div className="bg-white rounded-2xl shadow p-10 text-center">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-lg font-semibold text-gray-700">Serie no encontrada</p>
          <p className="text-sm text-gray-400 mt-1">
            El número <span className="font-mono font-bold">{input.trim()}</span> no existe en el sistema
          </p>
        </div>
      )}

      {/* Resultado */}
      {data && (
        <div className="space-y-4">
          {/* Encabezado de la serie */}
          <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Serie</p>
              <p className="text-2xl font-mono font-bold text-gray-800">{data.n_serie}</p>
            </div>
            <div className="ml-auto">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                {data.rutas.length} {data.rutas.length === 1 ? 'artículo' : 'artículos'}
              </span>
            </div>
          </div>

          {/* Una card por cada artículo/ruta */}
          {data.rutas.map(ruta => (
            <div key={ruta.cod_articu} className="space-y-3">
              {/* Artículo + ubicación actual */}
              <div className="bg-white rounded-2xl shadow p-6">
                <div className="flex items-start gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center shrink-0">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
                      Artículo
                    </p>
                    <p className="text-lg font-bold text-gray-800 leading-tight">
                      {ruta.descrip}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">{ruta.cod_articu}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
                      Ubicación actual
                    </p>
                    <p className="text-base font-bold text-green-700 leading-tight">
                      {ruta.deposito_actual_nombre}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">
                      Depósito {ruta.cod_deposi_actual}
                    </p>
                  </div>
                </div>
              </div>

              {/* Historial de este artículo */}
              <div className="bg-white rounded-2xl shadow overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    Historial de movimientos ({ruta.historial.length})
                  </h3>
                </div>

                {ruta.historial.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm italic py-10">
                    Sin movimientos registrados para este artículo
                  </p>
                ) : (
                  <div className="p-5">
                    <ol className="relative border-l-2 border-gray-200 ml-3 space-y-0">
                      {ruta.historial.map((mov, i) => (
                        <li key={i} className="pl-6 pb-6 relative">
                          <div className={[
                            'absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white',
                            TIPO_COLORS[mov.tipo_movimiento] ?? 'bg-gray-400',
                          ].join(' ')} />

                          <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={[
                                  'text-xs font-bold px-2 py-0.5 rounded-full text-white',
                                  TIPO_COLORS[mov.tipo_movimiento] ?? 'bg-gray-400',
                                ].join(' ')}>
                                  {TIPO_LABELS[mov.tipo_movimiento] ?? mov.tipo_movimiento}
                                </span>
                                <span className="font-mono text-xs text-gray-500">
                                  {mov.fecha}
                                </span>
                                <span className="font-mono text-xs font-bold text-gray-700">
                                  {mov.n_comp.trim()}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-2 text-sm">
                                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                                </svg>
                                <span className="font-semibold text-gray-700">{mov.deposito_nombre}</span>
                                <span className="font-mono text-xs text-gray-400">({mov.cod_deposi})</span>
                              </div>
                              {(mov.entidad_nombre || mov.entidad_cod) && (
                                <p className="text-xs text-gray-500 mt-0.5 ml-6">
                                  {mov.entidad_nombre
                                    ? <><span className="font-semibold">{mov.entidad_nombre}</span> <span className="font-mono text-gray-400">({mov.entidad_cod})</span></>
                                    : <span className="font-mono">{mov.entidad_cod}</span>
                                  }
                                </p>
                              )}
                            </div>
                            {i === ruta.historial.length - 1 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold
                                               px-2 py-0.5 rounded-full shrink-0 mt-0.5">
                                ÚLTIMO
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function InformesForm() {
  const [mainTab,  setMainTab]  = useState<MainTab>('comprobantes');
  const [compTab,  setCompTab]  = useState<ComprobantesTab>('recepciones');

  const MAIN_TABS: { id: MainTab; label: string }[] = [
    { id: 'comprobantes', label: 'Comprobantes' },
    { id: 'trazabilidad', label: 'Trazabilidad de Serie' },
  ];

  const COMP_TABS: { id: ComprobantesTab; label: string; color: string }[] = [
    { id: 'recepciones', label: 'Recepciones',              color: 'green'  },
    { id: 'remitos',     label: 'Remitos a Clientes',       color: 'orange' },
    { id: 'movimientos', label: 'Movimientos entre Depósitos', color: 'blue' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Informes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Consulta de comprobantes y trazabilidad de cilindros
          </p>
        </div>

        {/* Tabs principales */}
        <div className="flex gap-1 bg-white rounded-2xl shadow p-1.5 w-fit">
          {MAIN_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={[
                'px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors',
                mainTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Comprobantes ──────────────────────────────────────────────── */}
        {mainTab === 'comprobantes' && (
          <div className="space-y-4">
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-white rounded-xl shadow-sm p-1 border border-gray-200 w-fit">
              {COMP_TABS.map(tab => {
                const active = compTab === tab.id;
                const colorMap: Record<string, string> = {
                  green:  active ? 'bg-green-600 text-white'  : 'text-gray-500 hover:text-green-700 hover:bg-green-50',
                  orange: active ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-orange-700 hover:bg-orange-50',
                  blue:   active ? 'bg-blue-600 text-white'   : 'text-gray-500 hover:text-blue-700 hover:bg-blue-50',
                };
                return (
                  <button
                    key={tab.id}
                    onClick={() => setCompTab(tab.id)}
                    className={[
                      'px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2',
                      colorMap[tab.color] ?? '',
                    ].join(' ')}
                  >
                    <TipoIcon tipo={
                      tab.id === 'recepciones' ? 'Recepción'
                      : tab.id === 'remitos'   ? 'Remito a Cliente'
                      : 'Movimiento entre Depósitos'
                    } />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {compTab === 'recepciones' && <TabRecepciones />}
            {compTab === 'remitos'     && <TabRemitos />}
            {compTab === 'movimientos' && <TabMovimientos />}
          </div>
        )}

        {/* ── Trazabilidad ──────────────────────────────────────────────── */}
        {mainTab === 'trazabilidad' && <TabTrazabilidad />}

      </div>
    </div>
  );
}
