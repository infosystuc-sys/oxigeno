import 'dotenv/config';
import { getPool } from '../config/db';

async function inspect() {
  const pool = await getPool();

  // Muestra últimas 3 filas de sta14 para ver formato real de campos
  console.log('\n=== sta14 — últimas 3 filas ===');
  const s14 = await pool.request().query(`
    SELECT TOP 3
      TCOMP_IN_S, T_COMP, NCOMP_IN_S, FECHA_MOV,
      COD_PRO_CL, N_REMITO, ESTADO_MOV, TALONARIO, NRO_SUCURS
    FROM sta14 WITH (NOLOCK)
    ORDER BY ID_STA14 DESC
  `);
  s14.recordset.forEach(r => console.log(JSON.stringify(r)));

  // Muestra cómo se ven las series en sta06 y sta07
  console.log('\n=== sta06 — últimas 3 filas ===');
  const s06 = await pool.request().query(`
    SELECT TOP 3 COD_ARTICU, N_SERIE, COD_DEPOSI, DESC1, DESC2
    FROM sta06 WITH (NOLOCK)
    ORDER BY ID_STA06 DESC
  `);
  s06.recordset.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== sta07 — últimas 3 filas ===');
  const s07 = await pool.request().query(`
    SELECT TOP 3 TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S, COD_ARTICU, N_SERIE, COD_DEPOSI
    FROM sta07 WITH (NOLOCK)
    ORDER BY ID_STA07 DESC
  `);
  s07.recordset.forEach(r => console.log(JSON.stringify(r)));

  console.log('\n=== sta20 — últimas 3 filas ===');
  const s20 = await pool.request().query(`
    SELECT TOP 3 TCOMP_IN_S, NCOMP_IN_S, N_RENGL_S, COD_ARTICU, CANTIDAD, COD_DEPOSI, TIPO_MOV
    FROM sta20 WITH (NOLOCK)
    ORDER BY ID_STA20 DESC
  `);
  s20.recordset.forEach(r => console.log(JSON.stringify(r)));

  process.exit(0);
}

inspect().catch(e => { console.error(e.message); process.exit(1); });
