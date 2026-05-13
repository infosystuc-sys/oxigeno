/**
 * Test de escritura step-by-step para diagnosticar qué query bloquea.
 * Ejecuta cada operación por separado y reporta el resultado.
 */
import 'dotenv/config';
import { getPool, sql } from '../config/db';

const TCOMP   = process.env.TANGO_TCOMP_INGRESO ?? 'RE';
const COD_DEP = process.env.TANGO_COD_DEPOSITO  ?? '01';

async function run() {
  const pool = await getPool();

  // ── 1. MAX sin transacción ─────────────────────────────────────────────────
  console.log('1. SELECT MAX(NCOMP_IN_S) sin transacción...');
  const r1 = await pool.request()
    .input('tc', sql.VarChar(2), TCOMP)
    .query<{ nro: number }>(`
      SELECT ISNULL(MAX(CAST(NCOMP_IN_S AS INT)), 0) + 1 AS nro
      FROM sta14 WITH (NOLOCK)
      WHERE TCOMP_IN_S = @tc
    `);
  const nroCompNum = r1.recordset[0].nro;
  const nroComp    = String(nroCompNum).padStart(8, '0');
  console.log('   OK → próximo NCOMP_IN_S =', nroComp);

  // ── 2. INSERT en sta14 (SIN transacción) ──────────────────────────────────
  console.log('2. INSERT en sta14 sin transacción...');
  try {
    await pool.request()
      .input('tc',   sql.VarChar(2),  TCOMP)
      .input('tcx',  sql.VarChar(3),  'REM')
      .input('nc',   sql.VarChar(8),  nroComp)
      .input('fec',  sql.Date,        new Date('2026-04-23'))
      .input('prov', sql.VarChar(6),  '00257')
      .input('rem',  sql.VarChar(14), 'R-DIAGTEST')
      .input('est',  sql.VarChar(1),  'P')
      .input('dep',  sql.VarChar(2),  COD_DEP)
      .query(`
        INSERT INTO sta14 (TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
                            COD_PRO_CL, N_REMITO, ESTADO_MOV, COD_DEPOSI, NRO_SUCURS)
        VALUES (@tc, @tcx, @nc, @fec, @prov, @rem, @est, @dep, 0)
      `);
    console.log('   OK → sta14 insertado');
  } catch (e) {
    console.error('   ERROR en sta14:', (e as Error).message);
    process.exit(1);
  }

  // ── 3. INSERT en sta20 ────────────────────────────────────────────────────
  console.log('3. INSERT en sta20...');
  try {
    await pool.request()
      .input('tc',   sql.VarChar(2),     TCOMP)
      .input('nc',   sql.VarChar(8),     nroComp)
      .input('ren',  sql.Int,            1)
      .input('art',  sql.VarChar(15),    'TP0030')
      .input('can',  sql.Decimal(18, 4), 2)
      .input('dep',  sql.VarChar(2),     COD_DEP)
      .query(`
        INSERT INTO sta20 (TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S,
                            COD_ARTICU, CANTIDAD, COD_DEPOSI, TIPO_MOV)
        VALUES (@tc, @nc, @ren, @art, @can, @dep, 'E')
      `);
    console.log('   OK → sta20 insertado');
  } catch (e) {
    console.error('   ERROR en sta20:', (e as Error).message);
    process.exit(1);
  }

  // ── 4. INSERT en sta06 ────────────────────────────────────────────────────
  console.log('4. INSERT en sta06 (serie 1)...');
  try {
    const chk = await pool.request()
      .input('art', sql.VarChar(15), 'TP0030')
      .input('ser', sql.VarChar(30), 'DIAGTEST-001')
      .query<{ n: number }>(`SELECT COUNT(1) AS n FROM sta06 WHERE COD_ARTICU=@art AND N_SERIE=@ser`);

    if (chk.recordset[0].n === 0) {
      await pool.request()
        .input('art', sql.VarChar(15), 'TP0030')
        .input('ser', sql.VarChar(30), 'DIAGTEST-001')
        .input('dep', sql.VarChar(2),  COD_DEP)
        .query(`INSERT INTO sta06 (COD_ARTICU, N_SERIE, COD_DEPOSI, DESC1, DESC2)
                VALUES (@art, @ser, @dep, '', '')`);
      console.log('   OK → sta06 insertado');
    } else {
      console.log('   OK → serie ya existe, UPDATE COD_DEPOSI');
      await pool.request()
        .input('art', sql.VarChar(15), 'TP0030')
        .input('ser', sql.VarChar(30), 'DIAGTEST-001')
        .input('dep', sql.VarChar(2),  COD_DEP)
        .query(`UPDATE sta06 SET COD_DEPOSI=@dep WHERE COD_ARTICU=@art AND N_SERIE=@ser`);
    }
  } catch (e) {
    console.error('   ERROR en sta06:', (e as Error).message);
    process.exit(1);
  }

  // ── 5. INSERT en sta07 ────────────────────────────────────────────────────
  console.log('5. INSERT en sta07...');
  try {
    await pool.request()
      .input('tc',  sql.VarChar(2),  TCOMP)
      .input('nc',  sql.VarChar(8),  nroComp)
      .input('ren', sql.Int,         1)
      .input('art', sql.VarChar(15), 'TP0030')
      .input('ser', sql.VarChar(30), 'DIAGTEST-001')
      .input('dep', sql.VarChar(2),  COD_DEP)
      .query(`
        INSERT INTO sta07 (TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S,
                            COD_ARTICU, N_SERIE, COD_DEPOSI)
        VALUES (@tc, @nc, @ren, @art, @ser, @dep)
      `);
    console.log('   OK → sta07 insertado');
  } catch (e) {
    console.error('   ERROR en sta07:', (e as Error).message);
    process.exit(1);
  }

  console.log('\n✔ Todas las escrituras OK. Comprobante de diagnóstico:', nroComp);
  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
