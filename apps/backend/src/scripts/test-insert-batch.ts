/**
 * SET LOCK_TIMEOUT e INSERT en el mismo batch SQL → misma conexión garantizada.
 * Si falla en < 3s con error de lock timeout, confirma que sta14 está locked.
 */
import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();
  const start = Date.now();

  try {
    await pool.request()
      .input('tc',   sql.VarChar(2),  'RE')
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  '99999995')
      .input('fec',  sql.Date,        new Date())
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'BATCHTEST')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  '01')
      .query(`
        SET LOCK_TIMEOUT 3000;
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0);
      `);
    console.log(`✔ INSERT OK en ${Date.now() - start}ms`);
  } catch (e) {
    const msg = (e as Error).message;
    const ms  = Date.now() - start;
    console.error(`✘ ERROR en ${ms}ms: ${msg}`);

    if (ms < 5000) {
      console.log('  → Falló rápido: es un lock wait (alguien tiene sta14 bloqueada)');
    } else {
      console.log('  → Tardó mucho: probablemente la transacción interna del trigger está bloqueada');
    }

    // ¿Quién está bloqueando ahora?
    const block = await pool.request().query(`
      SELECT
        r.session_id,
        r.blocking_session_id,
        r.status,
        r.command,
        r.wait_type,
        r.wait_time,
        SUBSTRING(t.text, 1, 200) AS sql_text
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.blocking_session_id > 0
    `);

    if (block.recordset.length > 0) {
      console.log('\nSesiones bloqueadas:');
      block.recordset.forEach(r => console.log(JSON.stringify(r)));
    } else {
      console.log('  (sin sesiones bloqueadas visibles ahora)');
    }
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
