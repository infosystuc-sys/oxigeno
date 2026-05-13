/**
 * INSERT en sta14 con timeout extendido (90s) para superar la latencia del trigger.
 * Confirma si el problema es simplemente latencia alta de escritura.
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
  requestTimeout:   90000,  // 90s para darle tiempo al trigger
  connectionTimeout: 15000,
};

async function run() {
  const pool = await new sql.ConnectionPool(config).connect();
  console.log('Conexión OK. Probando INSERT en sta14 (timeout 90s)...');

  const start = Date.now();
  try {
    await pool.request()
      .input('tc',   sql.VarChar(2),  'RE')
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  '99999985')
      .input('fec',  sql.Date,        new Date())
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'LONGTEST01')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  '01')
      .query(`
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
      `);
    console.log(`✔ INSERT OK en ${Date.now() - start}ms`);
  } catch (e) {
    console.error(`✘ ERROR en ${Date.now() - start}ms:`, (e as Error).message);
  } finally {
    await pool.close();
    process.exit(0);
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
