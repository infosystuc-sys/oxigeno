import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();

  console.log('INSERT en sta06 (sin trigger)...');
  const t0 = Date.now();
  try {
    await pool.request()
      .input('art', sql.VarChar(15), 'TP0030')
      .input('ser', sql.VarChar(30), 'NOTRG-TEST-001')
      .input('dep', sql.VarChar(2),  '01')
      .query(`
        IF NOT EXISTS (SELECT 1 FROM sta06 WHERE COD_ARTICU=@art AND N_SERIE=@ser)
          INSERT INTO sta06 (COD_ARTICU, N_SERIE, COD_DEPOSI, DESC1, DESC2)
          VALUES (@art, @ser, @dep, '', '')
      `);
    console.log(`  ✔ OK en ${Date.now() - t0}ms`);
  } catch (e) {
    console.error(`  ✘ ERROR en ${Date.now() - t0}ms:`, (e as Error).message);
  }

  console.log('INSERT en sta07 (sin trigger)...');
  const t1 = Date.now();
  try {
    await pool.request()
      .input('tc',  sql.VarChar(2),  'RE')
      .input('nc',  sql.VarChar(8),  '99999990')
      .input('ren', sql.Int,         1)
      .input('art', sql.VarChar(15), 'TP0030')
      .input('ser', sql.VarChar(30), 'NOTRG-TEST-001')
      .input('dep', sql.VarChar(2),  '01')
      .query(`
        INSERT INTO sta07 (TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S, COD_ARTICU, N_SERIE, COD_DEPOSI)
        VALUES (@tc, @nc, @ren, @art, @ser, @dep)
      `);
    console.log(`  ✔ OK en ${Date.now() - t1}ms`);
  } catch (e) {
    console.error(`  ✘ ERROR en ${Date.now() - t1}ms:`, (e as Error).message);
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
