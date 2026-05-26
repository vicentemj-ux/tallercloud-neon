-- =============================================================================
-- 1) Basal de creación: lo inserta la app (createRepair), no el trigger.
-- 2) Backfill de textos viejos en nota_tecnica del primer evento por folio.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_reparaciones_historial_basal ON public.reparaciones;
DROP FUNCTION IF EXISTS public.reparaciones_historial_basal_insert();

COMMENT ON TABLE public.reparaciones IS
  'Primer evento de historial_reparacion lo crea createRepair (Server Action).';

-- Normalizar notas históricas del ingreso inicial
UPDATE public.historial_reparacion h
SET nota_tecnica = 'Equipo Recibido - Orden Generada por ' || COALESCE(NULLIF(trim(h.actor_nombre), ''), 'Usuario')
WHERE trim(COALESCE(h.nota_tecnica, '')) IN (
  'Ingreso del equipo al sistema',
  'Orden creada / Recibida'
)
AND h.estado_anterior IS NULL
AND trim(COALESCE(h.estado_nuevo, '')) = 'Recibido';
