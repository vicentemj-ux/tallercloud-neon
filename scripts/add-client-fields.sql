-- Agregar columnas para gestión mejorada de clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono_secundario VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notas TEXT;
