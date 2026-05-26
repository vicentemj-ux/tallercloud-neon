-- Notas internas del taller (no visibles al cliente en tracking).

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS notas_internas text DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.notas_internas IS
  'Notas operativas del taller; solo panel interno.';
