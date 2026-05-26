-- Add unique constraint on telefono for upsert support
ALTER TABLE clientes ADD CONSTRAINT clientes_telefono_unique UNIQUE (telefono);
