-- Performance indexes for the three instrumented hot paths.
-- All use IF NOT EXISTS — safe to re-run on any environment.

-- ─── POS: getProductosDisponibles ────────────────────────────────────────────
-- Query pattern: taller_id = ? AND stock_actual > 0 ORDER BY nombre ASC
-- Partial index covers only in-stock rows → smaller, faster index.
CREATE INDEX IF NOT EXISTS idx_productos_taller_stock_nombre
  ON productos(taller_id, nombre)
  WHERE stock_actual > 0;

-- ─── Historial de Ventas: ventas PDV ─────────────────────────────────────────
-- Query pattern: taller_id = ? AND estado IN (...) AND created_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_ventas_taller_created_at
  ON ventas(taller_id, created_at DESC);

-- ─── Historial de Ventas: cobros de reparación ───────────────────────────────
-- Query pattern: taller_id = ? AND tipo IN (...) AND fecha BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_taller_tipo_fecha
  ON movimientos_caja(taller_id, tipo, fecha DESC);

-- ─── Historial de Ventas: detalle_ventas lookup ──────────────────────────────
-- Query pattern: venta_id IN (...)
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta_id
  ON detalle_ventas(venta_id);

-- ─── Reparaciones: list query ─────────────────────────────────────────────────
-- Query pattern: taller_id = ? ORDER BY created_at DESC LIMIT/OFFSET
-- (Likely exists from PERF-06 but included for completeness.)
CREATE INDEX IF NOT EXISTS idx_reparaciones_taller_created_at
  ON reparaciones(taller_id, created_at DESC);
