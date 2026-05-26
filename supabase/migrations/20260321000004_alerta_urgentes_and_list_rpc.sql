-- Preferencias: reporte diario de equipos urgentes (7+ días sin movimiento, mismo criterio que dashboard)
ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS alerta_urgentes BOOLEAN NOT NULL DEFAULT false;

-- Lista para correo: misma lógica que get_dashboard_stats.urgentes (TZ del taller, exclusión Entregado/Cancelado)
CREATE OR REPLACE FUNCTION list_urgent_reparaciones_for_email(
  p_taller_id TEXT
)
RETURNS TABLE (
  folio TEXT,
  cliente_nombre TEXT,
  modelo TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'UTC';
  v_now_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id::text = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'UTC');

  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    r.folio::text,
    COALESCE(c.nombre, '—')::text AS cliente_nombre,
    TRIM(BOTH ' ' FROM CONCAT(COALESCE(r.marca, ''), ' ', COALESCE(r.modelo, '')))::text AS modelo
  FROM reparaciones r
  LEFT JOIN clientes c ON c.id = r.cliente_id AND c.taller_id = r.taller_id
  WHERE r.taller_id::text = p_taller_id
    AND r.estatus NOT IN ('Entregado', 'Cancelado')
    AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
  ORDER BY r.updated_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION list_urgent_reparaciones_for_email(TEXT) TO service_role;
