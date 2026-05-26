-- KPIs inventario: valor en riesgo (stock crítico) y rotación promedio (últimas 20 líneas PDV con producto)

CREATE OR REPLACE FUNCTION public.get_inventory_operational_kpis(p_taller_id text)
RETURNS TABLE (
  valor_riesgo numeric,
  rotacion_dias_promedio numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_taller_id IS NULL OR trim(p_taller_id) = '' THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF (auth.jwt() ->> 'taller_id') IS DISTINCT FROM p_taller_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COALESCE(SUM(p.costo * p.stock_actual), 0::numeric)
      FROM public.productos p
      WHERE p.taller_id::text = p_taller_id
        AND p.stock_actual <= p.stock_minimo
    ) AS valor_riesgo,
    (
      SELECT COALESCE(AVG(sub.days_diff), 0::numeric)
      FROM (
        SELECT
          EXTRACT(EPOCH FROM (v.created_at - pr.created_at)) / 86400.0 AS days_diff
        FROM public.detalle_ventas d
        INNER JOIN public.ventas v ON v.id = d.venta_id
        INNER JOIN public.productos pr ON pr.id = d.producto_id
        WHERE v.taller_id = p_taller_id
          AND (v.estado IS NULL OR v.estado = 'activa')
          AND d.producto_id IS NOT NULL
          AND NOT COALESCE(d.es_especial, false)
          AND pr.taller_id::text = p_taller_id
        ORDER BY v.created_at DESC
        LIMIT 20
      ) sub
    ) AS rotacion_dias_promedio;
END;
$$;

COMMENT ON FUNCTION public.get_inventory_operational_kpis(text) IS
  'valor_riesgo: suma costo×stock en SKU con stock crítico. rotacion: promedio días (fecha venta − created_at producto) últimas 20 líneas PDV.';

GRANT EXECUTE ON FUNCTION public.get_inventory_operational_kpis(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_operational_kpis(text) TO service_role;
