-- ============================================================
-- MIGRACIÓN: Terceros de proveedor + columnas asociadas
-- Base: lg_distribuciones | Servidor: Infosys01\axsqlserver
-- Ejecutar en SSMS sobre la base correcta (F5).
-- ============================================================

USE lg_distribuciones;
GO

-- NSFW_Destinos.acepta_terceros (solo aplica a tipo PROVEEDOR en la app)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Destinos') AND name = 'acepta_terceros')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos ADD acepta_terceros BIT NOT NULL DEFAULT 0;
    PRINT '✅ Columna NSFW_Destinos.acepta_terceros agregada.';
END
ELSE PRINT 'ℹ️  acepta_terceros ya existe.';
GO

-- NSFW_Transferencias.tercero_proveedor_id
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Transferencias') AND name = 'tercero_proveedor_id')
BEGIN
    ALTER TABLE dbo.NSFW_Transferencias ADD tercero_proveedor_id INT NULL;
    PRINT '✅ Columna NSFW_Transferencias.tercero_proveedor_id agregada.';
END
ELSE PRINT 'ℹ️  tercero_proveedor_id ya existe.';
GO

-- Tabla NSFW_Proveedores_Terceros
IF OBJECT_ID('dbo.NSFW_Proveedores_Terceros', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NSFW_Proveedores_Terceros (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        destino_id INT NOT NULL,
        nombre_tercero NVARCHAR(200) NOT NULL,
        cuit_tercero NVARCHAR(13) NULL,
        banco NVARCHAR(50) NULL,
        numero_cuenta NVARCHAR(50) NULL,
        cbu NVARCHAR(22) NULL,
        alias_cbu NVARCHAR(50) NULL,
        activo BIT NOT NULL DEFAULT 1,
        fecha_creacion DATETIME NOT NULL DEFAULT GETDATE(),
        usuario_creacion NVARCHAR(100) NULL,
        observaciones NVARCHAR(500) NULL,
        CONSTRAINT FK_ProveedoresTerceros_Destino
            FOREIGN KEY (destino_id) REFERENCES dbo.NSFW_Destinos (id)
    );
    CREATE INDEX IX_ProveedoresTerceros_destino_activo
        ON dbo.NSFW_Proveedores_Terceros (destino_id, activo);
    PRINT '✅ Tabla NSFW_Proveedores_Terceros creada.';
END
ELSE PRINT 'ℹ️  NSFW_Proveedores_Terceros ya existe.';
GO

-- FK transferencias → terceros (opcional; requiere que la tabla exista)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Transferencias_TerceroProveedor')
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.NSFW_Transferencias') AND name = 'tercero_proveedor_id')
   AND OBJECT_ID('dbo.NSFW_Proveedores_Terceros', 'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.NSFW_Transferencias ADD CONSTRAINT FK_Transferencias_TerceroProveedor
        FOREIGN KEY (tercero_proveedor_id) REFERENCES dbo.NSFW_Proveedores_Terceros (id);
    PRINT '✅ FK FK_Transferencias_TerceroProveedor agregada.';
END
ELSE PRINT 'ℹ️  FK tercero_proveedor omitida (ya existe o precondiciones no cumplidas).';
GO

PRINT '--- Migración proveedores/terceros finalizada ---';
GO
