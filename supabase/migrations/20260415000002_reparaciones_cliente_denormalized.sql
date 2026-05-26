-- Migration: denormalize cliente_nombre / cliente_telefono on reparaciones
-- Purpose: enable .or() PostgREST search across folio, cliente_nombre,
--          cliente_telefono, marca, and modelo without a JOIN.
-- Date: 2026-04-15

-- 1. Add columns
ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS cliente_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;

-- 2. Backfill existing rows
UPDATE reparaciones r
   SET cliente_nombre    = c.nombre,
       cliente_telefono  = c.telefono
  FROM clientes c
 WHERE c.id = r.cliente_id
   AND (r.cliente_nombre IS NULL OR r.cliente_telefono IS NULL);

-- 3. Trigger function: sync on INSERT
CREATE OR REPLACE FUNCTION reparaciones_sync_cliente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nombre, telefono
      INTO NEW.cliente_nombre, NEW.cliente_telefono
      FROM clientes
     WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger (BEFORE INSERT OR UPDATE OF cliente_id — syncs denormalized
--    fields when client assignment changes. Using UPDATE OF cliente_id avoids
--    unnecessary lookups when only status/price/etc. change)
DROP TRIGGER IF EXISTS trg_reparaciones_sync_cliente ON reparaciones;
CREATE TRIGGER trg_reparaciones_sync_cliente
  BEFORE INSERT OR UPDATE OF cliente_id ON reparaciones
  FOR EACH ROW
  EXECUTE FUNCTION reparaciones_sync_cliente();

-- 5. B-tree index on cliente_telefono for fast substring / equality lookups
CREATE INDEX IF NOT EXISTS idx_reparaciones_cliente_telefono
  ON reparaciones (cliente_telefono);
