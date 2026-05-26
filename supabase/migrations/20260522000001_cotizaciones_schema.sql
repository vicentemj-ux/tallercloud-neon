-- ============================================================
-- MODULO PRO: COTIZACIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  folio TEXT NOT NULL,
  cliente_id UUID NULL REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NULL,
  equipo_tipo TEXT NOT NULL DEFAULT 'Celular',
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  observaciones TEXT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'convertida')),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_expiracion DATE NULL,
  creado_por TEXT NULL,
  reparacion_id UUID NULL REFERENCES reparaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (taller_id, folio)
);

CREATE TABLE IF NOT EXISTS cotizacion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_taller_created_at ON cotizaciones(taller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_taller_estado ON cotizaciones(taller_id, estado);
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_taller_cotizacion ON cotizacion_items(taller_id, cotizacion_id);

CREATE OR REPLACE FUNCTION touch_updated_at_cotizaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_cotizaciones ON cotizaciones;
CREATE TRIGGER trg_touch_updated_at_cotizaciones
BEFORE UPDATE ON cotizaciones
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at_cotizaciones();

DROP TRIGGER IF EXISTS trg_touch_updated_at_cotizacion_items ON cotizacion_items;
CREATE TRIGGER trg_touch_updated_at_cotizacion_items
BEFORE UPDATE ON cotizacion_items
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at_cotizaciones();

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotizaciones_tenant_policy ON cotizaciones;
CREATE POLICY cotizaciones_tenant_policy ON cotizaciones
USING ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);

DROP POLICY IF EXISTS cotizacion_items_tenant_policy ON cotizacion_items;
CREATE POLICY cotizacion_items_tenant_policy ON cotizacion_items
USING ((auth.jwt() ->> 'taller_id')::uuid = taller_id)
WITH CHECK ((auth.jwt() ->> 'taller_id')::uuid = taller_id);
