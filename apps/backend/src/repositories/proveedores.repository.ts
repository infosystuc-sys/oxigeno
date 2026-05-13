import { getPool, sql } from '../config/db';
import type { Proveedor } from '@oxigeno/shared-types';

/**
 * Busca proveedores en cpa01 por código o nombre.
 * Columnas reales inspeccionadas: COD_PROVEE, NOM_PROVEE, HABILITADO.
 * Máximo 20 resultados (para autocompletado).
 */
export async function buscarProveedores(search: string): Promise<Proveedor[]> {
  const pool = await getPool();
  const request = pool.request();

  let query: string;

  if (search.trim() === '') {
    query = `
      SELECT TOP 20
        RTRIM(COD_PROVEE) AS cod_provee,
        RTRIM(NOM_PROVEE) AS NOM_PROVEE
      FROM cpa01 WITH (NOLOCK)
      WHERE HABILITADO = 1
      ORDER BY NOM_PROVEE
    `;
  } else {
    request.input('term', sql.VarChar(100), `%${search}%`);
    query = `
      SELECT TOP 20
        RTRIM(COD_PROVEE) AS cod_provee,
        RTRIM(NOM_PROVEE) AS NOM_PROVEE
      FROM cpa01 WITH (NOLOCK)
      WHERE HABILITADO = 1
        AND (COD_PROVEE LIKE @term OR NOM_PROVEE LIKE @term)
      ORDER BY NOM_PROVEE
    `;
  }

  const result = await request.query<Proveedor>(query);
  return result.recordset;
}
