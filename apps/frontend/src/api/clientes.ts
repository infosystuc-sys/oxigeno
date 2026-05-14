import axios from 'axios';
import type { Cliente, PostRemitoClientePayload, RemitoClienteResponse } from '@oxigeno/shared-types';

const BASE = '/api';

export async function buscarClientes(search: string): Promise<Cliente[]> {
  const { data } = await axios.get<Cliente[]>(`${BASE}/clientes`, { params: { search } });
  return data;
}

export async function obtenerProximoRemito(): Promise<string> {
  const { data } = await axios.get<{ nro_comprobante: string }>(`${BASE}/remito-cliente/proximo`);
  return data.nro_comprobante;
}

export async function guardarRemitoCliente(
  payload: PostRemitoClientePayload,
): Promise<RemitoClienteResponse> {
  const { data } = await axios.post<RemitoClienteResponse>(
    `${BASE}/remito-cliente`,
    payload,
    { timeout: 120_000 },
  );
  return data;
}
