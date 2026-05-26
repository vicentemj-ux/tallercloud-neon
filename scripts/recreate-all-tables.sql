-- Recreate all tables with proper structure

-- Drop existing tables if they exist (in correct order for foreign keys)
DROP TABLE IF EXISTS reparacion_cambios;
DROP TABLE IF EXISTS reparaciones;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS tecnicos;
DROP TABLE IF EXISTS taller_users;

-- Create taller_users table
CREATE TABLE taller_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre_taller VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  reset_password_token TEXT,
  reset_password_expires TIMESTAMP,
  plan_tipo VARCHAR(50) DEFAULT 'Prueba',
  fecha_vencimiento_plan TIMESTAMP DEFAULT (NOW() + INTERVAL '14 days'),
  es_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create clientes table
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create tecnicos table
CREATE TABLE tecnicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  estatus VARCHAR(50) DEFAULT 'Activo',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create reparaciones table
CREATE TABLE reparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL REFERENCES taller_users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id UUID REFERENCES tecnicos(id) ON DELETE SET NULL,
  descripcion TEXT,
  estado VARCHAR(50) DEFAULT 'Recibido',
  monto_total DECIMAL(10, 2),
  fecha_ingreso TIMESTAMP DEFAULT NOW(),
  fecha_finalizacion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create reparacion_cambios table
CREATE TABLE reparacion_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacion_id UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  campo_anterior TEXT,
  campo_nuevo TEXT,
  tipo_cambio VARCHAR(255),
  fecha_cambio TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_taller_users_email ON taller_users(email);
CREATE INDEX idx_clientes_taller_id ON clientes(taller_id);
CREATE INDEX idx_tecnicos_taller_id ON tecnicos(taller_id);
CREATE INDEX idx_reparaciones_taller_id ON reparaciones(taller_id);
CREATE INDEX idx_reparaciones_cliente_id ON reparaciones(cliente_id);
CREATE INDEX idx_reparaciones_tecnico_id ON reparaciones(tecnico_id);
