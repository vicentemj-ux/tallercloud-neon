-- Drop tables with CASCADE to handle dependencies
DROP TABLE IF EXISTS reparacion_cambios CASCADE;
DROP TABLE IF EXISTS reparaciones CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS tecnicos CASCADE;
DROP TABLE IF EXISTS taller_users CASCADE;

-- Create taller_users table
CREATE TABLE taller_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nombre_taller VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  es_admin BOOLEAN DEFAULT false,
  plan_tipo VARCHAR(50) DEFAULT 'Prueba',
  fecha_vencimiento_plan TIMESTAMP,
  verification_token VARCHAR(255),
  verification_token_expires TIMESTAMP,
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP
);

-- Create tecnicos table
CREATE TABLE tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  estatus VARCHAR(50) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT now()
);

-- Create clientes table
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefono VARCHAR(20),
  ciudad VARCHAR(100),
  created_at TIMESTAMP DEFAULT now()
);

-- Create reparaciones table
CREATE TABLE reparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL,
  descripcion TEXT,
  estado VARCHAR(50) DEFAULT 'sin-asignar',
  prioridad VARCHAR(50) DEFAULT 'media',
  fecha_creacion TIMESTAMP DEFAULT now(),
  fecha_entrega_estimada TIMESTAMP,
  fecha_entrega_real TIMESTAMP,
  costo DECIMAL(10, 2),
  notas TEXT
);

-- Create reparacion_cambios table (bitácora)
CREATE TABLE reparacion_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacion_id UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(50),
  estado_nuevo VARCHAR(50),
  cambio_realizado_por VARCHAR(255),
  fecha_cambio TIMESTAMP DEFAULT now(),
  notas TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_taller_users_email ON taller_users(email);
CREATE INDEX idx_tecnicos_taller_id ON tecnicos(taller_id);
CREATE INDEX idx_clientes_taller_id ON clientes(taller_id);
CREATE INDEX idx_reparaciones_taller_id ON reparaciones(taller_id);
CREATE INDEX idx_reparaciones_cliente_id ON reparaciones(cliente_id);
CREATE INDEX idx_reparaciones_tecnico_id ON reparaciones(tecnico_id);
CREATE INDEX idx_reparacion_cambios_reparacion_id ON reparacion_cambios(reparacion_id);
CREATE INDEX idx_taller_users_es_admin ON taller_users(es_admin);
