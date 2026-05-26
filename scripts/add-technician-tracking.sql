-- Add technician_id column to reparaciones (without foreign key constraint)
ALTER TABLE reparaciones ADD COLUMN tecnico_id UUID;

-- Create change log table
CREATE TABLE cambios_reparaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacion_id UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  tipo_cambio VARCHAR(50) NOT NULL,
  descripcion TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_cambios_reparacion_id ON cambios_reparaciones(reparacion_id);
CREATE INDEX idx_cambios_created_at ON cambios_reparaciones(created_at);
