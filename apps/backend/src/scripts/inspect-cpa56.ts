import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function run() {
  const pool = await getPool();

  console.log('=== CPA56 columns ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CPA56'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== Row WHERE DESTINO = CPAREMI ===');
  const row = await pool.request()
    .input('dest', sql.VarChar(20), 'CPAREMI')
    .query(`SELECT * FROM CPA56 WITH (NOLOCK) WHERE DESTINO = @dest`);
  row.recordset.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== All DESTINO values (TOP 20) ===');
  const all = await pool.request().query(`SELECT TOP 20 DESTINO, PROXIMO, TIPO_COMP FROM CPA56 WITH (NOLOCK) ORDER BY DESTINO`);
  all.recordset.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
