import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();

  // ── ¿Existen sta13 y gva14? ───────────────────────────────────────────────
  for (const t of ['sta13', 'gva14']) {
    const r = await pool.request().query<{ n: number }>(`
      SELECT COUNT(1) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${t}'
    `);
    console.log(`Tabla ${t} existe: ${r.recordset[0].n > 0}`);
  }

  // ── ¿Qué valor de T_COMP necesita el trigger para sta13? ─────────────────
  console.log('\n=== sta13 — primeras 10 filas ===');
  const s13 = await pool.request().query(`
    SELECT TOP 10 * FROM sta13 WITH (NOLOCK)
  `);
  s13.recordset.forEach(r => console.log(JSON.stringify(r)));

  // ── ¿Aparece '00257' en gva14? ────────────────────────────────────────────
  console.log('\n=== gva14 — buscar COD_CLIENT = 00257 ===');
  const gv = await pool.request()
    .input('cod', sql.VarChar(6), '00257')
    .query(`SELECT TOP 1 * FROM gva14 WITH (NOLOCK) WHERE COD_CLIENT = @cod`);
  console.log(gv.recordset.length > 0 ? JSON.stringify(gv.recordset[0]) : '(no encontrado)');

  // ── Locks activos sobre sta13 y gva14 ─────────────────────────────────────
  console.log('\n=== Locks en sta13 / gva14 ===');
  const lk = await pool.request().query(`
    SELECT l.request_session_id, l.resource_type, l.request_mode, l.request_status,
           OBJECT_NAME(p.object_id) AS table_name
    FROM sys.dm_tran_locks l
    LEFT JOIN sys.partitions p ON l.resource_associated_entity_id = p.hobt_id
    WHERE l.resource_type IN ('OBJECT','PAGE','RID','KEY')
      AND OBJECT_NAME(p.object_id) IN ('sta13','gva14')
  `);
  if (lk.recordset.length === 0) {
    console.log('  (sin locks ahora mismo)');
  } else {
    lk.recordset.forEach(r => console.log(JSON.stringify(r)));
  }

  // ── INSERT con SET LOCK_TIMEOUT en la MISMA conexión ─────────────────────
  console.log('\n=== INSERT con LOCK_TIMEOUT en misma conexión ===');
  const conn = await pool.connect();
  try {
    await conn.request().query('SET LOCK_TIMEOUT 500'); // falla en 500ms si hay lock
    await conn.request()
      .input('tc',   sql.VarChar(2),  'RE')
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  '99999998')
      .input('fec',  sql.Date,        new Date())
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'LOCKTST2')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  '01')
      .query(`
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
      `);
    console.log('  OK — INSERT exitoso');
  } catch (e) {
    console.error('  ERROR:', (e as Error).message);
  } finally {
    conn.release();
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
