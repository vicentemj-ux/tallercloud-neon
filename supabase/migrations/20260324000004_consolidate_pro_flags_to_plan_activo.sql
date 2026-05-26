-- Consolidacion de banderas PRO:
-- Fuente de verdad final: taller_users.plan_activo
-- 1) Copia datos de es_pro -> plan_activo (si existen ambas columnas)
-- 2) Elimina es_pro para evitar doble fuente de verdad

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'taller_users'
      AND column_name = 'es_pro'
  ) THEN
    UPDATE public.taller_users
    SET plan_activo = COALESCE(es_pro, false)
    WHERE COALESCE(plan_activo, false) = false
      AND COALESCE(es_pro, false) = true;

    ALTER TABLE public.taller_users
    DROP COLUMN es_pro;
  END IF;
END $$;
