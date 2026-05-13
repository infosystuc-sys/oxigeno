/**
 * Test de conexión a SQL Server.
 * Ejecutar con:  npx ts-node-dev --transpile-only src/scripts/test-connection.ts
 *
 * Verifica:
 *   1. Conexión a la instancia nombrada
 *   2. Existencia de las 5 tablas clave de Tango
 *   3. Lectura de una muestra de proveedores y artículos
 */
import 'dotenv/config';
import { getPool, sql } from '../config/db';

const TABLAS_REQUERIDAS = ['cpa01', 'sta11', 'sta14', 'sta20', 'sta06', 'sta07'];

async function run() {
  console.log('──────────────────────────────────────────────');
  console.log('  TEST DE CONEXIÓN — Oxigeno Trazabilidad');
  console.log('──────────────────────────────────────────────');

  const rawServer = process.env.DB_SERVER ?? '';
  const host      = rawServer.split(/[\\\/]/)[0];
  const instance  = process.env.DB_INSTANCE ?? '(default)';
  const db        = process.env.DB_NAME ?? '';

  console.log(`  Servidor  : ${host}`);
  console.log(`  Instancia : ${instance}`);
  console.log(`  Base      : ${db}`);
  console.log('');

  let pool: Awaited<ReturnType<typeof getPool>>;

  const directPort = process.env.DB_DIRECT_PORT ?? '(no configurado)';
  console.log(`  Modo      : ${process.env.DB_DIRECT_PORT ? `B — puerto directo ${directPort}` : 'A — SQL Browser (UDP 1434)'}`);
  console.log('');

  try {
    pool = await getPool();
    console.log('✔  Conexión establecida correctamente.\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('✘  Error al conectar:', msg);

    if (msg.includes('Port for') && msg.includes('not found')) {
      console.error('\n  ► El servicio SQL Browser no respondió en INFOSYS01 (UDP 1434).');
      console.error('  ► Soluciones (elegí una):');
      console.error('');
      console.error('  OPCIÓN 1 — Activar SQL Browser en el servidor (recomendado):');
      console.error('    En INFOSYS01: Inicio → "Servicios" → "SQL Server Browser" → Iniciar');
      console.error('    Asegurate que el firewall permite UDP 1434.');
      console.error('');
      console.error('  OPCIÓN 2 — Conectar por puerto TCP directo (sin SQL Browser):');
      console.error('    1. En INFOSYS01 abrí: SQL Server Configuration Manager');
      console.error('       → Configuración de red de SQL Server');
      console.error('       → Protocolos para AXSQLEXPRESS');
      console.error('       → TCP/IP → Propiedades → Pestaña "Direcciones IP"');
      console.error('       → IPAll → "Puerto TCP" (ej. 49172)');
      console.error('    2. En apps/backend/.env descomentá y completá:');
      console.error('       DB_DIRECT_PORT=<el puerto encontrado>');
      console.error('    3. Asegurate que ese puerto TCP esté abierto en el firewall.');
    } else {
      console.error('\n  Causas frecuentes:');
      console.error('    • Credenciales incorrectas (DB_USER / DB_PASSWORD)');
      console.error('    • Base de datos inexistente (DB_NAME)');
      console.error('    • SQL Server no acepta autenticación SQL');
    }
    process.exit(1);
  }

  // ── 1. Verificar tablas ───────────────────────────────────────────────────
  console.log('Verificando tablas de Tango:');
  for (const tabla of TABLAS_REQUERIDAS) {
    const req = pool.request();
    req.input('tabla', sql.VarChar(128), tabla);

    const res = await req.query<{ n: number }>(`
      SELECT COUNT(1) AS n
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND LOWER(TABLE_NAME) = LOWER(@tabla)
    `);

    const existe = res.recordset[0].n > 0;
    console.log(`  ${existe ? '✔' : '✘'}  ${tabla}`);
  }

  // ── 2. Muestra de proveedores (cpa01) ─────────────────────────────────────
  console.log('\nMuestra cpa01 (5 primeros proveedores):');
  try {
    const res = await pool.request().query<{ cod_provee: string; raz_soc: string }>(`
      SELECT TOP 5
        RTRIM(COD_PROVEE) AS cod_provee,
        RTRIM(NOM_PROVEE) AS raz_soc
      FROM cpa01 WITH (NOLOCK)
      WHERE HABILITADO = 1
      ORDER BY NOM_PROVEE
    `);
    if (res.recordset.length === 0) {
      console.log('  (tabla vacía)');
    } else {
      res.recordset.forEach(r => console.log(`  [${r.cod_provee}] ${r.raz_soc}`));
    }
  } catch (e) {
    console.error('  ✘  No se pudo leer cpa01:', (e as Error).message);
  }

  // ── 3. Muestra de artículos (sta11) ──────────────────────────────────────
  console.log('\nMuestra sta11 (5 primeros artículos activos):');
  try {
    const res = await pool.request().query<{ cod_articu: string; descripcion: string }>(`
      SELECT TOP 5
        RTRIM(COD_ARTICU) AS cod_articu,
        RTRIM(DESCRIPCIO) AS descripcion
      FROM sta11 WITH (NOLOCK)
      WHERE USA_SERIE = 1
      ORDER BY DESCRIPCIO
    `);
    if (res.recordset.length === 0) {
      console.log('  (tabla vacía o todos inhabilitados)');
    } else {
      res.recordset.forEach(r => console.log(`  [${r.cod_articu}] ${r.descripcion}`));
    }
  } catch (e) {
    console.error('  ✘  No se pudo leer sta11:', (e as Error).message);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('  Test finalizado.');
  console.log('──────────────────────────────────────────────');
  process.exit(0);
}

run().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
