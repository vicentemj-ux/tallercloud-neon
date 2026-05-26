-- =============================================================
-- CATÁLOGO DE SERVICIOS + VÍNCULO CON REPARACIONES
-- =============================================================

-- ─── Tabla: catalogo_servicios ─────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_servicios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      DECIMAL(10, 2) NOT NULL CHECK (precio >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE catalogo_servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_servicios_taller"
  ON catalogo_servicios
  FOR ALL
  TO authenticated
  USING  (taller_id = (auth.jwt() ->> 'taller_id')::uuid)
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_taller
  ON catalogo_servicios (taller_id);

CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_nombre
  ON catalogo_servicios (taller_id, nombre);

-- ─── Tabla: reparacion_servicios (pivote) ──────────────────────
CREATE TABLE IF NOT EXISTS reparacion_servicios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID NOT NULL,
  reparacion_id   UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  servicio_id     UUID REFERENCES catalogo_servicios(id) ON DELETE SET NULL,
  nombre_snapshot TEXT NOT NULL,
  precio_snapshot DECIMAL(10, 2) NOT NULL CHECK (precio_snapshot >= 0),
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reparacion_servicios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reparacion_servicios_taller"
  ON reparacion_servicios
  FOR ALL
  TO authenticated
  USING  (taller_id = (auth.jwt() ->> 'taller_id')::uuid)
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_reparacion_servicios_reparacion
  ON reparacion_servicios (taller_id, reparacion_id);
