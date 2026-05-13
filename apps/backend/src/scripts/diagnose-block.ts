/**
 * Lanza el INSERT y, 3 segundos después, toma una foto de sys.dm_exec_requests
 * para ver qué está bloqueando nuestra sesión.
 */
import 'dotenv/config';
import sql from 'mssql';

const config: sql.config = {
  server:   process.env.DB_SERVER!,
  port:     parseInt(process.env.DB_PORT ?? '1433'),
  database: process.env.DB_NAME!,
  user:     process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options:  { trustServerCertificate: true, encrypt: false },
  pool: { max: 5, min: 0 },
  requestTimeout:    60000,
  connectionTimeout: 15000,
};

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  // Dos pools independientes: uno para el INSERT, otro para el diagnóstico
  const poolInsert = await new sql.ConnectionPool(config).connect();
  const poolDiag   = await new sql.ConnectionPool(config).connect();

  // Obtener el SPID del pool de diagnóstico
  const mySpid = (await poolDiag.request().query<{ s: number }>('SELECT @@SPID AS s')).recordset[0].s;

  // Lanzar INSERT sin await (en background)
  const insertPromise = poolInsert.request()
    .input('tc',   sql.VarChar(2),  'RE')
    .input('tcx',  sql.VarChar(3),  'REM')
    .input('nc',   sql.VarChar(8),  '99999980')
    .input('fec',  sql.Date,        new Date())
    .input('prov', sql.VarChar(6),  '00257')
    .input('rem',  sql.VarChar(14), 'DIAGBLOCK1')
    .input('est',  sql.VarChar(1),  'P')
    .input('dep',  sql.VarChar(2),  '01')
    .query(`
      INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                          COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
      VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
    `);

  // Esperar 3 segundos para que el INSERT quede colgado
  await sleep(3000);

  // Foto de blocking MIENTRAS el INSERT está colgado
  console.log('\n=== sys.dm_exec_requests (3s después del INSERT) ===');
  const reqs = await poolDiag.request().query(`
    SELECT
      r.session_id,
      r.blocking_session_id,
      r.status,
      r.command,
      r.wait_type,
      r.wait_time,
      r.last_wait_type,
      r.lock_timeout,
      SUBSTRING(t.text, 1, 300) AS sql_text
    FROM sys.dm_exec_requests r
    OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
    WHERE r.session_id <> ${mySpid}
    ORDER BY r.session_id
  `);
  reqs.recordset.forEach(r => console.log(JSON.stringify(r)));

  // Foto de locks activos
  console.log('\n=== sys.dm_tran_locks (recursos relevantes) ===');
  const locks = await poolDiag.request().query(`
    SELECT
      l.request_session_id,
      l.resource_type,
      l.request_mode,
      l.request_status,
      l.request_owner_type,
      OBJECT_NAME(p.object_id) AS obj_name
    FROM sys.dm_tran_locks l
    LEFT JOIN sys.partitions p ON l.resource_associated_entity_id = p.hobt_id
    WHERE l.resource_type IN ('OBJECT','PAGE','RID','KEY','METADATA')
      AND (
        OBJECT_NAME(p.object_id) IN ('sta14','sta20','sta06','sta07','sta13','gva14')
        OR l.request_status = 'WAIT'
      )
    ORDER BY l.request_session_id
  `);
  if (locks.recordset.length === 0) {
    console.log('  (sin locks relevantes)');
  } else {
    locks.recordset.forEach(r => console.log(JSON.stringify(r)));
  }

  // Esperar resultado del INSERT
  console.log('\nEsperando resultado del INSERT...');
  const start = Date.now();
  try {
    await insertPromise;
    console.log(`✔ INSERT OK en ${Date.now() - start}ms`);
  } catch (e) {
    console.error(`✘ ERROR en ${Date.now() - start}ms:`, (e as Error).message);
  } finally {
    await poolInsert.close();
    await poolDiag.close();
    process.exit(0);
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
