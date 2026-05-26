-- Estandarización definitiva de Storage para inventario:
-- Bucket: product-photos
-- Reglas:
-- - SELECT: Público (lectura pública)
-- - INSERT/UPDATE/DELETE: None para clientes (solo server role / backend seguro)

-- Asegurar que el bucket exista y sea público.
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  ARRAY['image/webp', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Políticas: permitir lectura pública del bucket.
DROP POLICY IF EXISTS "product_photos_public_select" ON storage.objects;
CREATE POLICY "product_photos_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-photos');

-- No crear políticas de INSERT/UPDATE/DELETE para este bucket.
-- Con RLS activo en storage.objects, la ausencia de políticas bloquea esas acciones
-- para anon/authenticated. El service role (backend) sigue pudiendo escribir.

