/**
 * Detecta las sesiones de nuestra app que puedan haber quedado huérfanas
 * (INSERTs que timearon del lado del cliente pero siguen corriendo en SQL Server),
 * las muestra y opcionalmente las mata.
 */
import 'dotenv/config';
import { getPool, sql } from '../config/db';

const KILL = process.argv.includes('--kill');

async function run() {
  const pool = await getPool();
  const mySpid = (await pool.request().query<{ spid: number }>('SELECT @@SPID AS spid')).recordset[0].spid;

  console.log(`Mi SPID actual: ${mySpid}`);

  // Buscar sesiones que hagan cosas en nuestra DB (con user = DB_USER)
  const sessions = await pool.request()
    .input('usr', sql.VarChar(128), process.env.DB_USER!)
    .input('db',  sql.VarChar(128), process.env.DB_NAME!)
    .query<{ session_id: number; status: string; command: string; wait_type: string; blocking_session_id: number; sql_text: string }>(`
      SELECT
        r.session_id,
        r.status,
        r.command,
        ISNULL(r.wait_type, '') AS wait_type,
        r.blocking_session_id,
        SUBSTRING(t.text, 1, 300) AS sql_text
      FROM sys.dm_exec_sessions s
      LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
      OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE s.login_name = @usr
        AND s.database_id = DB_ID(@db)
        AND s.session_id <> @@SPID
    `);

  if (sessions.recordset.length === 0) {
    console.log('No hay otras sesiones activas de nuestra app en la base.');
  } else {
    console.log('\nSesiones activas:');
    sessions.recordset.forEach(s => console.log(JSON.stringify(s)));

    if (KILL) {
      for (const s of sessions.recordset) {
        if (s.session_id && s.session_id !== mySpid) {
          try {
            await pool.request().query(`KILL ${s.session_id}`);
            console.log(`✔ Sesión ${s.session_id} eliminada.`);
          } catch (e) {
            console.error(`  Error matando ${s.session_id}:`, (e as Error).message);
          }
        }
      }
    } else {
      console.log('\nPasá --kill para terminarlas.');
    }
  }

  // Intentar INSERT rápido después
  if (KILL || sessions.recordset.length === 0) {
    console.log('\n=== Prueba de INSERT tras limpieza ===');
    try {
      await pool.request()
        .input('tc',   sql.VarChar(2),  'RE')
        .input('tcx',  sql.VarChar(3),  'REM')
        .input('nc',   sql.VarChar(8),  '99999997')
        .input('fec',  sql.Date,        new Date())
        .input('prov', sql.VarChar(6),  '00257')
        .input('rem',  sql.VarChar(14), 'ORPHANTEST')
        .input('est',  sql.VarChar(1),  'P')
        .input('dep',  sql.VarChar(2),  '01')
        .query(`
          INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                              COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
          VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
        `);
      console.log('  ✔ INSERT exitoso');
    } catch (e) {
      console.error('  ✘ ERROR:', (e as Error).message);
    }
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
