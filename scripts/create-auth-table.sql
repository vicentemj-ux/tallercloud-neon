-- Create taller_users table for authentication
CREATE TABLE taller_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_propietario VARCHAR(255) NOT NULL,
  nombre_taller VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  taller_id INTEGER,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for email lookup
CREATE INDEX idx_taller_users_email ON taller_users(email);
CREATE INDEX idx_taller_users_taller_id ON taller_users(taller_id);
