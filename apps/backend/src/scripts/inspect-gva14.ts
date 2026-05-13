import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();

  // Cantidad de filas en gva14
  const cnt = await pool.request().query<{ n: number }>('SELECT COUNT(1) AS n FROM gva14 WITH (NOLOCK)');
  console.log(`gva14 filas totales: ${cnt.recordset[0].n}`);

  // Índices en gva14
  const idx = await pool.request().query<{
    index_name: string; column_name: string; is_unique: boolean; index_type: string;
  }>(`
    SELECT
      i.name      AS index_name,
      c.name      AS column_name,
      i.is_unique,
      i.type_desc AS index_type
    FROM sys.indexes i
    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID('gva14')
    ORDER BY i.name, ic.key_ordinal
  `);
  console.log('\nÍndices en gva14:');
  idx.recordset.forEach(r =>
    console.log(`  ${r.index_name.padEnd(40)} ${r.column_name.padEnd(20)} unique:${r.is_unique}`)
  );

  // Simular la query del trigger sin NOLOCK (exactamente como lo haría el trigger)
  console.log('\nSimulando JOIN del trigger (sin NOLOCK, timeout 10s)...');
  const start = Date.now();
  try {
    const req = pool.request();
    req.timeout = 10000;
    const res = await req
      .input('prov', sql.VarChar(6), '00257')
      .query<{ ID_GVA14: number }>(`
        SELECT GVA14.ID_GVA14
        FROM (SELECT @prov AS COD_PRO_CL, 'RE' AS TCOMP_IN_S) AS FAKE
        JOIN GVA14 ON (FAKE.COD_PRO_CL = GVA14.COD_CLIENT)
        WHERE FAKE.TCOMP_IN_S IN ('RE', 'FR', 'CC', 'DC', 'DR', 'FC')
      `);
    console.log(`  OK en ${Date.now() - start}ms →`, res.recordset[0] ?? '(sin resultado)');
  } catch (e) {
    console.error(`  TIMEOUT en ${Date.now() - start}ms:`, (e as Error).message);
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
