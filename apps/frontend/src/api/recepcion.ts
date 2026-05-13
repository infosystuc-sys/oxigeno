import axios from 'axios';
import type {
  Proveedor,
  Articulo,
  PostRecepcionPayload,
  RecepcionResponse,
  TalonarioResponse,
} from '@oxigeno/shared-types';

const BASE = '/api';

export async function buscarProveedores(search: string): Promise<Proveedor[]> {
  const { data } = await axios.get<Proveedor[]>(`${BASE}/proveedores`, {
    params: { search },
  });
  return data;
}

export async function obtenerGases(): Promise<Articulo[]> {
  const { data } = await axios.get<Articulo[]>(`${BASE}/articulos/gases`);
  return data;
}

export async function obtenerTalonarioRecepcion(): Promise<TalonarioResponse> {
  const { data } = await axios.get<TalonarioResponse>(`${BASE}/talonario/recepcion`);
  return data;
}

export async function guardarRecepcion(
  payload: PostRecepcionPayload
): Promise<RecepcionResponse> {
  const { data } = await axios.post<RecepcionResponse>(
    `${BASE}/recepcion`,
    payload,
    { timeout: 120_000 } // 2 min client — el trigger puede tardar hasta 90s
  );
  return data;
}
