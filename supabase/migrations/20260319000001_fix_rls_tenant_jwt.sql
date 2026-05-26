-- =============================================================
-- FIX SEC-05: Políticas RLS corregidas para auth custom (JWT claims)
--
-- Problema anterior: USING (taller_id = auth.uid())
--   → auth.uid() siempre es NULL porque el app usa auth custom
--     por cookies, no Supabase Auth.
--
-- Solución: El nuevo tenant-client.ts genera un JWT firmado con
--   SUPABASE_JWT_SECRET que incluye taller_id en los claims.
--   Las políticas leen ese claim con auth.jwt()->>'taller_id'.
--
-- IMPORTANTE: Ejecutar DESPUÉS de haber configurado SUPABASE_JWT_SECRET
--   en Vercel y de haber migrado las Server Actions a createTenantClient().
-- =============================================================

-- ---------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "clientes_select_own_taller" ON clientes;
DROP POLICY IF EXISTS "clientes_insert_own_taller" ON clientes;
DROP POLICY IF EXISTS "clientes_update_own_taller" ON clientes;
DROP POLICY IF EXISTS "clientes_delete_own_taller" ON clientes;
DROP POLICY IF EXISTS "allow_all_select_clientes" ON clientes;
DROP POLICY IF EXISTS "allow_all_insert_clientes" ON clientes;
DROP POLICY IF EXISTS "allow_all_update_clientes" ON clientes;
DROP POLICY IF EXISTS "allow_all_delete_clientes" ON clientes;

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select" ON clientes FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "clientes_insert" ON clientes FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "clientes_update" ON clientes FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "clientes_delete" ON clientes FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- REPARACIONES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "reparaciones_select_own_taller" ON reparaciones;
DROP POLICY IF EXISTS "reparaciones_insert_own_taller" ON reparaciones;
DROP POLICY IF EXISTS "reparaciones_update_own_taller" ON reparaciones;
DROP POLICY IF EXISTS "reparaciones_delete_own_taller" ON reparaciones;
DROP POLICY IF EXISTS "allow_all_select_reparaciones" ON reparaciones;
DROP POLICY IF EXISTS "allow_all_insert_reparaciones" ON reparaciones;
DROP POLICY IF EXISTS "allow_all_update_reparaciones" ON reparaciones;
DROP POLICY IF EXISTS "allow_all_delete_reparaciones" ON reparaciones;

ALTER TABLE reparaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reparaciones_select" ON reparaciones FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "reparaciones_insert" ON reparaciones FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "reparaciones_update" ON reparaciones FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "reparaciones_delete" ON reparaciones FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- TECNICOS
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "tecnicos_select_own_taller" ON tecnicos;
DROP POLICY IF EXISTS "tecnicos_insert_own_taller" ON tecnicos;
DROP POLICY IF EXISTS "tecnicos_update_own_taller" ON tecnicos;
DROP POLICY IF EXISTS "tecnicos_delete_own_taller" ON tecnicos;

ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tecnicos_select" ON tecnicos FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "tecnicos_insert" ON tecnicos FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "tecnicos_update" ON tecnicos FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "tecnicos_delete" ON tecnicos FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- CAMBIOS_REPARACIONES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "cambios_select_own_taller" ON cambios_reparaciones;
DROP POLICY IF EXISTS "cambios_insert_own_taller" ON cambios_reparaciones;

ALTER TABLE cambios_reparaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cambios_select" ON cambios_reparaciones FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "cambios_insert" ON cambios_reparaciones FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "cambios_update" ON cambios_reparaciones FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "cambios_delete" ON cambios_reparaciones FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- CONFIGURACION_TALLER
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "config_select_own_taller" ON configuracion_taller;
DROP POLICY IF EXISTS "config_insert_own_taller" ON configuracion_taller;
DROP POLICY IF EXISTS "config_update_own_taller" ON configuracion_taller;

ALTER TABLE configuracion_taller ENABLE ROW LEVEL SECURITY;

CREATE POLICY "config_select" ON configuracion_taller FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "config_insert" ON configuracion_taller FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "config_update" ON configuracion_taller FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- PRODUCTOS
-- ---------------------------------------------------------------
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_select" ON productos;
DROP POLICY IF EXISTS "productos_insert" ON productos;
DROP POLICY IF EXISTS "productos_update" ON productos;
DROP POLICY IF EXISTS "productos_delete" ON productos;

CREATE POLICY "productos_select" ON productos FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "productos_insert" ON productos FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "productos_update" ON productos FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "productos_delete" ON productos FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- VENTAS
-- ---------------------------------------------------------------
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ventas_select" ON ventas;
DROP POLICY IF EXISTS "ventas_insert" ON ventas;
DROP POLICY IF EXISTS "ventas_update" ON ventas;
DROP POLICY IF EXISTS "ventas_delete" ON ventas;

CREATE POLICY "ventas_select" ON ventas FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "ventas_insert" ON ventas FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "ventas_update" ON ventas FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "ventas_delete" ON ventas FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- CAJA
-- ---------------------------------------------------------------
ALTER TABLE caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caja_select" ON caja;
DROP POLICY IF EXISTS "caja_insert" ON caja;
DROP POLICY IF EXISTS "caja_update" ON caja;
DROP POLICY IF EXISTS "caja_delete" ON caja;

CREATE POLICY "caja_select" ON caja FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "caja_insert" ON caja FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "caja_update" ON caja FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "caja_delete" ON caja FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- MOVIMIENTOS_CAJA
-- ---------------------------------------------------------------
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "movimientos_select" ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_insert" ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_update" ON movimientos_caja;
DROP POLICY IF EXISTS "movimientos_delete" ON movimientos_caja;

CREATE POLICY "movimientos_select" ON movimientos_caja FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "movimientos_insert" ON movimientos_caja FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "movimientos_update" ON movimientos_caja FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "movimientos_delete" ON movimientos_caja FOR DELETE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);


-- ---------------------------------------------------------------
-- TALLER_USERS: solo el propio taller puede ver/editar su perfil
-- Lectura amplia necesaria para el proceso de login (auth.ts)
-- que usa createAdminClient() y no pasa por RLS.
-- ---------------------------------------------------------------
ALTER TABLE taller_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taller_users_select" ON taller_users;
DROP POLICY IF EXISTS "taller_users_update" ON taller_users;

CREATE POLICY "taller_users_select" ON taller_users FOR SELECT
  USING (id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "taller_users_update" ON taller_users FOR UPDATE
  USING (id = (auth.jwt() ->> 'taller_id')::uuid);
