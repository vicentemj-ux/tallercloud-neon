-- =============================================================================
-- Onboarding Security: verificación de email por PIN (miembros del equipo)
-- =============================================================================

ALTER TABLE public.miembros_taller
  ADD COLUMN IF NOT EXISTS email_verificado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.miembros_taller.email_verificado IS
  'Indica si el miembro confirmó su correo mediante PIN de 6 dígitos.';

CREATE TABLE IF NOT EXISTS public.verificaciones_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  pin text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL,
  CONSTRAINT verificaciones_email_pin_6digits CHECK (pin ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_email_user_taller
  ON public.verificaciones_email (user_id, taller_id, creado_at DESC);

ALTER TABLE public.verificaciones_email ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verificaciones_email_service_role_only" ON public.verificaciones_email;
CREATE POLICY "verificaciones_email_service_role_only"
  ON public.verificaciones_email
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verificaciones_email TO service_role;

CREATE OR REPLACE FUNCTION public.verificar_pin(
  p_user_id uuid,
  p_taller_id uuid,
  p_pin text
)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.verificaciones_email%ROWTYPE;
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT false, 'Código inválido.';
    RETURN;
  END IF;

  SELECT ve.*
  INTO v_row
  FROM public.verificaciones_email ve
  WHERE ve.user_id = p_user_id
    AND ve.taller_id = p_taller_id
  ORDER BY ve.creado_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No existe un código activo para este usuario.';
    RETURN;
  END IF;

  IF v_row.expira_at < now() THEN
    DELETE FROM public.verificaciones_email WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'Código expirado.';
    RETURN;
  END IF;

  IF v_row.pin <> p_pin THEN
    RETURN QUERY SELECT false, 'Código incorrecto.';
    RETURN;
  END IF;

  UPDATE public.miembros_taller
  SET email_verificado = true
  WHERE auth_user_id = p_user_id
    AND taller_id = p_taller_id;

  DELETE FROM public.verificaciones_email
  WHERE user_id = p_user_id
    AND taller_id = p_taller_id;

  RETURN QUERY SELECT true, 'Correo verificado correctamente.';
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_pin(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_pin(uuid, uuid, text) TO service_role;
