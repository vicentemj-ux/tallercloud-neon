-- =============================================================================
-- Registro basal en historial_reparacion al crear una reparación (punto de partida del folio)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    fecha
  ) VALUES (
    NEW.id,
    NEW.taller_id,
    NEW.taller_id,
    NULL,
    COALESCE(NULLIF(trim(NEW.estatus::text), ''), 'Recibido'),
    'Ingreso del equipo al sistema',
    COALESCE(NEW.created_at, NOW())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_historial_basal ON public.reparaciones;
CREATE TRIGGER trg_reparaciones_historial_basal
  AFTER INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_historial_basal_insert();

COMMENT ON FUNCTION public.reparaciones_historial_basal_insert() IS
  'Inserta el primer evento de auditoría (Recibido + ingreso al sistema) por cada folio nuevo.';

-- Backfill: folios que aún no tienen este evento basal
INSERT INTO public.historial_reparacion (
  reparacion_id,
  taller_id,
  usuario_id,
  estado_anterior,
  estado_nuevo,
  nota_tecnica,
  fecha
)
SELECT
  r.id,
  r.taller_id,
  r.taller_id,
  NULL,
  COALESCE(NULLIF(trim(r.estatus::text), ''), 'Recibido'),
  'Ingreso del equipo al sistema',
  r.created_at
FROM public.reparaciones r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.historial_reparacion h
  WHERE h.reparacion_id = r.id
    AND h.nota_tecnica = 'Ingreso del equipo al sistema'
);
