-- =============================================================================
-- Folios numéricos puros: solo el número entero como texto (sin prefijo)
-- Reemplaza el formato {prefijo}-{número} → ahora solo "{número}" (ej. "1", "2", "3")
-- prefijo_folio se conserva en la tabla pero ya no se usa en la asignación
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reescribir la función del trigger: folio = número entero como texto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reparaciones_assign_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next   INTEGER;
BEGIN
  -- Si el folio ya viene asignado, no tocar nada
  IF NEW.folio IS NOT NULL AND btrim(NEW.folio) <> '' THEN
    RETURN NEW;
  END IF;

  -- Asegurar que existe fila de configuración para este taller (guard de concurrencia)
  INSERT INTO configuracion_taller (taller_id, nombre_taller, prefijo_folio, siguiente_folio)
  VALUES (NEW.taller_id, 'Mi Taller', 'REP', 1)
  ON CONFLICT (taller_id) DO NOTHING;

  -- Leer y bloquear el contador actual
  SELECT ct.siguiente_folio
    INTO v_next
    FROM configuracion_taller ct
   WHERE ct.taller_id = NEW.taller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró configuracion_taller para taller_id %', NEW.taller_id;
  END IF;

  v_next := COALESCE(v_next, 1);

  -- Asignar folio como entero puro en texto (sin prefijo, sin guion)
  NEW.folio := v_next::text;

  -- Incrementar el contador para la siguiente reparación
  UPDATE configuracion_taller
     SET siguiente_folio = v_next + 1
   WHERE taller_id = NEW.taller_id;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Resetear siguiente_folio = 1 en talleres sin reparaciones
-- Solo aplica si la tabla reparaciones está vacía (post-truncate).
-- Idempotente: si ya existen reparaciones para un taller, su contador no se toca.
-- -----------------------------------------------------------------------------
UPDATE configuracion_taller ct
   SET siguiente_folio = 1
 WHERE NOT EXISTS (
   SELECT 1 FROM reparaciones r
    WHERE r.taller_id = ct.taller_id
 );

-- -----------------------------------------------------------------------------
-- 3. Recrear el trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reparaciones_assign_folio ON public.reparaciones;

CREATE TRIGGER trg_reparaciones_assign_folio
  BEFORE INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_assign_folio();
