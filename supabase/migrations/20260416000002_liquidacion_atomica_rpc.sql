-- Migration: liquidacion_atomica RPC + better description format
-- Date: 2026-04-16
--
-- Changes:
--   1. New sequence for liquidacion folios (L-00001 … L-99999+)
--   2. registrar_abono_atomico: add p_dispositivo param, new description format
--      "Anticipo - Folio X (Marca Modelo)"  /  "Liquidación - Folio X (Marca Modelo)"
--      DROP old 8-param signature first (PostgreSQL treats different arity as overloads).
--   3. New registrar_liquidacion_atomica: single DB transaction that covers
--      movimientos_caja INSERT  +  reparaciones UPDATE (anticipo/estatus/fecha_entrega)
--      +  historial_reparacion INSERT — replaces the old crearVenta+finalizar_entrega flow.

-- ─── 1. Sequence for liquidacion folios ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.movimientos_caja_liquidacion_seq START 1;

-- ─── 2. Update registrar_abono_atomico (drop 8-param, recreate as 9-param) ──
DROP FUNCTION IF EXISTS public.registrar_abono_atomico(uuid, text, numeric, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_repair_id        uuid,
  p_taller_id        text,
  p_monto            numeric,
  p_metodo_pago      text,
  p_caja_id          text,
  p_folio_rep        text,
  p_cliente_nombre   text,
  p_vendedor_nombre  text,
  p_dispositivo      text    -- "Marca Modelo" e.g. "Apple iPhone 17"
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_precio_estimado  numeric;
  v_nuevo_anticipo   numeric;
  v_liquidado        boolean;
  v_tipo             text;
  v_tipo_label       text;
  v_folio_abono      text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
  IF (auth.jwt() ->> 'taller_id') IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT anticipo, precio_estimado
    INTO v_anticipo_actual, v_precio_estimado
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;
  v_liquidado      := (COALESCE(v_precio_estimado, 0) > 0
                       AND v_nuevo_anticipo >= COALESCE(v_precio_estimado, 0));
  v_tipo           := CASE WHEN v_liquidado THEN 'liquidacion_reparacion' ELSE 'anticipo_reparacion' END;
  v_tipo_label     := CASE WHEN v_liquidado THEN 'Liquidación' ELSE 'Anticipo' END;

  v_folio_abono := 'A-' || LPAD(nextval('public.movimientos_caja_abono_seq')::text, 5, '0');

  -- "Anticipo - Folio CDS001 (Apple iPhone 17)"
  v_descripcion := v_tipo_label || ' - Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_dispositivo IS NOT NULL AND trim(p_dispositivo) <> '' THEN
    v_descripcion := v_descripcion || ' (' || trim(p_dispositivo) || ')';
  END IF;

  UPDATE public.reparaciones
     SET anticipo = v_nuevo_anticipo
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  INSERT INTO public.movimientos_caja (
    taller_id, caja_id, tipo, referencia_id, descripcion,
    monto, metodo_pago, folio, vendedor_nombre, fecha
  ) VALUES (
    p_taller_id, p_caja_id::uuid, v_tipo, p_repair_id, v_descripcion,
    p_monto, p_metodo_pago, v_folio_abono, NULLIF(trim(p_vendedor_nombre), ''), now()
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'nuevo_anticipo', v_nuevo_anticipo,
    'liquidado',      v_liquidado,
    'folio_abono',    v_folio_abono,
    'movimiento_id',  v_mov_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_abono_atomico(uuid, text, numeric, text, text, text, text, text, text)
  TO authenticated;

-- ─── 3. registrar_liquidacion_atomica ───────────────────────────────────────
-- Replaces the old crearVenta + finalizar_entrega_reparacion two-step flow.
-- Everything in one PostgreSQL transaction: if any write fails, all roll back.
CREATE OR REPLACE FUNCTION public.registrar_liquidacion_atomica(
  p_repair_id       uuid,
  p_taller_id       text,
  p_monto           numeric,
  p_metodo_pago     text,
  p_caja_id         text,
  p_folio_rep       text,
  p_dispositivo     text,
  p_vendedor_nombre text,
  p_estado_anterior text,
  p_nota_tecnica    text,
  p_actor_nombre    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_nuevo_anticipo   numeric;
  v_folio_liq        text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
  IF (auth.jwt() ->> 'taller_id') IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  -- Lock repair to prevent concurrent double-delivery
  SELECT anticipo
    INTO v_anticipo_actual
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;

  v_folio_liq := 'L-' || LPAD(nextval('public.movimientos_caja_liquidacion_seq')::text, 5, '0');

  -- "Liquidación - Folio CDS001 (Apple iPhone 17)"
  v_descripcion := 'Liquidación - Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_dispositivo IS NOT NULL AND trim(p_dispositivo) <> '' THEN
    v_descripcion := v_descripcion || ' (' || trim(p_dispositivo) || ')';
  END IF;

  -- Write 1: cash movement (liquidacion_reparacion, NOT venta_pdv)
  INSERT INTO public.movimientos_caja (
    taller_id, caja_id, tipo, referencia_id, descripcion,
    monto, metodo_pago, folio, vendedor_nombre, fecha
  ) VALUES (
    p_taller_id, p_caja_id::uuid, 'liquidacion_reparacion', p_repair_id, v_descripcion,
    p_monto, p_metodo_pago, v_folio_liq, NULLIF(trim(p_vendedor_nombre), ''), now()
  )
  RETURNING id INTO v_mov_id;

  -- Write 2: repair row (anticipo + status + delivery date)
  UPDATE public.reparaciones
     SET anticipo      = v_nuevo_anticipo,
         estatus       = 'Entregado',
         fecha_entrega = now()
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  -- Write 3: audit history
  INSERT INTO public.historial_reparacion (
    reparacion_id, taller_id, usuario_id,
    estado_anterior, estado_nuevo, nota_tecnica, actor_nombre
  ) VALUES (
    p_repair_id, p_taller_id::uuid, p_taller_id::uuid,
    p_estado_anterior, 'Entregado',
    NULLIF(TRIM(p_nota_tecnica), ''), p_actor_nombre
  );

  RETURN jsonb_build_object(
    'ok',                true,
    'nuevo_anticipo',    v_nuevo_anticipo,
    'folio_liquidacion', v_folio_liq,
    'movimiento_id',     v_mov_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_liquidacion_atomica(uuid, text, numeric, text, text, text, text, text, text, text, text)
  TO authenticated;
