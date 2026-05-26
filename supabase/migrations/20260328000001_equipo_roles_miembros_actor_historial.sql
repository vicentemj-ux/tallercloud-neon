-- =============================================================================
-- 1) Quién hizo el cambio: nombre visible en historial (no placeholder genérico)
-- 2) Catálogo global roles_taller + miembros_taller (MVP máx. 5 por taller)
-- =============================================================================

-- --- historial: snapshot del nombre del actor --------------------------------
ALTER TABLE public.historial_reparacion
  ADD COLUMN IF NOT EXISTS actor_nombre text;

COMMENT ON COLUMN public.historial_reparacion.actor_nombre IS
  'Nombre para mostrar de quien registró el evento (propietario o miembro).';

-- Catálogo de roles (global, sin taller_id)
CREATE TABLE IF NOT EXISTS public.roles_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('estandar', 'especial')),
  permisos jsonb NOT NULL DEFAULT '[]'::jsonb,
  orden int NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.roles_taller IS 'Roles predefinidos para miembros del equipo (MVP).';

INSERT INTO public.roles_taller (slug, nombre, categoria, permisos, orden) VALUES
  ('administrador', 'Administrador', 'estandar',
   '["all","configuracion","equipo","reportes","finanzas","caja","reparaciones","ventas","inventario","clientes","bitacora"]'::jsonb, 1),
  ('tecnico_estandar', 'Técnico Estándar', 'estandar',
   '["reparaciones","ventas","inventario","clientes","caja","bitacora"]'::jsonb, 2),
  ('vendedor_recepcion', 'Vendedor / Recepción', 'estandar',
   '["reparaciones_read","ventas","caja_ventas","clientes","nuevo_ticket"]'::jsonb, 3),
  ('reparador', 'Reparador', 'especial',
   '["reparaciones_mias","notas_tecnicas"]'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING;

-- Miembros del equipo (Supabase Auth user_id + taller)
CREATE TABLE IF NOT EXISTS public.miembros_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  email text NOT NULL,
  nombre text NOT NULL,
  rol_id uuid NOT NULL REFERENCES public.roles_taller(id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_miembros_taller_taller ON public.miembros_taller(taller_id);
CREATE INDEX IF NOT EXISTS idx_miembros_taller_auth ON public.miembros_taller(auth_user_id);

COMMENT ON TABLE public.miembros_taller IS 'Usuarios creados vía Auth vinculados al taller (máx. 5 activos MVP).';

ALTER TABLE public.miembros_taller ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "miembros_taller_select" ON public.miembros_taller;
DROP POLICY IF EXISTS "miembros_taller_insert" ON public.miembros_taller;
DROP POLICY IF EXISTS "miembros_taller_update" ON public.miembros_taller;
DROP POLICY IF EXISTS "miembros_taller_delete" ON public.miembros_taller;

CREATE POLICY "miembros_taller_select" ON public.miembros_taller FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "miembros_taller_insert" ON public.miembros_taller FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "miembros_taller_update" ON public.miembros_taller FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "miembros_taller_delete" ON public.miembros_taller FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

-- roles_taller: lectura para usuarios autenticados del tenant
ALTER TABLE public.roles_taller ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles_taller_select" ON public.roles_taller;
CREATE POLICY "roles_taller_select" ON public.roles_taller FOR SELECT
  USING (true);

GRANT SELECT ON public.roles_taller TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.miembros_taller TO authenticated;

-- Trigger basal: actor_nombre desde propietario del taller
CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_label text;
BEGIN
  SELECT COALESCE(
    NULLIF(trim(tu.nombre_propietario), ''),
    NULLIF(trim(tu.email), ''),
    'Usuario'
  )
  INTO actor_label
  FROM public.taller_users tu
  WHERE tu.id = NEW.taller_id;

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
    'Ingreso del equipo al sistema',
    COALESCE(NEW.created_at, NOW()),
    actor_label
  );
  RETURN NEW;
END;
$$;

-- Backfill actor_nombre en historial existente
UPDATE public.historial_reparacion h
SET actor_nombre = COALESCE(
  NULLIF(trim(tu.nombre_propietario), ''),
  NULLIF(trim(tu.email), ''),
  'Usuario'
)
FROM public.taller_users tu
WHERE h.taller_id = tu.id
  AND (h.actor_nombre IS NULL OR trim(h.actor_nombre) = '');
