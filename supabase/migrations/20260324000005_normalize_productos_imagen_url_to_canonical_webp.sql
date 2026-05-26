-- Normaliza productos.imagen_url al formato canónico:
--   {taller_id}/{producto_id}.webp
--
-- Esto elimina referencias legacy (URLs completas, .jpg/.png, paths viejos) para que
-- el frontend siempre apunte a product-photos con el esquema actual.
--
-- Nota: Esta migración NO mueve archivos en Storage. Solo estandariza el valor en BD.

UPDATE public.productos
SET imagen_url = (taller_id::text || '/' || id::text || '.webp')
WHERE imagen_url IS NOT NULL
  AND btrim(imagen_url) <> ''
  AND btrim(imagen_url) !~* '\\.webp(\\?.*)?$';

