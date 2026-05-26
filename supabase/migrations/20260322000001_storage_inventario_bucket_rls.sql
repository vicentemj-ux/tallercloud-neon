-- Bucket privado para fotos de productos (inventario).
-- El cliente sube con JWT tenant (claim taller_id); path = {taller_id}/{archivo}.jpg
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventario',
  'inventario',
  false,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS: cada taller solo accede a objetos bajo su prefijo (primera carpeta = taller_id).
-- Requiere JWT con claim taller_id (createTenantClient en lib/supabase/tenant-client.ts).

DROP POLICY IF EXISTS "inventario_select_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_insert_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_update_own_taller" ON storage.objects;
DROP POLICY IF EXISTS "inventario_delete_own_taller" ON storage.objects;

CREATE POLICY "inventario_select_own_taller"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inventario'
    AND split_part(name, '/', 1) = (auth.jwt() ->> 'taller_id')
  );

CREATE POLICY "inventario_insert_own_taller"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inventario'
    AND split_part(name, '/', 1) = (auth.jwt() ->> 'taller_id')
  );

CREATE POLICY "inventario_update_own_taller"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'inventario'
    AND split_part(name, '/', 1) = (auth.jwt() ->> 'taller_id')
  )
  WITH CHECK (
    bucket_id = 'inventario'
    AND split_part(name, '/', 1) = (auth.jwt() ->> 'taller_id')
  );

CREATE POLICY "inventario_delete_own_taller"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inventario'
    AND split_part(name, '/', 1) = (auth.jwt() ->> 'taller_id')
  );
