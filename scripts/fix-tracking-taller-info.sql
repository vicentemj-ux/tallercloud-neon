-- =============================================================
-- FIX: Obtener nombre del taller para tracking público sin admin client
--
-- Problema: getTrackingTallerInfo usa createAdminClient() para leer
--           datos públicos innecesariamente.
--
-- Solución: Función SECURITY DEFINER que devuelve solo el nombre del
--           taller asociado a un ticket de reparación.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_tracking_taller_info(
  p_ticket_id UUID
)
RETURNS TABLE (
  nombre_taller TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT COALESCE(ct.nombre_taller, tu.nombre_taller, 'Mi Taller')::TEXT
    FROM reparaciones r
    LEFT JOIN configuracion_taller ct ON ct.taller_id = r.taller_id
    LEFT JOIN taller_users tu ON tu.id = r.taller_id
    WHERE r.id = p_ticket_id
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracking_taller_info(UUID) TO anon;
