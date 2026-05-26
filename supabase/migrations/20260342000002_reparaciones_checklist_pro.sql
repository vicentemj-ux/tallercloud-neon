-- Diagnóstico PRO (health check): pruebas por tipo de equipo + omisión express.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS checklist_pro jsonb DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.checklist_pro IS
  'JSON: { funcional: {clave: bool}, expressOmitReason?: string } — mín. 5 pruebas OK si el taller exige health check.';
