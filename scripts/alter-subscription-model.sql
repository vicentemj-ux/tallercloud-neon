-- ============================================================
-- Migración: Nuevo modelo de suscripción
-- plan_tipo: 'prueba' | 'activo' | 'suspendido'
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Normalizar valores existentes a minúsculas
UPDATE taller_users SET plan_tipo = 'prueba'     WHERE LOWER(plan_tipo) = 'prueba';
UPDATE taller_users SET plan_tipo = 'activo'     WHERE LOWER(plan_tipo) = 'premium';
UPDATE taller_users SET plan_tipo = 'suspendido' WHERE LOWER(plan_tipo) = 'suspendido';

-- 2. Rellenar fecha_vencimiento_plan para cuentas prueba sin fecha
UPDATE taller_users
SET fecha_vencimiento_plan = (created_at + INTERVAL '30 days')
WHERE plan_tipo = 'prueba'
  AND fecha_vencimiento_plan IS NULL;

-- 3. Agregar columna dias_prueba si no existe
ALTER TABLE taller_users
  ADD COLUMN IF NOT EXISTS dias_prueba INTEGER NOT NULL DEFAULT 30;

-- 4. Asegurarse que plan_tipo tiene valor por defecto
ALTER TABLE taller_users
  ALTER COLUMN plan_tipo SET DEFAULT 'prueba';

-- Verificar resultado
SELECT id, nombre_taller, plan_tipo, fecha_vencimiento_plan, dias_prueba
FROM taller_users
ORDER BY created_at DESC
LIMIT 20;
