-- =============================================================
-- FIX: Cambiar p_taller_id de UUID a TEXT en get_dashboard_stats
--      y get_next_folio para compatibilidad con columnas taller_id
--      de tipo text en la BD.
-- =============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id    TEXT,
  p_first_of_month TIMESTAMPTZ,
  p_seven_days_ago TIMESTAMPTZ
)
RETURNS TABLE (
  en_proceso     BIGINT,
  listos         BIGINT,
  ventas_pdv     NUMERIC,
  cobros_rep     NUMERIC,
  urgentes       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')) AS en_proceso,

    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus = 'Listo') AS listos,

    COALESCE(
      (SELECT SUM(total) FROM ventas
        WHERE taller_id::text = p_taller_id
          AND created_at >= p_first_of_month), 0
    ) AS ventas_pdv,

    COALESCE(
      (SELECT SUM(monto) FROM movimientos_caja
        WHERE taller_id::text = p_taller_id
          AND tipo IN ('anticipo_reparacion','liquidacion_reparacion')
          AND fecha >= p_first_of_month), 0
    ) AS cobros_rep,

    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')
        AND updated_at < p_seven_days_ago) AS urgentes;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


CREATE OR REPLACE FUNCTION get_next_folio(
  p_taller_id TEXT,
  p_prefix    TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(
          REGEXP_REPLACE(folio, '^' || p_prefix, ''),
          ''
        ) AS INTEGER
      )
    ), 0
  )
  FROM reparaciones
  WHERE taller_id::text = p_taller_id
    AND folio LIKE p_prefix || '%'
    AND folio ~ ('^' || p_prefix || '[0-9]+$');
$$;

GRANT EXECUTE ON FUNCTION get_next_folio(TEXT, TEXT) TO authenticated;
