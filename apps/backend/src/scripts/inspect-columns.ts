import 'dotenv/config';
import { getPool } from '../config/db';

async function inspect() {
  const pool = await getPool();

  for (const tabla of ['sta14', 'sta20', 'sta06', 'sta07']) {
    const res = await pool.request().query<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      CHARACTER_MAXIMUM_LENGTH: number | null;
    }>(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tabla}'
      ORDER BY ORDINAL_POSITION
    `);

    console.log(`\n=== ${tabla} (${res.recordset.length} columnas) ===`);
    res.recordset.forEach(c =>
      console.log(`  ${c.COLUMN_NAME.padEnd(30)} ${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}`)
    );
  }

  process.exit(0);
}

inspect().catch(e => { console.error(e.message); process.exit(1); });
