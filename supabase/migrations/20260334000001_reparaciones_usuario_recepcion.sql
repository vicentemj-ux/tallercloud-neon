-- =============================================================================
-- Quién registró la orden: auth user al momento del INSERT (recepción)
-- =============================================================================

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS usuario_recepcion_id uuid;

COMMENT ON COLUMN public.reparaciones.usuario_recepcion_id IS
  'Usuario de Supabase Auth que creó el ticket (sesión activa al insertar).';

ALTER TABLE public.reparaciones
  DROP CONSTRAINT IF EXISTS reparaciones_usuario_recepcion_id_fkey;

ALTER TABLE public.reparaciones
  ADD CONSTRAINT reparaciones_usuario_recepcion_id_fkey
  FOREIGN KEY (usuario_recepcion_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reparaciones_usuario_recepcion
  ON public.reparaciones (usuario_recepcion_id)
  WHERE usuario_recepcion_id IS NOT NULL;

-- Trigger basal: actor_nombre según usuario_recepcion_id (miembro o propietario) o fallback taller
CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_label text;
  auth_uid uuid;
BEGIN
  auth_uid := NEW.usuario_recepcion_id;

  IF auth_uid IS NOT NULL THEN
    SELECT NULLIF(trim(m.nombre), '')
    INTO actor_label
    FROM public.miembros_taller m
    WHERE m.taller_id = NEW.taller_id
      AND m.auth_user_id = auth_uid
      AND m.activo = true
    LIMIT 1;

    IF actor_label IS NULL OR trim(actor_label) = '' THEN
      SELECT COALESCE(
        NULLIF(trim(tu.nombre_propietario), ''),
        NULLIF(trim(tu.email), ''),
        NULLIF(trim(tu.nombre_taller), '')
      )
      INTO actor_label
      FROM public.taller_users tu
      WHERE tu.id = auth_uid;
    END IF;
  END IF;

  IF actor_label IS NULL OR trim(actor_label) = '' THEN
    SELECT COALESCE(
      NULLIF(trim(tu.nombre_propietario), ''),
      NULLIF(trim(tu.email), ''),
      'Usuario'
    )
    INTO actor_label
    FROM public.taller_users tu
    WHERE tu.id = NEW.taller_id;
  END IF;

  INSERT INTO public.historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    fecha,
    actor_nombre
  ) VALUES (
    NEW.id,
    NEW.taller_id,
    NEW.taller_id,
    NULL,
    COALESCE(NULLIF(trim(NEW.estatus::text), ''), 'Recibido'),
    'Orden creada / Recibida',
    COALESCE(NEW.created_at, NOW()),
    actor_label
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reparaciones_historial_basal_insert() IS
  'Primer evento de auditoría al crear folio: recepción con nombre de quien abrió la sesión.';

UPDATE public.historial_reparacion h
SET nota_tecnica = 'Orden creada / Recibida'
WHERE trim(COALESCE(h.nota_tecnica, '')) = 'Ingreso del equipo al sistema';
