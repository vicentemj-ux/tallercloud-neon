-- ============================================================
-- Migración: campos de dispositivo en productos y trazabilidad
-- Ejecutar en Supabase SQL Editor
-- NOTA: Todos los ADD COLUMN usan IF NOT EXISTS — es seguro
--       correr este script múltiples veces.
-- ============================================================

-- ── Tabla: productos ─────────────────────────────────────────
-- Campos para soporte de dispositivos con IMEI/serie
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS es_equipo  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS imei_serie TEXT,
  ADD COLUMN IF NOT EXISTS color      TEXT,
  ADD COLUMN IF NOT EXISTS capacidad  TEXT,
  ADD COLUMN IF NOT EXISTS condicion  TEXT;

-- ── Tabla: detalle_ventas ─────────────────────────────────────
-- Trazabilidad de dispositivos vendidos
ALTER TABLE detalle_ventas
  ADD COLUMN IF NOT EXISTS imei_serie TEXT,
  ADD COLUMN IF NOT EXISTS color      TEXT,
  ADD COLUMN IF NOT EXISTS condicion  TEXT;

-- Verificar columnas agregadas a productos
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'productos'
  AND column_name IN ('es_equipo', 'imei_serie', 'color', 'capacidad', 'condicion')
ORDER BY column_name;
