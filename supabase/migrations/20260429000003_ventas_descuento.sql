-- ============================================================
-- MIGRACIÓN: Agregar columna descuento a ventas
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name = 'descuento'
  ) THEN
    ALTER TABLE ventas ADD COLUMN descuento NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
