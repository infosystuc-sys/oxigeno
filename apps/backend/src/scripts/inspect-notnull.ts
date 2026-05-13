import 'dotenv/config';
import { getPool } from '../config/db';

async function inspect() {
  const pool = await getPool();

  for (const tabla of ['sta14', 'sta20', 'sta06', 'sta07']) {
    const res = await pool.request().query<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      CHARACTER_MAXIMUM_LENGTH: number | null;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>(`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tabla}'
      ORDER BY ORDINAL_POSITION
    `);

    const required = res.recordset.filter(
      c => c.IS_NULLABLE === 'NO' && c.COLUMN_DEFAULT === null
    );

    console.log(`\n=== ${tabla} — columnas NOT NULL sin default (obligatorias en INSERT) ===`);
    if (required.length === 0) {
      console.log('  (ninguna — todas tienen default o admiten NULL)');
    } else {
      required.forEach(c =>
        console.log(`  ${c.COLUMN_NAME.padEnd(35)} ${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}`)
      );
    }
  }

  process.exit(0);
}

inspect().catch(e => { console.error(e.message); process.exit(1); });
