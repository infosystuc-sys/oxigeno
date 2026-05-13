import { getPool } from '../config/db';
import type { Articulo } from '@oxigeno/shared-types';

/**
 * Devuelve los artículos que usan número de serie (cilindros de gas) desde sta11.
 * Columnas reales inspeccionadas: COD_ARTICU (varchar 15), DESCRIPCIO (varchar 50).
 * Se filtra USA_SERIE = 1 para obtener solo artículos con trazabilidad de series.
 */
export async function obtenerGases(): Promise<Articulo[]> {
  const pool = await getPool();

  const result = await pool.request().query<Articulo>(`
    SELECT
      RTRIM(COD_ARTICU) AS cod_articu,
      RTRIM(DESCRIPCIO) AS descrip
    FROM sta11 WITH (NOLOCK)
    WHERE USA_SERIE = 1
    ORDER BY DESCRIPCIO
  `);

  return result.recordset;
}
