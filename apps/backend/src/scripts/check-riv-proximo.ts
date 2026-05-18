import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function main() {
  const pool = await getPool();

  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'RIV_PROXIMO'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('Columnas de RIV_PROXIMO:');
  console.table(cols.recordset);

  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
