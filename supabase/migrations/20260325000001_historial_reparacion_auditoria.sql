-- =============================================================================
-- Historial de cambios de estado + costo_total / restante en reparaciones
-- =============================================================================

-- Columnas financieras (anticipo ya existe en el esquema típico)
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS costo_total NUMERIC(12, 2);

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS restante NUMERIC(12, 2);

COMMENT ON COLUMN public.reparaciones.costo_total IS 'Total acordado/cobrable; si es NULL se toma precio_estimado en el trigger.';
COMMENT ON COLUMN public.reparaciones.restante IS 'costo_total - anticipo (calculado en trigger).';

UPDATE public.reparaciones
SET costo_total = COALESCE(costo_total, precio_estimado, 0)
WHERE costo_total IS NULL;

UPDATE public.reparaciones
SET restante = COALESCE(costo_total, 0) - COALESCE(anticipo, 0);

CREATE OR REPLACE FUNCTION public.reparaciones_sync_costos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- costo_total sigue al presupuesto (precio_estimado); restante = costo_total - anticipo
  NEW.costo_total := COALESCE(NEW.precio_estimado, NEW.costo_total, 0);
  NEW.restante := COALESCE(NEW.costo_total, 0) - COALESCE(NEW.anticipo, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_sync_costos ON public.reparaciones;
CREATE TRIGGER trg_reparaciones_sync_costos
  BEFORE INSERT OR UPDATE OF precio_estimado, costo_total, anticipo
  ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_sync_costos();

-- Tabla de auditoría por cambio de estado
CREATE TABLE IF NOT EXISTS public.historial_reparacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacion_id uuid NOT NULL REFERENCES public.reparaciones(id) ON DELETE CASCADE,
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.taller_users(id) ON DELETE SET NULL,
  estado_anterior text,
  estado_nuevo text,
  nota_tecnica text,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_reparacion_rep ON public.historial_reparacion(reparacion_id);
CREATE INDEX IF NOT EXISTS idx_historial_reparacion_taller_fecha ON public.historial_reparacion(taller_id, fecha DESC);

ALTER TABLE public.historial_reparacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_reparacion_select" ON public.historial_reparacion;
DROP POLICY IF EXISTS "historial_reparacion_insert" ON public.historial_reparacion;

CREATE POLICY "historial_reparacion_select" ON public.historial_reparacion FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "historial_reparacion_insert" ON public.historial_reparacion FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);
