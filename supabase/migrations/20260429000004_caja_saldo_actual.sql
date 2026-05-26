-- ============================================================
-- MIGRACIÓN: Agregar columna saldo_actual a tabla caja
-- Esta columna es necesaria para registrar egresos (compras usadas,
-- gastos, anticipos de reparación) verificando fondos disponibles.
-- ============================================================

-- 1. Agregar columna si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caja' AND column_name = 'saldo_actual'
  ) THEN
    ALTER TABLE caja ADD COLUMN saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Inicializar saldo_actual para cajas existentes basándose en
--    monto_inicial + total_efectivo (aproximación del saldo disponible)
UPDATE caja
SET saldo_actual = COALESCE(monto_inicial, 0) + COALESCE(total_efectivo, 0)
WHERE saldo_actual = 0;
