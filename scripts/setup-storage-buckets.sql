-- =============================================================
-- Arquitectura de Storage Buckets — TallerCloud
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Buckets:
--   repair-photos  → PRIVADO  → signed URLs (service_role)
--   inventario     → PRIVADO  → signed URLs (service_role)
--   catalogo       → PÚBLICO  → getPublicUrl() directo
--   taller         → PÚBLICO  → getPublicUrl() directo (logos)
-- =============================================================

-- ─── 1. Crear buckets (idempotente) ──────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('repair-photos', 'repair-photos', false, 5242880,  -- 5MB, PRIVADO
   ARRAY['image/jpeg','image/png','image/webp']),
  ('inventario',    'inventario',    false, 5242880,  -- 5MB, PRIVADO
   ARRAY['image/jpeg','image/png','image/webp']),
  ('catalogo',      'catalogo',      true,  5242880,  -- 5MB, PÚBLICO
   ARRAY['image/jpeg','image/png','image/webp']),
  ('taller',        'taller',        true,  2097152,  -- 2MB, PÚBLICO (logos)
   ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. Limpiar políticas antiguas ──────────────────────────
DROP POLICY IF EXISTS "repair_photos_select"  ON storage.objects;
DROP POLICY IF EXISTS "repair_photos_insert"  ON storage.objects;
DROP POLICY IF EXISTS "repair_photos_delete"  ON storage.objects;
DROP POLICY IF EXISTS "inventario_select"     ON storage.objects;
DROP POLICY IF EXISTS "inventario_insert"     ON storage.objects;
DROP POLICY IF EXISTS "inventario_delete"     ON storage.objects;
DROP POLICY IF EXISTS "catalogo_select"       ON storage.objects;
DROP POLICY IF EXISTS "catalogo_insert"       ON storage.objects;
DROP POLICY IF EXISTS "taller_select"         ON storage.objects;
DROP POLICY IF EXISTS "taller_insert"         ON storage.objects;
DROP POLICY IF EXISTS "taller_update"         ON storage.objects;

-- ─── 3. repair-photos — PRIVADO ──────────────────────────────
-- Subida: solo autenticados (service_role desde server actions)
-- Lectura: solo service_role (las signed URLs se generan server-side)
-- No se permite lectura directa por roles anon/authenticated

CREATE POLICY "repair_photos_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'repair-photos');

CREATE POLICY "repair_photos_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'repair-photos');

CREATE POLICY "repair_photos_delete" ON storage.objects
  FOR DELETE TO authenticated, service_role
  USING (bucket_id = 'repair-photos');

-- ─── 4. inventario — PRIVADO ─────────────────────────────────
CREATE POLICY "inventario_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'inventario');

CREATE POLICY "inventario_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'inventario');

CREATE POLICY "inventario_delete" ON storage.objects
  FOR DELETE TO authenticated, service_role
  USING (bucket_id = 'inventario');

-- ─── 5. catalogo — PÚBLICO ───────────────────────────────────
CREATE POLICY "catalogo_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'catalogo');

CREATE POLICY "catalogo_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'catalogo');

-- ─── 6. taller — PÚBLICO (logos) ─────────────────────────────
CREATE POLICY "taller_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'taller');

CREATE POLICY "taller_insert" ON storage.objects
  FOR INSERT TO authenticated, service_role
  WITH CHECK (bucket_id = 'taller');

CREATE POLICY "taller_update" ON storage.objects
  FOR UPDATE TO authenticated, service_role
  USING (bucket_id = 'taller');

-- ─── NOTA sobre el bucket "repair-photos" actual ─────────────
-- Si ya existe con nombre "repair-photos" y tiene objetos subidos,
-- el INSERT ON CONFLICT lo actualiza a public=false (privado).
-- Las URLs públicas ya guardadas en la tabla reparaciones.fotos
-- seguirán funcionando hasta que el bucket pase a privado.
-- Después de ejecutar este script, todas las nuevas subidas y el
-- tracking usarán signed URLs generadas por service_role.
