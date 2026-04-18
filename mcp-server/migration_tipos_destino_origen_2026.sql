-- Ejecutar en SQL Server tras backup.
-- Destinos: 5 tipos. Transferencias.TIPO_ORIGEN: 3 valores.

-- ========== NSFW_Destinos.tipo ==========
-- IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Destinos_Tipo')
--   ALTER TABLE dbo.NSFW_Destinos DROP CONSTRAINT CK_Destinos_Tipo;
-- Opcional: normalizar legado FINANCIERO -> FINANCIERA
-- UPDATE dbo.NSFW_Destinos SET tipo = 'FINANCIERA' WHERE tipo = 'FINANCIERO';
-- ALTER TABLE dbo.NSFW_Destinos ADD CONSTRAINT CK_Destinos_Tipo
--   CHECK (tipo IN (
--     'PROVEEDOR', 'PROVEEDOR_TERCEROS', 'FINANCIERA',
--     'CLIENTE_FINANCIERO', 'CTA_PROPIA'
--   ));

-- ========== NSFW_Transferencias.TIPO_ORIGEN ==========
-- Ajustar nombre del constraint según tu BD.
-- ALTER TABLE dbo.NSFW_Transferencias DROP CONSTRAINT <CK_Transferencias_TipoOrigen>;
-- ALTER TABLE dbo.NSFW_Transferencias ADD CONSTRAINT CK_Transferencias_TipoOrigen
--   CHECK (TIPO_ORIGEN IN ('CLIENTE', 'CLIENTE_FINANCIERO', 'FINANCIERA'));
