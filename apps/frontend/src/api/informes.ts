import axios from 'axios';
import type {
  ComprobanteRecepcion,
  ComprobanteRemito,
  ComprobanteMovimiento,
  ComprobanteDetalle,
  TrazabilidadSerie,
} from '@oxigeno/shared-types';

const BASE = '/api/informes';

export async function fetchRecepciones(params: {
  fecha_desde?:  string;
  fecha_hasta?:  string;
  cod_proveedor?: string;
  cod_articulo?:  string;
}): Promise<ComprobanteRecepcion[]> {
  const { data } = await axios.get<ComprobanteRecepcion[]>(`${BASE}/recepciones`, { params });
  return data;
}

export async function fetchRemitos(params: {
  fecha_desde?: string;
  fecha_hasta?: string;
  cod_cliente?: string;
  cod_articulo?: string;
}): Promise<ComprobanteRemito[]> {
  const { data } = await axios.get<ComprobanteRemito[]>(`${BASE}/remitos`, { params });
  return data;
}

export async function fetchMovimientos(params: {
  fecha_desde?:  string;
  fecha_hasta?:  string;
  cod_deposito?: string;
  cod_articulo?: string;
}): Promise<ComprobanteMovimiento[]> {
  const { data } = await axios.get<ComprobanteMovimiento[]>(`${BASE}/movimientos`, { params });
  return data;
}

export async function fetchDetalle(idSta14: number): Promise<ComprobanteDetalle> {
  const { data } = await axios.get<ComprobanteDetalle>(`${BASE}/detalle/${idSta14}`);
  return data;
}

export async function fetchTrazabilidad(nSerie: string): Promise<TrazabilidadSerie> {
  const { data } = await axios.get<TrazabilidadSerie>(`${BASE}/serie/${encodeURIComponent(nSerie)}`);
  return data;
}
