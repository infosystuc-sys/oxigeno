import 'dotenv/config';
import { getPool, sql } from '../config/db';

async function main() {
  const pool = await getPool();

  await pool.request()
    .input('t_comp',  sql.VarChar(3), 'REM')
    .input('proximo', sql.VarChar(8), '00000001')
    .query(`INSERT INTO RIV_PROXIMO (T_COMP, PROXIMO) VALUES (@t_comp, @proximo)`);

  console.log("Insertado: T_COMP='REM', PROXIMO='00000001'");

  const check = await pool.request().query(`SELECT * FROM RIV_PROXIMO`);
  console.log('Contenido actual:');
  console.table(check.recordset);

  await pool.close();
}

main().catch(err => { console.error(err); process.exit(1); });
