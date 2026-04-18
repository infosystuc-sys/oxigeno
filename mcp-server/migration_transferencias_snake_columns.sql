-- Ejecutar en SQL Server si INSERT/UPDATE fallan por columnas inexistentes.
-- Ajustar tipos si tu esquema usa VARCHAR en lugar de NVARCHAR.

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cuit_origen') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cuit_origen NVARCHAR(13) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cta_origen') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cta_origen NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cbu_origen') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cbu_origen NVARCHAR(22) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cuit_destino') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cuit_destino NVARCHAR(13) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cta_destino') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cta_destino NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'cbu_destino') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD cbu_destino NVARCHAR(22) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'operacion') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD operacion NVARCHAR(30) NULL;

IF COL_LENGTH('dbo.NSFW_Transferencias', 'Id_transferencia') IS NULL
  ALTER TABLE dbo.NSFW_Transferencias ADD Id_transferencia NVARCHAR(30) NULL;
