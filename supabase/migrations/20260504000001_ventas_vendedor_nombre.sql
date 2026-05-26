-- Migration: add vendedor_nombre to ventas
-- Purpose: track which staff member registered each PDV sale

ALTER TABLE public.ventas
ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT;

COMMENT ON COLUMN public.ventas.vendedor_nombre IS
  'Nombre visible del usuario que registró la venta (miembro del taller o propietario).';
