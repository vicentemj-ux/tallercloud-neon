-- Migration: 20260416000003_crear_reparacion_con_anticipo.sql
--
-- Adds RPC `registrar_movimiento_anticipo_inicial` that inserts the opening
-- anticipo into movimientos_caja when a new repair is created with a deposit.
--
-- This RPC intentionally does NOT update reparaciones.anticipo — that field is
-- already set during the INSERT in createRepairInner. It only registers the
-- cash-drawer movement so the corte de caja stays accurate.
--
-- If this RPC fails the caller (createRepairInner) must DELETE the repair
-- to enforce the strict-failure / atomic guarantee.

CREATE OR REPLACE FUNCTION registrar_movimiento_anticipo_inicial(
  p_repair_id       uuid,
  p_taller_id       text,
  p_monto           numeric,
  p_metodo_pago     text,
  p_caja_id         text,
  p_folio_rep       text,
  p_dispositivo     text,
  p_vendedor_nombre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_jwt_taller_id  text;
  v_seq_val        bigint;
  v_folio_mov      text;
  v_movimiento_id  uuid;
  v_descripcion    text;
BEGIN
  -- ── JWT tenant guard ─────────────────────────────────────────────────────
  v_jwt_taller_id := auth.jwt() ->> 'taller_id';
  IF v_jwt_taller_id IS DISTINCT FROM p_taller_id THEN
    RAISE EXCEPTION 'tenant_mismatch: jwt=% param=%', v_jwt_taller_id, p_taller_id;
  END IF;

  -- ── Validate caja still open (race-condition guard) ──────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM caja
    WHERE id = p_caja_id
      AND taller_id = p_taller_id
      AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'caja_not_open: caja_id=% taller=%', p_caja_id, p_taller_id;
  END IF;

  -- ── Validate repair belongs to this tenant ────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM reparaciones
    WHERE id = p_repair_id
      AND taller_id = p_taller_id::uuid
  ) THEN
    RAISE EXCEPTION 'repair_not_found: repair_id=% taller=%', p_repair_id, p_taller_id;
  END IF;

  -- ── Generate folio A-XXXXX ─────────────────────────────────────────────
  SELECT nextval('movimientos_caja_abono_seq') INTO v_seq_val;
  v_folio_mov := 'A-' || LPAD(v_seq_val::text, 5, '0');

  -- ── Build description ────────────────────────────────────────────────────
  IF p_dispositivo IS NOT NULL AND p_dispositivo <> '' THEN
    v_descripcion := 'Anticipo - Folio ' || p_folio_rep || ' (' || p_dispositivo || ')';
  ELSE
    v_descripcion := 'Anticipo - Folio ' || p_folio_rep;
  END IF;

  -- ── Insert movement ───────────────────────────────────────────────────────
  INSERT INTO movimientos_caja (
    taller_id,
    caja_id,
    tipo,
    monto,
    metodo_pago,
    descripcion,
    referencia_id,
    folio,
    vendedor_nombre
  ) VALUES (
    p_taller_id,
    p_caja_id,
    'anticipo_reparacion',
    p_monto,
    p_metodo_pago,
    v_descripcion,
    p_repair_id::text,
    v_folio_mov,
    p_vendedor_nombre
  )
  RETURNING id INTO v_movimiento_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'movimiento_id', v_movimiento_id,
    'folio',        v_folio_mov
  );
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_movimiento_anticipo_inicial(uuid, text, numeric, text, text, text, text, text)
  TO authenticated;
