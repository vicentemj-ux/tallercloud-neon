-- Add taller_id to all tables and create secure RLS policies

-- 1. Add taller_id to clientes table (if not exists)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS taller_id UUID REFERENCES taller_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_clientes_taller_id ON clientes(taller_id);

-- 2. Add taller_id to reparaciones table (if not exists)
ALTER TABLE reparaciones ADD COLUMN IF NOT EXISTS taller_id UUID REFERENCES taller_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reparaciones_taller_id ON reparaciones(taller_id);

-- 3. Add taller_id to tecnicos table (if not exists)
ALTER TABLE tecnicos ADD COLUMN IF NOT EXISTS taller_id UUID REFERENCES taller_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tecnicos_taller_id ON tecnicos(taller_id);

-- 4. Add taller_id to cambios_reparaciones table (if not exists)
ALTER TABLE cambios_reparaciones ADD COLUMN IF NOT EXISTS taller_id UUID REFERENCES taller_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cambios_reparaciones_taller_id ON cambios_reparaciones(taller_id);

-- 5. Add taller_id to configuracion_taller table (if not exists)
ALTER TABLE configuracion_taller ADD COLUMN IF NOT EXISTS taller_id UUID REFERENCES taller_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_configuracion_taller_taller_id ON configuracion_taller(taller_id);

-- Enable RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reparaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambios_reparaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_taller ENABLE ROW LEVEL SECURITY;

-- Drop existing insecure policies
DROP POLICY IF EXISTS "allow_all" ON clientes;
DROP POLICY IF EXISTS "allow_all" ON reparaciones;
DROP POLICY IF EXISTS "allow_all" ON tecnicos;
DROP POLICY IF EXISTS "allow_all" ON cambios_reparaciones;
DROP POLICY IF EXISTS "allow_all" ON configuracion_taller;

-- Create secure RLS policies for clientes
CREATE POLICY "clientes_select_own_taller" ON clientes FOR SELECT 
  USING (taller_id = auth.uid());
CREATE POLICY "clientes_insert_own_taller" ON clientes FOR INSERT 
  WITH CHECK (taller_id = auth.uid());
CREATE POLICY "clientes_update_own_taller" ON clientes FOR UPDATE 
  USING (taller_id = auth.uid());
CREATE POLICY "clientes_delete_own_taller" ON clientes FOR DELETE 
  USING (taller_id = auth.uid());

-- Create secure RLS policies for reparaciones
CREATE POLICY "reparaciones_select_own_taller" ON reparaciones FOR SELECT 
  USING (taller_id = auth.uid());
CREATE POLICY "reparaciones_insert_own_taller" ON reparaciones FOR INSERT 
  WITH CHECK (taller_id = auth.uid());
CREATE POLICY "reparaciones_update_own_taller" ON reparaciones FOR UPDATE 
  USING (taller_id = auth.uid());
CREATE POLICY "reparaciones_delete_own_taller" ON reparaciones FOR DELETE 
  USING (taller_id = auth.uid());

-- Create secure RLS policies for tecnicos
CREATE POLICY "tecnicos_select_own_taller" ON tecnicos FOR SELECT 
  USING (taller_id = auth.uid());
CREATE POLICY "tecnicos_insert_own_taller" ON tecnicos FOR INSERT 
  WITH CHECK (taller_id = auth.uid());
CREATE POLICY "tecnicos_update_own_taller" ON tecnicos FOR UPDATE 
  USING (taller_id = auth.uid());
CREATE POLICY "tecnicos_delete_own_taller" ON tecnicos FOR DELETE 
  USING (taller_id = auth.uid());

-- Create secure RLS policies for cambios_reparaciones
CREATE POLICY "cambios_select_own_taller" ON cambios_reparaciones FOR SELECT 
  USING (taller_id = auth.uid());
CREATE POLICY "cambios_insert_own_taller" ON cambios_reparaciones FOR INSERT 
  WITH CHECK (taller_id = auth.uid());

-- Create secure RLS policies for configuracion_taller
CREATE POLICY "config_select_own_taller" ON configuracion_taller FOR SELECT 
  USING (taller_id = auth.uid());
CREATE POLICY "config_insert_own_taller" ON configuracion_taller FOR INSERT 
  WITH CHECK (taller_id = auth.uid());
CREATE POLICY "config_update_own_taller" ON configuracion_taller FOR UPDATE 
  USING (taller_id = auth.uid());
