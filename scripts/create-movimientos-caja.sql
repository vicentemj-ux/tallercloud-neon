-- ============================================================
-- Migración: Historial de Caja — movimientos_caja
-- Ejecutar en Supabase SQL Editor
-- Todos los ALTER usan IF NOT EXISTS — seguro re-ejecutar
-- ============================================================

-- ── Tabla: movimientos_caja ───────────────────────────────────────────────────
-- Registra cada movimiento de dinero ligado a una sesión de caja

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  taller_id     TEXT          NOT NULL,
  caja_id       UUID          REFERENCES caja(id) ON DELETE SET NULL,
  tipo          TEXT          NOT NULL
                  CHECK (tipo IN (
                    'venta_pdv',
                    'anticipo_reparacion',
                    'liquidacion_reparacion',
                    'gasto'
                  )),
  referencia_id UUID,
  descripcion   TEXT,
  monto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  metodo_pago   TEXT
                  CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'mixto')),
  fecha         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja
  ON movimientos_caja (caja_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_taller
  ON movimientos_caja (taller_id, fecha DESC);

-- ── Tabla: caja — columnas adicionales ───────────────────────────────────────

-- Nota de cierre (para cierre automático por cambio de fecha)
ALTER TABLE caja
  ADD COLUMN IF NOT EXISTS nota_cierre TEXT;

-- Número de corte autoincremental por taller (nunca se repite)
ALTER TABLE caja
  ADD COLUMN IF NOT EXISTS numero_corte INTEGER;

-- ── Tabla: reparaciones — campos de cobro ─────────────────────────────────────
-- Método de pago del anticipo inicial
ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS anticipo_metodo_pago TEXT
    CHECK (anticipo_metodo_pago IN ('efectivo', 'tarjeta', 'transferencia'));

-- Liquidación al entregar el equipo
ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS liquidacion NUMERIC(12,2);

ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS liquidacion_metodo_pago TEXT
    CHECK (liquidacion_metodo_pago IN ('efectivo', 'tarjeta', 'transferencia'));

-- ── Verificar resultado ───────────────────────────────────────────────────────

-- Backfill numero_corte for existing caja rows that are NULL
-- (assigns sequential numbers per taller ordered by created_at)
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY taller_id ORDER BY created_at ASC) AS rn
  FROM caja
  WHERE numero_corte IS NULL
)
UPDATE caja
SET numero_corte = numbered.rn
FROM numbered
WHERE caja.id = numbered.id;

-- ── Verificar resultado ───────────────────────────────────────────────────────

SELECT id, taller_id, numero_corte, estado, fecha_apertura, nota_cierre
FROM caja
ORDER BY taller_id, numero_corte DESC
LIMIT 20;
