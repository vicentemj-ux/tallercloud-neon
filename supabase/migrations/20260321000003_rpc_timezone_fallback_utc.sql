-- Homologa fallback de zona horaria a UTC en la RPC del dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id TEXT
)
RETURNS TABLE (
  en_proceso BIGINT,
  listos BIGINT,
  ventas_pdv NUMERIC,
  cobros_rep NUMERIC,
  urgentes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'UTC';
  v_now_tz TIMESTAMPTZ;
  v_first_of_month_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'UTC');

  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
  v_first_of_month_tz := date_trunc('month', v_now_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')) AS en_proceso,

    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus = 'Listo') AS listos,

    COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS ventas_pdv,

    COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS cobros_rep,

    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
        AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
    ) AS urgentes;
END;
$$;
