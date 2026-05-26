-- Anulación atómica de venta PDV + auditoría (estado anulado, anulado_por, motivo)
-- Inventario: productos.stock_actual vía batch_increment_stock
-- Caja: ajuste totales + movimiento tipo anulacion_venta

-- ── Columnas de auditoría en ventas ───────────────────────────────────────────
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES public.taller_users(id) ON DELETE SET NULL;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

COMMENT ON COLUMN public.ventas.anulado_por IS 'Cuenta taller_users que anuló la venta (propietario / sesión).';
COMMENT ON COLUMN public.ventas.fecha_anulacion IS 'Momento de la anulación.';
COMMENT ON COLUMN public.ventas.motivo_anulacion IS 'Motivo opcional de la anulación.';

-- Estado: activa | anulado (migrar cancelada legacy → anulado)
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;

UPDATE public.ventas SET estado = 'anulado' WHERE estado = 'cancelada';

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_estado_check CHECK (estado IN ('activa', 'anulado'));

COMMENT ON COLUMN public.ventas.estado IS 'activa | anulado';

-- ── RPC atómica: anular venta PDV ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_venta_pdv(
  p_venta_id uuid,
  p_taller_id text,
  p_anulado_por uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  items jsonb;
  v_metodo text;
BEGIN
  IF p_taller_id IS NULL OR trim(p_taller_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'taller_id requerido.');
  END IF;

  IF (auth.jwt() ->> 'taller_id') IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para este taller.');
  END IF;

  SELECT
    id,
    taller_id,
    caja_id,
    folio,
    total,
    estado,
    metodo_pago,
    monto_efectivo,
    monto_tarjeta,
    monto_transferencia
  INTO v
  FROM public.ventas
  WHERE id = p_venta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no encontrada.');
  END IF;

  IF v.taller_id IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no pertenece al taller.');
  END IF;

  IF v.estado IS DISTINCT FROM 'activa' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta no está activa.');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'producto_id', d.producto_id::text,
        'taller_id', p_taller_id,
        'cantidad', d.cantidad
      )
    ),
    '[]'::jsonb
  )
  INTO items
  FROM public.detalle_ventas d
  WHERE d.venta_id = p_venta_id
    AND d.producto_id IS NOT NULL
    AND NOT COALESCE(d.es_especial, false);

  IF items IS NOT NULL AND jsonb_array_length(items) > 0 THEN
    PERFORM public.batch_increment_stock(items);
  END IF;

  IF v.caja_id IS NOT NULL THEN
    UPDATE public.caja c
    SET
      total_efectivo = c.total_efectivo - COALESCE(v.monto_efectivo, 0),
      total_tarjeta = c.total_tarjeta - COALESCE(v.monto_tarjeta, 0),
      total_transferencia = c.total_transferencia - COALESCE(v.monto_transferencia, 0),
      total_ventas = GREATEST(0, c.total_ventas - 1)
    WHERE c.id = v.caja_id
      AND c.taller_id = p_taller_id;

    v_metodo := lower(COALESCE(v.metodo_pago, 'efectivo'));
    IF v_metodo NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto') THEN
      v_metodo := 'efectivo';
    END IF;

    INSERT INTO public.movimientos_caja (
      taller_id,
      caja_id,
      tipo,
      referencia_id,
      descripcion,
      monto,
      metodo_pago,
      fecha
    )
    VALUES (
      p_taller_id,
      v.caja_id,
      'anulacion_venta',
      p_venta_id,
      'Anulación ' || COALESCE(v.folio, ''),
      -ABS(COALESCE(v.total, 0)),
      v_metodo,
      NOW()
    );
  END IF;

  UPDATE public.ventas
  SET
    estado = 'anulado',
    anulado_por = p_anulado_por,
    fecha_anulacion = NOW(),
    motivo_anulacion = NULLIF(trim(p_motivo), '')
  WHERE id = p_venta_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_venta_pdv(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_venta_pdv(uuid, text, uuid, text) TO service_role;

-- get_dashboard_stats (20260329000001) ya suma solo ventas activas; tras migrar
-- cancelada → anulado, el CHECK sigue excluyendo ingresos de ventas anuladas.
