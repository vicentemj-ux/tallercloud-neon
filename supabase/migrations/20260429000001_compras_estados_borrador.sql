-- ============================================================
-- MIGRACIÓN: Actualizar estados de órdenes de compra + columnas extra
-- Agrega borrador, en_transito y campos de auditoría
-- ============================================================

-- 1. Agregar columna errores_recepcion si no existe (usada por código existente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordenes_compra' AND column_name = 'errores_recepcion'
  ) THEN
    ALTER TABLE ordenes_compra ADD COLUMN errores_recepcion JSONB DEFAULT NULL;
  END IF;
END $$;

-- 2. Agregar columna custodio (quién creó/emitió la orden)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordenes_compra' AND column_name = 'custodio'
  ) THEN
    ALTER TABLE ordenes_compra ADD COLUMN custodio TEXT DEFAULT NULL;
  END IF;
END $$;

-- 3. Actualizar CHECK constraint de estatus para incluir borrador y en_transito
DO $$
BEGIN
  -- Eliminar constraint anterior si existe
  ALTER TABLE ordenes_compra
    DROP CONSTRAINT IF EXISTS ordenes_compra_estatus_check;

  -- Agregar nuevo constraint con todos los estados
  ALTER TABLE ordenes_compra
    ADD CONSTRAINT ordenes_compra_estatus_check
    CHECK (estatus IN ('borrador','en_transito','pendiente','recibida','parcial','cancelada'));
END $$;
