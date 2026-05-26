-- Deshabilita el bucket legacy `inventario` (no usar más en TallerCloud).
-- Objetivo: eliminar puertas traseras de lectura/escritura desde cliente.

-- 1) Asegurar bucket no público (si existe).
UPDATE storage.buckets
SET public = false
WHERE id = 'inventario';

-- 2) Eliminar policies conocidas creadas por migraciones anteriores.
DROP POLICY IF EXISTS "inventario_select_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_insert_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_update_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_delete_own_taller" ON storage.objects;

-- Nota:
-- No borramos el bucket ni objetos para evitar pérdida de datos.
-- El server role puede seguir accediendo si fuera necesario para migraciones internas.

