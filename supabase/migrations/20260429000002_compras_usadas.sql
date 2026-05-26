-- ============================================================
-- MÓDULO: Compras de Equipos Usados (Activos Adquiridos)
-- ============================================================

CREATE TABLE IF NOT EXISTS compras_usadas (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID          NOT NULL,
  folio           TEXT          NOT NULL,
  fecha           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  vendedor        TEXT          NOT NULL,
  documento       TEXT          NOT NULL,
  telefono        TEXT,
  marca           TEXT          NOT NULL,
  modelo          TEXT          NOT NULL,
  serial          TEXT,
  imei            TEXT,
  color           TEXT,
  condicion       TEXT,
  capacidad       TEXT,
  monto           NUMERIC(12,2) NOT NULL,
  observaciones   TEXT,
  actor_nombre    TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_compras_usadas_taller ON compras_usadas(taller_id, created_at DESC);

ALTER TABLE compras_usadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compras_usadas_tenant" ON compras_usadas
  USING      ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
  WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);
