-- Precio mensual contratado (MXN) para mostrar PLAN CORE vs PLAN PRO en el dashboard.
ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS precio_plan_mensual integer NULL;

COMMENT ON COLUMN public.taller_users.precio_plan_mensual IS
  'Precio mensual en MXN (189 = PLAN CORE, 299 = PLAN PRO). NULL = legado o sin dato.';
