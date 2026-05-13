import 'dotenv/config';
import { getPool } from '../config/db';

async function run() {
  const pool = await getPool();

  for (const tabla of ['sta14', 'sta20', 'sta06', 'sta07']) {
    const res = await pool.request().query(`
      SELECT t.name AS trigger_name, t.is_disabled
      FROM sys.triggers t
      JOIN sys.tables tb ON t.parent_id = tb.object_id
      WHERE tb.name = '${tabla}'
    `);
    console.log(`\n=== Triggers en ${tabla} ===`);
    if (res.recordset.length === 0) {
      console.log('  (sin triggers)');
    } else {
      res.recordset.forEach(r => console.log(`  ${r.trigger_name} — disabled: ${r.is_disabled}`));
    }
  }

  // También verificar FK constraints en sta14
  console.log('\n=== FK constraints en sta14 ===');
  const fks = await pool.request().query(`
    SELECT
      fk.name AS fk_name,
      tp.name AS parent_table,
      tr.name AS ref_table,
      COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS parent_col,
      COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ref_col
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
    JOIN sys.tables tp ON fk.parent_object_id = tp.object_id
    JOIN sys.tables tr ON fk.referenced_object_id = tr.object_id
    WHERE tp.name = 'sta14'
  `);
  if (fks.recordset.length === 0) {
    console.log('  (sin FKs)');
  } else {
    fks.recordset.forEach(r => console.log(`  ${r.fk_name}: ${r.parent_table}.${r.parent_col} → ${r.ref_table}.${r.ref_col}`));
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
