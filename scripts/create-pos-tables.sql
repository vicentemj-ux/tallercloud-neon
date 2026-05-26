-- ============================================================
-- POS: Caja, Ventas, Detalle de Ventas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- CAJA (sesión de caja diaria)
CREATE TABLE IF NOT EXISTS caja (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  taller_id           TEXT        NOT NULL,
  monto_inicial       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_cierre        NUMERIC(12,2),
  fecha_apertura      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_cierre        TIMESTAMPTZ,
  estado              TEXT        NOT NULL DEFAULT 'abierta'
                        CHECK (estado IN ('abierta', 'cerrada')),
  total_efectivo      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tarjeta       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_transferencia NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ventas        INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caja_taller_estado
  ON caja (taller_id, estado);

-- VENTAS (cabecera de cada venta)
CREATE TABLE IF NOT EXISTS ventas (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  taller_id           TEXT        NOT NULL,
  caja_id             UUID        REFERENCES caja(id),
  folio               TEXT        NOT NULL,
  cliente_nombre      TEXT,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo_pago         TEXT        NOT NULL DEFAULT 'efectivo'
                        CHECK (metodo_pago IN ('efectivo','tarjeta','transferencia','mixto')),
  monto_efectivo      NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_tarjeta       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_transferencia NUMERIC(12,2) NOT NULL DEFAULT 0,
  cambio              NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_taller
  ON ventas (taller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_caja
  ON ventas (caja_id);

-- DETALLE_VENTAS (líneas de cada venta)
CREATE TABLE IF NOT EXISTS detalle_ventas (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  venta_id         UUID    NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id      UUID,
  descripcion      TEXT    NOT NULL,
  cantidad         INTEGER NOT NULL DEFAULT 1,
  precio_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_unitario   NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  es_especial      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_detalle_venta
  ON detalle_ventas (venta_id);
