-- ============================================================
-- Script de creación: NSFW_Transferencias
-- Base de datos: lg_distribuciones
-- Servidor: Infosys01\axsqlserver
-- Propósito: Tabla de pruebas para la app de Validación de Pagos
-- ============================================================

USE lg_distribuciones;
GO

-- ─── Tabla NSFW_Transferencias ────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NSFW_Transferencias' AND xtype='U')
BEGIN
  CREATE TABLE dbo.NSFW_Transferencias (
    id                   INT           IDENTITY(1,1) PRIMARY KEY,
    CodigoTransferencia  NVARCHAR(100) NOT NULL,
    PersonaAsignada      NVARCHAR(100) NULL,
    Cliente              NVARCHAR(200) NULL,
    Destino              NVARCHAR(200) NULL,
    Usuario              NVARCHAR(100) NULL,
    TipoTransaccion      NVARCHAR(100) NOT NULL DEFAULT 'Transferencia',
    Monto                DECIMAL(18,2) NOT NULL,
    Estado               NVARCHAR(50)  NOT NULL DEFAULT 'Pendiente',
    FECHA                DATE          NOT NULL,
    FechaComprobante     DATE          NULL,
    FechaEnvio           DATE          NULL,
    FechaRegistro        DATETIME      NOT NULL DEFAULT GETDATE(),

    CONSTRAINT UQ_NSFW_CodigoTransferencia UNIQUE (CodigoTransferencia)
  );
  PRINT '✅ Tabla NSFW_Transferencias creada correctamente.';
END
ELSE
  PRINT 'ℹ️  Tabla NSFW_Transferencias ya existe.';
GO

-- Índice para búsquedas por CodigoTransferencia
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_NSFW_Codigo')
BEGIN
  CREATE NONCLUSTERED INDEX IX_NSFW_Codigo
    ON dbo.NSFW_Transferencias (CodigoTransferencia);
  PRINT '✅ Índice IX_NSFW_Codigo creado.';
END
GO

-- ─── Datos de Prueba (5 registros mock) ──────────────────────────────────────
IF NOT EXISTS (SELECT TOP 1 * FROM dbo.NSFW_Transferencias)
BEGIN
  INSERT INTO dbo.NSFW_Transferencias
    (CodigoTransferencia, PersonaAsignada, Cliente, Destino, Usuario, TipoTransaccion, Monto, Estado, FECHA, FechaComprobante, FechaEnvio)
  VALUES
    ('000011111111', 'Juan Pérez',    'Empresa Alpha S.A.',    'Cta. Cte. BBVA 0045-7',    'admin',      'Transferencia', 15400.50, 'Pendiente', CAST(GETDATE() AS DATE), DATEADD(DAY,-1,CAST(GETDATE() AS DATE)), DATEADD(DAY,-1,CAST(GETDATE() AS DATE))),
    ('000022222222', 'María López',   'Constructora SUR',      'Cta. Cte. Galicia 1234-5', 'operador01', 'Transferencia',  8500.00, 'Utilizada', CAST(GETDATE() AS DATE), DATEADD(DAY,-2,CAST(GETDATE() AS DATE)), DATEADD(DAY,-2,CAST(GETDATE() AS DATE))),
    ('000033333333', 'Carlos Ruiz',   'Logística Total',       'Cta. Cte. Santander 9988', 'operador02', 'Transferencia', 12000.75, 'Pendiente', CAST(GETDATE() AS DATE), DATEADD(DAY,-1,CAST(GETDATE() AS DATE)), DATEADD(DAY,-1,CAST(GETDATE() AS DATE))),
    ('000044444444', 'Ana Martínez',  'Servicios Gamma S.R.L.','Cta. Cte. HSBC 5566-3',    'admin',      'Transferencia',   450.00, 'Utilizada', CAST(GETDATE() AS DATE), DATEADD(DAY,-3,CAST(GETDATE() AS DATE)), DATEADD(DAY,-3,CAST(GETDATE() AS DATE))),
    ('000055555555', 'Luis González', 'Consultora XYZ',        'Cta. Cte. ICBC 7712-1',    'operador01', 'Transferencia', 32000.00, 'Pendiente', CAST(GETDATE() AS DATE), DATEADD(DAY,-1,CAST(GETDATE() AS DATE)), DATEADD(DAY,-1,CAST(GETDATE() AS DATE)));

  PRINT '✅ 5 registros de prueba insertados en NSFW_Transferencias.';
END
ELSE
  PRINT 'ℹ️  NSFW_Transferencias ya tiene datos, no se insertaron duplicados.';
GO

-- ─── Catálogo NSFW_Destinos (columna [destinos] VARCHAR(20), no Descripcion) ──
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NSFW_Destinos' AND xtype='U')
BEGIN
  CREATE TABLE dbo.NSFW_Destinos (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    [destinos] VARCHAR(20) NOT NULL
  );
  PRINT '✅ Tabla NSFW_Destinos creada.';
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='personasasignadas' AND xtype='U')
BEGIN
  CREATE TABLE dbo.personasasignadas (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    descripcion  VARCHAR(20) NOT NULL
  );
  PRINT '✅ Tabla personasasignadas creada.';
END
GO

-- ─── Vista rápida de verificación ────────────────────────────────────────────
SELECT * FROM dbo.NSFW_Transferencias ORDER BY id;
GO
