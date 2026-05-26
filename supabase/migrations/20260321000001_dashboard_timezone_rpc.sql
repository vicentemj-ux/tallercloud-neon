-- =============================================================
-- Dashboard por zona horaria del taller
-- 1) Asegura columna configuracion_taller.zona_horaria
-- 2) Reemplaza RPC get_dashboard_stats para calcular periodos en DB
-- =============================================================

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS zona_horaria TEXT NOT NULL DEFAULT 'America/Mexico_City';

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
  v_tz TEXT := 'America/Mexico_City';
  v_now_tz TIMESTAMPTZ;
  v_first_of_month_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Mexico_City');

  -- "ahora" convertido a zona horaria del taller
  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);

  -- inicio de mes y umbral de urgencia calculados en la misma zona horaria
  v_first_of_month_tz := date_trunc('month', v_now_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    -- Reparaciones activas (sin entregadas/canceladas)
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')) AS en_proceso,

    -- Equipos listos
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus = 'Listo') AS listos,

    -- Ventas del mes en TZ del taller
    COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS ventas_pdv,

    -- Cobros de reparación del mes en TZ del taller
    COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS cobros_rep,

    -- Urgentes: activas sin actualizar en 7+ días (en TZ del taller)
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
        AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
    ) AS urgentes;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO authenticated;
