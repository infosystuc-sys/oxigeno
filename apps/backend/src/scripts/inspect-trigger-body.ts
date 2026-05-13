import 'dotenv/config';
import { getPool } from '../config/db';

async function run() {
  const pool = await getPool();

  for (const trigger of ['TR_CLOUD_STA14', 'TR_CLOUD_STA20']) {
    const res = await pool.request().query(`
      SELECT OBJECT_DEFINITION(OBJECT_ID('${trigger}')) AS body
    `);
    console.log(`\n===== ${trigger} =====`);
    console.log(res.recordset[0]?.body ?? '(sin definición)');
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
