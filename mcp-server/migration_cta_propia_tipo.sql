-- Ejecutar en SQL Server ANTES de usar el tipo CTA_PROPIA en la app.
-- Ajustá el nombre del backup si ya existe.

IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'NSFW_Destinos_BACKUP_CTAPROPIA')
BEGIN
    SELECT * INTO dbo.NSFW_Destinos_BACKUP_CTAPROPIA FROM dbo.NSFW_Destinos;
    PRINT 'Backup creado: NSFW_Destinos_BACKUP_CTAPROPIA';
END
GO

IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_Destinos_Tipo')
BEGIN
    ALTER TABLE dbo.NSFW_Destinos DROP CONSTRAINT CK_Destinos_Tipo;
    PRINT 'Constraint CK_Destinos_Tipo eliminado';
END
GO

ALTER TABLE dbo.NSFW_Destinos
ADD CONSTRAINT CK_Destinos_Tipo
CHECK (tipo IN ('PROVEEDOR', 'FINANCIERO', 'CTA_PROPIA'));
GO

PRINT 'CK_Destinos_Tipo: PROVEEDOR, FINANCIERO, CTA_PROPIA';

SELECT tipo, COUNT(*) AS Cantidad
FROM dbo.NSFW_Destinos
GROUP BY tipo;
GO
