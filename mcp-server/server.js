/**
 * server.js
 * MCP Server — Integración SQL Server para "Validación de Pagos"
 * Motor: Microsoft SQL Server | Librería: mssql (node-mssql)
 *
 * Expone 3 Tools al agente de IA:
 *   - checkDuplicateTransfer
 *   - insertNewTransfer
 *   - searchClient
 *
 * Uso: node server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

// ─── CONFIGURACIÓN DE CONEXIÓN ────────────────────────────────────────────────
// Server=Infosys01\axsqlserver;Database=lg_distribuciones
const sqlConfig = {
  server: 'Infosys01',
  database: process.env.DB_DATABASE || 'lg_distribuciones',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    instanceName: 'axsqlserver',    // Para instancias nombradas en MSSQL
    encrypt: false,                  // true en Azure, false en redes locales
    trustServerCertificate: true,    // Evitar errores de certificado en LAN
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
  },
};

// ─── POOL DE CONEXIÓN COMPARTIDO ──────────────────────────────────────────────
let pool = null;

const getPool = async () => {
  if (!pool) {
    try {
      pool = await sql.connect(sqlConfig);
      console.error('[MCP Server] ✅ Conexión a SQL Server establecida.');
    } catch (err) {
      console.error('[MCP Server] ❌ Error al conectar a SQL Server:', err.message);
      throw err;
    }
  }
  return pool;
};

// ─── INICIALIZACIÓN DEL SERVIDOR MCP ─────────────────────────────────────────
const server = new McpServer({
  name: 'lg-distribuciones-sql',
  version: '1.0.0',
  description: 'MCP Server para la app de Validación de Pagos — lg_distribuciones (Infosys01\\axsqlserver)',
});

// ════════════════════════════════════════════════════════════════════════════
// TOOL 1: checkDuplicateTransfer
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'checkDuplicateTransfer',
  {
    description:
      'Verifica si un CodigoTransferencia ya existe en la tabla de comprobantes registrados. ' +
      'Devuelve { isDuplicate: boolean, existingRecord?: object }.',
    inputSchema: z.object({
      codigoTransferencia: z.string().min(1, 'CodigoTransferencia requerido'),
    }),
  },
  async ({ codigoTransferencia }) => {
    try {
      const db = await getPool();
      const result = await db
        .request()
        .input('codigo', sql.NVarChar(100), codigoTransferencia)
        .query(`
          SELECT TOP 1
            id,
            CodigoTransferencia,
            Cliente,
            Monto,
            Estado,
            FechaComprobante
          FROM dbo.NSFW_Transferencias
          WHERE CodigoTransferencia = @codigo
        `);

      const isDuplicate = result.recordset.length > 0;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              isDuplicate,
              existingRecord: isDuplicate ? result.recordset[0] : null,
              checkedCode: codigoTransferencia,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message, isDuplicate: false }) }],
        isError: true,
      };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// TOOL 2: insertNewTransfer
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'insertNewTransfer',
  {
    description:
      'Inserta un nuevo comprobante validado en la base de datos. ' +
      'Recibe los 12 campos del formulario y devuelve el ID insertado.',
    inputSchema: z.object({
      CodigoTransferencia: z.string(),
      PersonaAsignada:     z.string().nullable().optional(),
      Cliente:             z.string().nullable().optional(),
      Destino:             z.string().nullable().optional(),
      Usuario:             z.string().nullable().optional(),
      TipoTransaccion:     z.string().default('Transferencia'),
      Monto:               z.number().positive(),
      Estado:              z.enum(['Pendiente', 'Utilizada', 'Sospechosa', 'Rechazada']),
      FECHA:               z.string(),   // DD/MM/AAAA
      FechaComprobante:    z.string().nullable().optional(),
      FechaEnvio:          z.string().nullable().optional(),
    }),
  },
  async (fields) => {
    try {
      const db = await getPool();

      // Convertir fechas DD/MM/AAAA a Date para MSSQL
      const toSqlDate = (str) => {
        if (!str) return null;
        const [d, m, y] = str.split('/');
        return new Date(`${y}-${m}-${d}`);
      };

      const result = await db
        .request()
        .input('CodigoTransferencia', sql.NVarChar(100), fields.CodigoTransferencia)
        .input('PersonaAsignada',     sql.NVarChar(100), fields.PersonaAsignada   ?? null)
        .input('Cliente',             sql.NVarChar(200), fields.Cliente            ?? null)
        .input('Destino',             sql.NVarChar(200), fields.Destino            ?? null)
        .input('Usuario',             sql.NVarChar(100), fields.Usuario            ?? null)
        .input('TipoTransaccion',     sql.NVarChar(100), fields.TipoTransaccion)
        .input('Monto',               sql.Decimal(18, 2), fields.Monto)
        .input('Estado',              sql.NVarChar(50),  fields.Estado)
        .input('FECHA',               sql.Date,          toSqlDate(fields.FECHA))
        .input('FechaComprobante',    sql.Date,          toSqlDate(fields.FechaComprobante))
        .input('FechaEnvio',          sql.Date,          toSqlDate(fields.FechaEnvio))
        .query(`
          INSERT INTO dbo.NSFW_Transferencias (
            CodigoTransferencia, PersonaAsignada, Cliente, Destino,
            Usuario, TipoTransaccion, Monto, Estado,
            FECHA, FechaComprobante, FechaEnvio, FechaRegistro
          )
          OUTPUT INSERTED.id
          VALUES (
            @CodigoTransferencia, @PersonaAsignada, @Cliente, @Destino,
            @Usuario, @TipoTransaccion, @Monto, @Estado,
            @FECHA, @FechaComprobante, @FechaEnvio, GETDATE()
          )
        `);

      const insertedId = result.recordset[0]?.id;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              insertedId,
              message: `Comprobante ${fields.CodigoTransferencia} insertado correctamente con ID ${insertedId}.`,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }],
        isError: true,
      };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// TOOL 3: searchClient
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'searchClient',
  {
    description:
      'Busca clientes en la tabla de clientes por nombre parcial o ID exacto. ' +
      'Ideal para autocompletar el campo "Cliente" en el formulario.',
    inputSchema: z.object({
      query:     z.string().min(1, 'Se requiere al menos 1 carácter').describe('Texto de búsqueda (nombre parcial o ID)'),
      limit:     z.number().int().min(1).max(50).default(10).describe('Máximo de resultados a devolver'),
    }),
  },
  async ({ query, limit }) => {
    try {
      const db = await getPool();
      const result = await db
        .request()
        .input('query', sql.NVarChar(200), `%${query}%`)
        .input('limit', sql.Int, limit)
        .query(`
          SELECT TOP (@limit)
            id          AS ClienteID,
            NombreCliente,
            CUIT,
            Email,
            Telefono
          FROM dbo.Clientes
          WHERE NombreCliente LIKE @query
             OR CAST(id AS NVARCHAR) = @query
          ORDER BY NombreCliente ASC
        `);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              total: result.recordset.length,
              results: result.recordset,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message, results: [] }) }],
        isError: true,
      };
    }
  }
);

// ─── INICIO DEL SERVIDOR ──────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[MCP Server] 🚀 lg-distribuciones-sql escuchando en stdio.');
