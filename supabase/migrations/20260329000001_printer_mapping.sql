-- supabase/migrations/20260329000001_printer_mapping.sql
-- Agrega columnas de mapeo de impresoras por tipo al taller

ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS impresora_ticket    text,
  ADD COLUMN IF NOT EXISTS impresora_etiqueta  text,
  ADD COLUMN IF NOT EXISTS impresora_documento text;

COMMENT ON COLUMN public.configuracion_taller.impresora_ticket    IS 'Nombre exacto de impresora térmica para tickets (reparaciones, abonos, corte).';
COMMENT ON COLUMN public.configuracion_taller.impresora_etiqueta  IS 'Nombre exacto de impresora de etiquetas (2×1 pulgadas).';
COMMENT ON COLUMN public.configuracion_taller.impresora_documento IS 'Nombre exacto de impresora para documentos tamaño Carta/A4.';
