-- Compatibilidad: código y herramientas que esperan `created_at` (estándar Supabase).
-- La fuente de verdad sigue siendo `fecha`; `created_at` refleja el mismo instante.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'movimientos_caja'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD COLUMN created_at timestamptz GENERATED ALWAYS AS (fecha) STORED;
    COMMENT ON COLUMN public.movimientos_caja.created_at IS
      'Alias almacenado de fecha (misma marca de tiempo).';
  END IF;
END $$;
