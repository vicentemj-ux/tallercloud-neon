-- TallerCloud Database Schema
-- Tables: clientes and reparaciones

-- ========================
-- CLIENTES TABLE
-- ========================
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  correo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Permissive policies (will be scoped to user_id later when auth is added)
CREATE POLICY "allow_all_select_clientes" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "allow_all_insert_clientes" ON public.clientes FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update_clientes" ON public.clientes FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete_clientes" ON public.clientes FOR DELETE USING (true);


-- ========================
-- REPARACIONES TABLE
-- ========================
CREATE TABLE IF NOT EXISTS public.reparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  numero_serie TEXT,
  falla TEXT NOT NULL,
  precio_estimado NUMERIC(10,2) DEFAULT 0,
  anticipo NUMERIC(10,2) DEFAULT 0,
  estatus TEXT NOT NULL DEFAULT 'Recibido',
  tecnico TEXT DEFAULT 'Pendiente',
  sucursal TEXT DEFAULT 'Roma Norte',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reparaciones ENABLE ROW LEVEL SECURITY;

-- Permissive policies
CREATE POLICY "allow_all_select_reparaciones" ON public.reparaciones FOR SELECT USING (true);
CREATE POLICY "allow_all_insert_reparaciones" ON public.reparaciones FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update_reparaciones" ON public.reparaciones FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete_reparaciones" ON public.reparaciones FOR DELETE USING (true);


-- ========================
-- INDEX for fast folio lookups
-- ========================
CREATE INDEX IF NOT EXISTS idx_reparaciones_folio ON public.reparaciones(folio);
CREATE INDEX IF NOT EXISTS idx_reparaciones_estatus ON public.reparaciones(estatus);
CREATE INDEX IF NOT EXISTS idx_reparaciones_created ON public.reparaciones(created_at DESC);
