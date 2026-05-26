-- =============================================================
-- GASTOS EN DOS NIVELES
-- Nivel 1: reparacion_gastos  — gastos por ticket de reparación
-- Nivel 2: bitacora_gastos    — gastos generales del taller
--          (tabla ya existe en producción, solo se agregan
--           columnas faltantes y se crea reparacion_gastos)
-- =============================================================

-- ─── Tabla: reparacion_gastos ─────────────────────────────────

CREATE TABLE IF NOT EXISTS reparacion_gastos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       TEXT NOT NULL,
  reparacion_id   UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  concepto        TEXT NOT NULL,
  monto           DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),
  tipo            TEXT NOT NULL CHECK (tipo IN ('mano_obra', 'refaccion', 'otro')),
  producto_id     UUID REFERENCES productos(id) ON DELETE SET NULL,
  mostrar_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reparacion_gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reparacion_gastos_taller"
  ON reparacion_gastos
  FOR ALL
  TO authenticated
  USING  (taller_id = (auth.jwt() ->> 'taller_id'))
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id'));

CREATE INDEX IF NOT EXISTS idx_reparacion_gastos_reparacion
  ON reparacion_gastos (taller_id, reparacion_id);

-- ─── Tabla: bitacora_gastos (ya existe) — agregar columnas ─────

ALTER TABLE bitacora_gastos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS notas       TEXT,
  ADD COLUMN IF NOT EXISTS categoria   TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS caja_id     UUID;
