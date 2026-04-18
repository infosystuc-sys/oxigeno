-- ============================================================
-- MIGRACIÓN: Módulo NSFW_Destinos
-- Base de datos: lg_distribuciones
-- Servidor: Infosys01\axsqlserver
-- 
-- INSTRUCCIONES:
--   1. Abrir en SQL Server Management Studio
--   2. Seleccionar base de datos: lg_distribuciones
--   3. Ejecutar TODO el script (F5)
--   4. Verificar que todos los PRINT muestren ✅
-- ============================================================

USE lg_distribuciones;
GO

-- ─── PASO 1: Agregar columnas faltantes a NSFW_Destinos ─────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'tipo')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD tipo NVARCHAR(20) NOT NULL DEFAULT 'PROVEEDOR';
    PRINT '✅ Columna tipo agregada.';
END ELSE PRINT 'ℹ️  tipo ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'razon_social')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD razon_social NVARCHAR(200) NULL;
    PRINT '✅ Columna razon_social agregada.';
END ELSE PRINT 'ℹ️  razon_social ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'cuit')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD cuit NVARCHAR(13) NULL;
    PRINT '✅ Columna cuit agregada.';
END ELSE PRINT 'ℹ️  cuit ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'codigo_proveedor_tango')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD codigo_proveedor_tango NVARCHAR(50) NULL;
    PRINT '✅ Columna codigo_proveedor_tango agregada.';
END ELSE PRINT 'ℹ️  codigo_proveedor_tango ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'banco')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD banco NVARCHAR(100) NULL;
    PRINT '✅ Columna banco agregada.';
END ELSE PRINT 'ℹ️  banco ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'tipo_cuenta')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD tipo_cuenta NVARCHAR(20) NULL;
    PRINT '✅ Columna tipo_cuenta agregada.';
END ELSE PRINT 'ℹ️  tipo_cuenta ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'numero_cuenta')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD numero_cuenta NVARCHAR(50) NULL;
    PRINT '✅ Columna numero_cuenta agregada.';
END ELSE PRINT 'ℹ️  numero_cuenta ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'cbu')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD cbu NVARCHAR(22) NULL;
    PRINT '✅ Columna cbu agregada.';
END ELSE PRINT 'ℹ️  cbu ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'alias_cbu')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD alias_cbu NVARCHAR(50) NULL;
    PRINT '✅ Columna alias_cbu agregada.';
END ELSE PRINT 'ℹ️  alias_cbu ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'activo')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD activo BIT NOT NULL DEFAULT 1;
    PRINT '✅ Columna activo agregada.';
END ELSE PRINT 'ℹ️  activo ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'observaciones')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD observaciones NVARCHAR(500) NULL;
    PRINT '✅ Columna observaciones agregada.';
END ELSE PRINT 'ℹ️  observaciones ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'fecha_creacion')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD fecha_creacion DATETIME NOT NULL DEFAULT GETDATE();
    PRINT '✅ Columna fecha_creacion agregada.';
END ELSE PRINT 'ℹ️  fecha_creacion ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'fecha_modificacion')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD fecha_modificacion DATETIME NULL;
    PRINT '✅ Columna fecha_modificacion agregada.';
END ELSE PRINT 'ℹ️  fecha_modificacion ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'usuario_creacion')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD usuario_creacion NVARCHAR(100) NULL DEFAULT 'Sistema';
    PRINT '✅ Columna usuario_creacion agregada.';
END ELSE PRINT 'ℹ️  usuario_creacion ya existe.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'usuario_modificacion')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD usuario_modificacion NVARCHAR(100) NULL;
    PRINT '✅ Columna usuario_modificacion agregada.';
END ELSE PRINT 'ℹ️  usuario_modificacion ya existe.';
GO

-- ─── PASO 2: Crear tabla NSFW_Destinos_CuentasTerceros ───────────────────────

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NSFW_Destinos_CuentasTerceros' AND xtype='U')
BEGIN
    CREATE TABLE dbo.NSFW_Destinos_CuentasTerceros (
        id              INT           IDENTITY(1,1) PRIMARY KEY,
        destino_id      INT           NOT NULL,
        titular         NVARCHAR(200) NOT NULL,
        cuit_titular    NVARCHAR(13)  NULL,
        banco           NVARCHAR(100) NOT NULL,
        tipo_cuenta     NVARCHAR(20)  NULL,
        numero_cuenta   NVARCHAR(50)  NULL,
        cbu             NVARCHAR(22)  NULL,      -- opcional
        alias_cbu       NVARCHAR(50)  NULL,
        activo          BIT           NOT NULL DEFAULT 1,
        fecha_creacion  DATETIME      NOT NULL DEFAULT GETDATE(),
        usuario_creacion NVARCHAR(100) NULL,
        observaciones   NVARCHAR(500) NULL,

        CONSTRAINT FK_CuentasTerceros_Destino
            FOREIGN KEY (destino_id) REFERENCES dbo.NSFW_Destinos(id)
    );
    PRINT '✅ Tabla NSFW_Destinos_CuentasTerceros creada.';
END
ELSE
    PRINT 'ℹ️  NSFW_Destinos_CuentasTerceros ya existe.';
GO

-- ─── PASO 3: Agregar columnas FK en NSFW_Transferencias (si no existen) ──────

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Transferencias') AND name = 'destino_id')
BEGIN
    ALTER TABLE dbo.NSFW_Transferencias ADD destino_id INT NULL;
    PRINT '✅ Columna destino_id en NSFW_Transferencias agregada.';
END ELSE PRINT 'ℹ️  destino_id ya existe en NSFW_Transferencias.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Transferencias') AND name = 'destino_tipo')
BEGIN
    ALTER TABLE dbo.NSFW_Transferencias ADD destino_tipo NVARCHAR(20) NULL;
    PRINT '✅ Columna destino_tipo en NSFW_Transferencias agregada.';
END ELSE PRINT 'ℹ️  destino_tipo ya existe en NSFW_Transferencias.';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Transferencias') AND name = 'cuenta_tercera_id')
BEGIN
    ALTER TABLE dbo.NSFW_Transferencias ADD cuenta_tercera_id INT NULL;
    PRINT '✅ Columna cuenta_tercera_id en NSFW_Transferencias agregada.';
END ELSE PRINT 'ℹ️  cuenta_tercera_id ya existe en NSFW_Transferencias.';
GO

-- ─── PASO 4: Agregar tabla NSFW_PersonasAsignadas si no existe ────────────────
-- (el api usa NSFW_PersonasAsignadas, el schema original creó personasasignadas en minúsculas)

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NSFW_PersonasAsignadas' AND xtype='U')
BEGIN
    -- Si existe la vieja en minúsculas, renombrarla
    IF EXISTS (SELECT * FROM sysobjects WHERE name='personasasignadas' AND xtype='U')
    BEGIN
        EXEC sp_rename 'dbo.personasasignadas', 'NSFW_PersonasAsignadas';
        PRINT '✅ Tabla personasasignadas renombrada a NSFW_PersonasAsignadas.';
    END
    ELSE
    BEGIN
        CREATE TABLE dbo.NSFW_PersonasAsignadas (
            id          INT           IDENTITY(1,1) PRIMARY KEY,
            descripcion VARCHAR(20)   NOT NULL
        );
        PRINT '✅ Tabla NSFW_PersonasAsignadas creada.';
    END
END
ELSE
    PRINT 'ℹ️  NSFW_PersonasAsignadas ya existe.';
GO

-- ─── VERIFICACIÓN FINAL ───────────────────────────────────────────────────────

SELECT
    c.name AS columna,
    t.name AS tipo_dato,
    c.max_length,
    c.is_nullable,
    c.is_identity
FROM sys.columns c
JOIN sys.types t ON c.system_type_id = t.system_type_id AND t.name <> 'sysname'
WHERE c.object_id = OBJECT_ID('dbo.NSFW_Destinos')
ORDER BY c.column_id;

SELECT
    c.name AS columna,
    t.name AS tipo_dato,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.system_type_id = t.system_type_id AND t.name <> 'sysname'
WHERE c.object_id = OBJECT_ID('dbo.NSFW_Destinos_CuentasTerceros')
ORDER BY c.column_id;

PRINT '✅ Migración completada. Reiniciar el servidor API (node api.js).';
GO
