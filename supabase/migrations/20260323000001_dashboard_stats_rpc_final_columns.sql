  -- RPC dashboard: nombres de columnas alineados con el cliente (en_proceso_count, listos_count, …)
  -- PostgreSQL no permite cambiar el tipo de retorno con CREATE OR REPLACE; hay que DROP primero.
  -- Incluye firmas antiguas por si el proyecto aún tenía overloads (uuid, parámetros de fecha, etc.).

  DROP FUNCTION IF EXISTS get_dashboard_stats(text);
  DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);
  DROP FUNCTION IF EXISTS get_dashboard_stats(text, timestamptz, timestamptz);
  DROP FUNCTION IF EXISTS get_dashboard_stats(uuid, timestamptz, timestamptz);

  CREATE FUNCTION get_dashboard_stats(
    p_taller_id TEXT
  )
  RETURNS TABLE (
    en_proceso_count BIGINT,
    listos_count BIGINT,
    ingresos_brutos_mes NUMERIC,
    urgentes_count BIGINT
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
    v_ventas NUMERIC;
    v_cobros NUMERIC;
  BEGIN
    SELECT ct.zona_horaria
      INTO v_tz
    FROM configuracion_taller ct
    WHERE ct.taller_id::text = p_taller_id
    LIMIT 1;

    v_tz := COALESCE(v_tz, 'UTC');

    v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
    v_first_of_month_tz := date_trunc('month', v_now_tz);
    v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

    v_ventas := COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    );

    v_cobros := COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    );

    RETURN QUERY
    SELECT
      -- Tickets en cola: activos (no entregados ni cancelados; incluye Listo)
      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus NOT IN ('Entregado', 'Cancelado')
      ) AS en_proceso_count,

      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus = 'Listo'
      ) AS listos_count,

      (v_ventas + v_cobros) AS ingresos_brutos_mes,

      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus NOT IN ('Entregado', 'Cancelado')
          AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
      ) AS urgentes_count;
  END;
  $$;

  GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO authenticated;
  GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT) TO service_role;
