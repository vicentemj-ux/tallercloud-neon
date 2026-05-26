-- Agregar columna color a reparaciones (ya se referencia en código pero no existía en BD)
ALTER TABLE public.reparaciones
ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.reparaciones.color IS 'Color del dispositivo (ej: Negro, Azul, Rojo)';
