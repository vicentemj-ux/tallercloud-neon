-- Estado de venta (anulación) + stock de reversión + tipo de movimiento anulación + RPC dashboard

-- ── ventas.estado ─────────────────────────────────────────────────────────────
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'
  CHECK (estado IN ('activa', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_ventas_taller_estado_created
  ON public.ventas (taller_id, estado, created_at DESC);

COMMENT ON COLUMN public.ventas.estado IS 'activa | cancelada (anulación admin devuelve inventario PDV).';

-- ── batch_increment_stock (reversión de batch_decrement_stock) ───────────────
CREATE OR REPLACE FUNCTION public.batch_increment_stock(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE public.productos
    SET stock_actual = stock_actual + (item->>'cantidad')::int
    WHERE id = (item->>'producto_id')::uuid
      AND taller_id = (item->>'taller_id')::uuid;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_increment_stock(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_increment_stock(jsonb) TO service_role;

-- ── movimientos_caja: permitir anulación de venta PDV ───────────────────────
ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;

ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN (
    'venta_pdv',
    'anticipo_reparacion',
    'liquidacion_reparacion',
    'gasto',
    'anulacion_venta'
  ));

-- ── get_dashboard_stats: excluir ventas canceladas ─────────────────────────
DROP FUNCTION IF EXISTS get_dashboard_stats(text);

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
        AND (v.estado IS NULL OR v.estado = 'activa')
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
