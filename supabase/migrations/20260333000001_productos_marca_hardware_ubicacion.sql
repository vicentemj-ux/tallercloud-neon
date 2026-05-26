-- Inventario: marca, modelo, ubicación, bloque hardware (procesador, ram, almacenamiento)

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS ubicacion text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS procesador text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS ram text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS almacenamiento text;

COMMENT ON COLUMN public.productos.marca IS 'Marca o fabricante (agnóstico).';
COMMENT ON COLUMN public.productos.modelo IS 'Modelo o referencia comercial.';
COMMENT ON COLUMN public.productos.ubicacion IS 'Ubicación física en almacén.';
COMMENT ON COLUMN public.productos.procesador IS 'Hardware: CPU / SoC.';
COMMENT ON COLUMN public.productos.ram IS 'Hardware: memoria RAM.';
COMMENT ON COLUMN public.productos.almacenamiento IS 'Hardware: almacenamiento interno (sustituye uso principal de capacidad legacy).';

UPDATE public.productos
SET almacenamiento = capacidad
WHERE almacenamiento IS NULL
  AND capacidad IS NOT NULL
  AND trim(capacidad) <> '';
