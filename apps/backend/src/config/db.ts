import sql from 'mssql';

const config: sql.config = {
  server:   process.env.DB_SERVER!,
  port:     parseInt(process.env.DB_PORT ?? '1433'),
  database: process.env.DB_NAME!,
  user:     process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 15000,
  // El servidor tiene I/O lento (PAGEIOLATCH_SH). El trigger de sta14 lee
  // muchas páginas de disco; el INSERT puede tomar 60-120s en condiciones normales.
  requestTimeout: 180000, // 3 minutos
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool(config).connect();
  }
  return pool;
}

export { sql };
