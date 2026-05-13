import { getPool, sql } from '../config/db';
import type { Cliente } from '@oxigeno/shared-types';

/**
 * Busca clientes en gva14 por código o razón social.
 * Máximo 20 resultados (para autocompletado).
 */
export async function buscarClientes(search: string): Promise<Cliente[]> {
  const pool    = await getPool();
  const request = pool.request();

  let query: string;

  if (search.trim() === '') {
    query = `
      SELECT TOP 20
        RTRIM(COD_CLIENT) AS cod_client,
        RTRIM(RAZON_SOCI) AS RAZON_SOCI
      FROM gva14 WITH (NOLOCK)
      ORDER BY RAZON_SOCI
    `;
  } else {
    request.input('term', sql.VarChar(100), `%${search}%`);
    query = `
      SELECT TOP 20
        RTRIM(COD_CLIENT) AS cod_client,
        RTRIM(RAZON_SOCI) AS RAZON_SOCI
      FROM gva14 WITH (NOLOCK)
      WHERE COD_CLIENT LIKE @term OR RAZON_SOCI LIKE @term
      ORDER BY RAZON_SOCI
    `;
  }

  const result = await request.query<Cliente>(query);
  return result.recordset;
}
