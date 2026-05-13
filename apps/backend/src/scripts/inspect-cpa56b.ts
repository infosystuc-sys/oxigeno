import 'dotenv/config';
import { getPool } from '../config/db';

async function run() {
  const pool = await getPool();

  console.log('=== All CPA56 rows ===');
  const r = await pool.request().query(`
    SELECT
      ID_CPA56, FILLER, DESCRIPCIO, DESTINO,
      TIPO_COMP, PROXIMO, NRO_DESDE, NRO_HASTA,
      SUCURSAL, TALONARIO
    FROM CPA56 WITH (NOLOCK)
    ORDER BY ID_CPA56
  `);
  r.recordset.forEach(x => console.log(JSON.stringify(x)));

  console.log(`\nTotal rows: ${r.recordset.length}`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
