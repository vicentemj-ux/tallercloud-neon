-- Migration: atomic abono registration + unique sequential folio
-- Date: 2026-04-15
--
-- Problems solved:
--   1. Non-atomic writes: anticipo updated even when movimientos_caja INSERT fails.
--   2. Silent INSERT failures: folio/vendedor_nombre columns might not exist yet.
--   3. Race-condition folio: COUNT+1 approach generates duplicates under concurrency.
--
-- Solution:
--   - Ensure folio + vendedor_nombre columns exist (idempotent with migration 000006).
--   - Create a global PostgreSQL SEQUENCE for abono folio numbers (no race conditions).
--   - Create RPC `registrar_abono_atomico`: both writes happen in a single DB transaction.
--     If either fails, the whole transaction rolls back automatically.

-- ─── 1. Ensure folio and vendedor_nombre columns exist ───────────────────────
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS folio           TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_nombre  TEXT;

-- ─── 2. Global sequence for abono folio numbers ──────────────────────────────
-- Shared across all tallers so folios are globally unique (A-00001 … A-99999+).
CREATE SEQUENCE IF NOT EXISTS public.movimientos_caja_abono_seq START 1;

-- ─── 3. Atomic RPC ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_repair_id        uuid,
  p_taller_id        text,
  p_monto            numeric,
  p_metodo_pago      text,
  p_caja_id          text,
  p_folio_rep        text,
  p_cliente_nombre   text,
  p_vendedor_nombre  text
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
  -- JWT tenant guard: caller must own this taller
  IF (auth.jwt() ->> 'taller_id') IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  -- Lock repair row to prevent concurrent double-payments
  -- NOTE: reparaciones.taller_id is uuid; p_taller_id is text → cast required.
  SELECT anticipo, precio_estimado
    INTO v_anticipo_actual, v_precio_estimado
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  -- Compute new totals
  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;
  v_liquidado      := (COALESCE(v_precio_estimado, 0) > 0
                       AND v_nuevo_anticipo >= COALESCE(v_precio_estimado, 0));
  v_tipo           := CASE WHEN v_liquidado
                           THEN 'liquidacion_reparacion'
                           ELSE 'anticipo_reparacion' END;
  v_tipo_label     := CASE WHEN v_liquidado THEN 'Liquidación' ELSE 'Anticipo' END;

  -- Generate folio from atomic sequence (no race conditions)
  v_folio_abono := 'A-' || LPAD(nextval('public.movimientos_caja_abono_seq')::text, 5, '0');

  -- Build description
  v_descripcion := v_tipo_label || ' — Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_cliente_nombre IS NOT NULL AND trim(p_cliente_nombre) <> '' THEN
    v_descripcion := v_descripcion || ' · ' || trim(p_cliente_nombre);
  END IF;

  -- Write 1: update anticipo
  UPDATE public.reparaciones
     SET anticipo = v_nuevo_anticipo
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  -- Write 2: insert cash movement (same transaction — if this fails, Write 1 rolls back)
  INSERT INTO public.movimientos_caja (
    taller_id,
    caja_id,
    tipo,
    referencia_id,
    descripcion,
    monto,
    metodo_pago,
    folio,
    vendedor_nombre,
    fecha
  ) VALUES (
    p_taller_id,
    p_caja_id::uuid,
    v_tipo,
    p_repair_id,
    v_descripcion,
    p_monto,
    p_metodo_pago,
    v_folio_abono,
    NULLIF(trim(p_vendedor_nombre), ''),
    now()
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

GRANT EXECUTE ON FUNCTION public.registrar_abono_atomico(uuid, text, numeric, text, text, text, text, text)
  TO authenticated;
