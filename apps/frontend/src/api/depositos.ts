import axios from 'axios';
import type {
  Deposito,
  PostMovimientoDepositoPayload,
  MovimientoDepositoResponse,
} from '@oxigeno/shared-types';

const BASE = '/api/movimiento-depositos';

export async function buscarDepositos(search: string): Promise<Deposito[]> {
  const { data } = await axios.get<Deposito[]>(`${BASE}/depositos`, { params: { search } });
  return data;
}

export async function obtenerProximoMovimiento(): Promise<string> {
  const { data } = await axios.get<{ nro_comprobante: string }>(`${BASE}/proximo`);
  return data.nro_comprobante;
}

export async function guardarMovimientoDeposito(
  payload: PostMovimientoDepositoPayload,
): Promise<MovimientoDepositoResponse> {
  const { data } = await axios.post<MovimientoDepositoResponse>(BASE, payload, { timeout: 120_000 });
  return data;
}
