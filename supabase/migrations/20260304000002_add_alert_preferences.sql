ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS alertas_stock_bajo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reportes_cierre_caja BOOLEAN NOT NULL DEFAULT false;
