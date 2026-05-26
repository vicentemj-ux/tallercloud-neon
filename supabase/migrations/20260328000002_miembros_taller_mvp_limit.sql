-- Límite MVP: máximo 5 miembros activos por taller (además de validación en app)

CREATE OR REPLACE FUNCTION public.enforce_miembros_taller_mvp_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activo THEN
      SELECT COUNT(*)::int INTO cnt
      FROM public.miembros_taller
      WHERE taller_id = NEW.taller_id AND activo = true;
      IF cnt >= 5 THEN
        RAISE EXCEPTION 'MVP_LIMIT_MIEMBROS'
          USING HINT = 'Has alcanzado el límite de 5 usuarios para la fase MVP. Contacta a soporte para más detalles.';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.activo AND (NOT OLD.activo) THEN
      SELECT COUNT(*)::int INTO cnt
      FROM public.miembros_taller
      WHERE taller_id = NEW.taller_id AND activo = true AND id <> NEW.id;
      IF cnt >= 5 THEN
        RAISE EXCEPTION 'MVP_LIMIT_MIEMBROS'
          USING HINT = 'Has alcanzado el límite de 5 usuarios para la fase MVP. Contacta a soporte para más detalles.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_miembros_taller_mvp_limit ON public.miembros_taller;
CREATE TRIGGER trg_miembros_taller_mvp_limit
  BEFORE INSERT OR UPDATE ON public.miembros_taller
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_miembros_taller_mvp_limit();

COMMENT ON FUNCTION public.enforce_miembros_taller_mvp_limit() IS
  'MVP: máximo 5 filas activas en miembros_taller por taller_id.';
