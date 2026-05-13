/**
 * INSERT de sta14 con conexión dedicada (no pool) y LOCK_TIMEOUT corto.
 * Permite aislar si el problema es la mezcla de sesiones en el pool.
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
  pool:     { max: 1, min: 1 },   // conexión única
  requestTimeout: 8000,
  connectionTimeout: 10000,
};

async function run() {
  const pool = await new sql.ConnectionPool(config).connect();

  // Poner LOCK_TIMEOUT en el pool de 1 conexión → siempre la misma sesión
  await pool.request().query('SET LOCK_TIMEOUT 3000');
  console.log('LOCK_TIMEOUT seteado a 3000ms en esta sesión');

  // Diagnóstico: ¿gva14 es accesible? ¿Qué tamaño tiene?
  try {
    const cnt = await pool.request().query<{ n: number }>('SELECT COUNT(1) AS n FROM gva14 WITH (NOLOCK)');
    console.log(`gva14 rows: ${cnt.recordset[0].n}`);

    // ¿Existe '00257' como COD_CLIENT en gva14?
    const chk = await pool.request()
      .input('cod', sql.VarChar(6), '00257')
      .query<{ n: number }>('SELECT COUNT(1) AS n FROM gva14 WITH (NOLOCK) WHERE COD_CLIENT = @cod');
    console.log(`COD_CLIENT '00257' en gva14: ${chk.recordset[0].n}`);

    // Buscar el primer cliente existente en gva14
    const first = await pool.request()
      .query<{ COD_CLIENT: string }>('SELECT TOP 1 COD_CLIENT FROM gva14 WITH (NOLOCK) ORDER BY COD_CLIENT');
    console.log(`Primer COD_CLIENT en gva14: ${first.recordset[0]?.COD_CLIENT}`);
  } catch (e) {
    console.error('Error leyendo gva14:', (e as Error).message);
  }

  // INSERT usando un proveedor que SÍ exista en gva14 (si encontramos uno)
  // y usando la misma sesión que tiene el LOCK_TIMEOUT seteado
  console.log('\n--- INSERT sta14 (conexión dedicada, lock_timeout 3s) ---');
  try {
    await pool.request()
      .input('tc',   sql.VarChar(2),  'RE')
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  '99999996')
      .input('fec',  sql.Date,        new Date())
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'DEDTEST001')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  '01')
      .query(`
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
      `);
    console.log('✔ INSERT exitoso');
  } catch (e) {
    console.error('✘ ERROR:', (e as Error).message);
  }

  await pool.close();
  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
