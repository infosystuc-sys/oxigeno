import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();

  // Qué procesos tienen locks en nuestras tablas
  console.log('=== Locks activos en tablas sta14/sta20/sta06/sta07 ===');
  const locks = await pool.request().query(`
    SELECT
      r.session_id,
      r.blocking_session_id,
      r.status,
      r.command,
      r.wait_type,
      r.wait_time,
      r.last_wait_type,
      DB_NAME(r.database_id) AS db_name,
      SUBSTRING(t.text, 1, 200) AS sql_text
    FROM sys.dm_exec_requests r
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
    WHERE r.session_id <> @@SPID
  `);

  if (locks.recordset.length === 0) {
    console.log('  (sin requests activos)');
  } else {
    locks.recordset.forEach(r => console.log(JSON.stringify(r)));
  }

  // Locks específicos sobre las tablas de stock
  console.log('\n=== Object locks sobre tablas de stock ===');
  const objlocks = await pool.request().query(`
    SELECT
      l.request_session_id AS session_id,
      l.resource_type,
      l.request_mode,
      l.request_status,
      OBJECT_NAME(p.object_id) AS table_name
    FROM sys.dm_tran_locks l
    LEFT JOIN sys.partitions p
      ON l.resource_associated_entity_id = p.hobt_id
    WHERE l.resource_type IN ('OBJECT','PAGE','RID','KEY')
      AND OBJECT_NAME(p.object_id) IN ('sta14','sta20','sta06','sta07')
  `);

  if (objlocks.recordset.length === 0) {
    console.log('  (sin locks en esas tablas ahora mismo)');
  } else {
    objlocks.recordset.forEach(r => console.log(JSON.stringify(r)));
  }

  // Intentar SET LOCK_TIMEOUT 0 para ver el error inmediato
  console.log('\n=== Intento de INSERT con LOCK_TIMEOUT 0 ms ===');
  try {
    await pool.request().query(`SET LOCK_TIMEOUT 0`);
    await pool.request()
      .input('tc',   sql.VarChar(2),  'RE')
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  '99999999')
      .input('fec',  sql.Date,        new Date())
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'LOCKTEST')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  '01')
      .query(`
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
      `);
    console.log('  OK — INSERT exitoso con LOCK_TIMEOUT 0');
  } catch (e) {
    console.error('  ERROR:', (e as Error).message);
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
