-- Flag permanente para habilitar funcionalidades Pro por taller.
ALTER TABLE public.taller_users
ADD COLUMN IF NOT EXISTS es_pro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.taller_users.es_pro IS
'Habilita el acceso al modo Pro del taller.';
