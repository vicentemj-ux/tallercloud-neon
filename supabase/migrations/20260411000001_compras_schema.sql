-- ============================================================
-- MÓDULO: COMPRAS & PROVISIÓN
-- Proveedores + Órdenes de Compra + Detalle
-- Integración: recibir orden → actualiza stock en productos
-- ============================================================

-- ── Proveedores ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proveedores (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id  UUID        NOT NULL,
  nombre     TEXT        NOT NULL,
  contacto   TEXT,
  telefono   TEXT,
  email      TEXT,
  notas      TEXT,
  activo     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_taller ON proveedores(taller_id, activo);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compras_prov_tenant" ON proveedores
  USING      ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
  WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);

-- ── Órdenes de Compra ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        UUID        NOT NULL,
  folio            TEXT        NOT NULL,
  proveedor_id     UUID        REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT        NOT NULL DEFAULT '',
  estatus          TEXT        NOT NULL DEFAULT 'pendiente'
                   CHECK (estatus IN ('pendiente','recibida','parcial','cancelada')),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas            TEXT,
  fecha_orden      DATE        NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega    DATE,
  stock_aplicado   BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordenes_compra_taller      ON ordenes_compra(taller_id, created_at DESC);
CREATE INDEX idx_ordenes_compra_taller_est  ON ordenes_compra(taller_id, estatus);

ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compras_ord_tenant" ON ordenes_compra
  USING      ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
  WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);

-- ── Detalle de Orden ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS detalle_orden_compra (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID          NOT NULL,
  orden_id        UUID          NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  descripcion     TEXT          NOT NULL,
  cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  producto_id     UUID,         -- FK opcional a productos (para auto-stock)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_detalle_orden_orden  ON detalle_orden_compra(orden_id);
CREATE INDEX idx_detalle_orden_taller ON detalle_orden_compra(taller_id);

ALTER TABLE detalle_orden_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compras_det_tenant" ON detalle_orden_compra
  USING      ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
  WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);

-- ── RPC: recibir_orden_compra ─────────────────────────────────
-- Marca la orden como recibida Y actualiza stock en productos.
-- Idempotente: stock_aplicado evita doble conteo.

CREATE OR REPLACE FUNCTION recibir_orden_compra(
  p_orden_id  UUID,
  p_taller_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validar que la orden existe, pertenece al taller y no fue procesada
  IF NOT EXISTS (
    SELECT 1 FROM ordenes_compra
    WHERE id = p_orden_id
      AND taller_id = p_taller_id
      AND estatus IN ('pendiente', 'parcial')
      AND stock_aplicado = false
  ) THEN
    RAISE EXCEPTION 'Orden no encontrada, ya recibida o cancelada';
  END IF;

  -- Incrementar stock de productos vinculados
  UPDATE productos p
  SET    stock_actual = GREATEST(0, p.stock_actual + d.cantidad)
  FROM   detalle_orden_compra d
  WHERE  d.orden_id   = p_orden_id
    AND  d.taller_id  = p_taller_id
    AND  d.producto_id IS NOT NULL
    AND  d.producto_id = p.id
    AND  p.taller_id  = p_taller_id;

  -- Actualizar estatus y marcar stock como aplicado
  UPDATE ordenes_compra
  SET    estatus        = 'recibida',
         stock_aplicado = true,
         fecha_entrega  = COALESCE(fecha_entrega, CURRENT_DATE)
  WHERE  id        = p_orden_id
    AND  taller_id = p_taller_id;
END;
$$;

GRANT EXECUTE ON FUNCTION recibir_orden_compra(UUID, UUID) TO authenticated;
