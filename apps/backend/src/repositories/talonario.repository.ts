/**
 * talonario.repository.ts
 *
 * Lectura del talonario de Remito Ingreso desde CPA56.
 * Usada por el endpoint GET /api/talonario/recepcion para mostrar
 * un preview del próximo número antes de guardar.
 *
 * Nota: usa NOLOCK → es informativa, no garantiza exclusividad.
 * La reserva real del número ocurre dentro de la transacción de guardarRecepcion().
 */
import { getPool, sql } from '../config/db';
import type { TalonarioResponse } from '@oxigeno/shared-types';

export async function obtenerProximoRecepcion(): Promise<TalonarioResponse> {
  const pool = await getPool();

  const res = await pool
    .request()
    .input('tc_tipo', sql.VarChar(1), 'R')
    .query<{ PROXIMO: string; TIPO_COMP: string }>(`
      SELECT PROXIMO, TIPO_COMP
      FROM CPA56 WITH (NOLOCK)
      WHERE TIPO_COMP = @tc_tipo
    `);

  if (res.recordset.length === 0) {
    throw new Error("Talonario de Remito Ingreso no encontrado en CPA56");
  }

  const row = res.recordset[0];
  return {
    proximo:   row.PROXIMO,
    tipo_comp: row.TIPO_COMP,
  };
}
