-- =============================================================================
-- historial_reparacion: permisos explícitos + políticas RLS para INSERT/SELECT
-- El cliente usa JWT custom (claim taller_id) con rol "authenticated" en el token.
-- =============================================================================

GRANT SELECT, INSERT ON public.historial_reparacion TO authenticated;
GRANT SELECT, INSERT ON public.historial_reparacion TO anon;

-- Reemplazar políticas para que apliquen a los roles que usa Supabase + PostgREST
DROP POLICY IF EXISTS "historial_reparacion_select" ON public.historial_reparacion;
DROP POLICY IF EXISTS "historial_reparacion_insert" ON public.historial_reparacion;

CREATE POLICY "historial_reparacion_select" ON public.historial_reparacion
  FOR SELECT
  TO authenticated, anon
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "historial_reparacion_insert" ON public.historial_reparacion
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

COMMENT ON POLICY "historial_reparacion_insert" ON public.historial_reparacion IS
  'INSERT permitido cuando taller_id del JWT coincide con la fila (tenant).';
