-- Información fiscal para clientes (CFDI 4.0)
-- Todos los campos son opcionales — el sistema no obliga a llenarlos.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rfc                 TEXT,
  ADD COLUMN IF NOT EXISTS razon_social        TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal      TEXT,
  ADD COLUMN IF NOT EXISTS uso_cfdi            TEXT;
