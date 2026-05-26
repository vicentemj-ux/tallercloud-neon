-- Checklist de ingreso (recepción): encendido, ítems funcionales, observaciones estéticas.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS checklist_ingreso jsonb DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.checklist_ingreso IS
  'JSON: encendido (ok|intermitente|no), funcional {clave: bool}, observacionesEsteticas (texto).';
