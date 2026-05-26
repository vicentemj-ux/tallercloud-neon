-- Control de acceso al Plan Pro por taller.
-- Fuente de verdad para habilitar módulos Pro en la app.
ALTER TABLE public.taller_users
ADD COLUMN IF NOT EXISTS plan_activo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.taller_users.plan_activo IS
'Indica si el taller tiene acceso al Plan Pro.';
