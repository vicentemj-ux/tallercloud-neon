-- Modo Pro: asegura plan_activo + is_pro (bases sin migraciones 20260324 previas).
-- Política RLS: cuentas con es_admin pueden actualizar cualquier fila taller_users (JWT tenant).

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS plan_activo boolean NOT NULL DEFAULT false;

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;

UPDATE public.taller_users
SET is_pro = COALESCE(plan_activo, false)
WHERE is_pro IS DISTINCT FROM COALESCE(plan_activo, false);

COMMENT ON COLUMN public.taller_users.plan_activo IS
  'Modo Pro / plan activo (Chat, Mercado, etc.).';

COMMENT ON COLUMN public.taller_users.is_pro IS
  'Modo Pro (sincronizado con plan_activo; la app actualiza ambos).';

DROP POLICY IF EXISTS "taller_users_update_by_platform_admin" ON public.taller_users;

CREATE POLICY "taller_users_update_by_platform_admin" ON public.taller_users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.taller_users AS me
      WHERE me.id = (auth.jwt() ->> 'taller_id')::uuid
        AND me.es_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.taller_users AS me
      WHERE me.id = (auth.jwt() ->> 'taller_id')::uuid
        AND me.es_admin IS TRUE
    )
  );
