-- =============================================================================
-- Folios seguros: prefijo + contador en configuracion_taller, trigger en INSERT
-- =============================================================================

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS prefijo_folio VARCHAR(64) NOT NULL DEFAULT 'REP';

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS siguiente_folio INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN configuracion_taller.prefijo_folio IS 'Prefijo del folio (ej. CDS, REP). Se concatena con guion y número.';
COMMENT ON COLUMN configuracion_taller.siguiente_folio IS 'Siguiente número a asignar (bloqueado con FOR UPDATE en el trigger).';

-- -----------------------------------------------------------------------------
-- BEFORE INSERT: si folio es NULL o vacío, asignar desde configuracion_taller
-- Formato: {prefijo}-{número}  ej. CDS-15000
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reparaciones_assign_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref   TEXT;
  v_next   INTEGER;
  v_folio  TEXT;
BEGIN
  IF NEW.folio IS NOT NULL AND btrim(NEW.folio) <> '' THEN
    RETURN NEW;
  END IF;

  -- Asegurar fila de configuración (concurrencia: otro insert pudo crearla)
  INSERT INTO configuracion_taller (taller_id, nombre_taller, prefijo_folio, siguiente_folio)
  VALUES (NEW.taller_id, 'Mi Taller', 'REP', 1)
  ON CONFLICT (taller_id) DO NOTHING;

  SELECT ct.prefijo_folio, ct.siguiente_folio
    INTO v_pref, v_next
    FROM configuracion_taller ct
   WHERE ct.taller_id = NEW.taller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró configuracion_taller para taller_id %', NEW.taller_id;
  END IF;

  v_pref := COALESCE(NULLIF(btrim(v_pref), ''), 'REP');
  v_next := COALESCE(v_next, 1);

  v_folio := v_pref || '-' || v_next::text;
  NEW.folio := v_folio;

  UPDATE configuracion_taller
     SET siguiente_folio = v_next + 1
   WHERE taller_id = NEW.taller_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_assign_folio ON public.reparaciones;

CREATE TRIGGER trg_reparaciones_assign_folio
  BEFORE INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_assign_folio();
