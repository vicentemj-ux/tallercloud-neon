-- Agrega campos de hardware a detalle_ventas para persistir detalles del equipo al momento de la venta.
-- Estos campos se copian de productos.* en el momento de la venta para mantener historial inmutable.

ALTER TABLE public.detalle_ventas
  ADD COLUMN IF NOT EXISTS marca           TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS modelo          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS procesador      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ram             TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS almacenamiento  TEXT DEFAULT NULL;
