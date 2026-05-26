-- TallerCloud: agrega cliente_id (FK a clientes) y cliente_telefono a ventas
-- Permite vincular ventas del POS a un cliente registrado (sistema de recompensas futuro)
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS cliente_id       UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;

CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id
  ON ventas(taller_id, cliente_id)
  WHERE cliente_id IS NOT NULL;
