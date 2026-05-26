-- Migration: 20260501000003_atomic_folio_sequence.sql
--
-- Crea una secuencia por tenant para generar folios atómicos
-- y una función RPC para obtener el siguiente folio de forma segura.

-- Tabla para almacenar el contador atómico de folios por tenant
CREATE TABLE IF NOT EXISTS public.taller_folio_counters (
  taller_id    text        PRIMARY KEY,
  ventas_count integer     NOT NULL DEFAULT 0
);

-- Función atómica para obtener y aumentar el contador
CREATE OR REPLACE FUNCTION public.get_next_venta_folio(p_taller_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Insertar si no existe (inicializa en 0)
  INSERT INTO public.taller_folio_counters (taller_id, ventas_count)
  VALUES (p_taller_id, 0)
  ON CONFLICT (taller_id) DO NOTHING;

  -- Aumentar atómicamente y obtener el nuevo valor
  UPDATE public.taller_folio_counters
  SET ventas_count = ventas_count + 1
  WHERE taller_id = p_taller_id
  RETURNING ventas_count INTO v_count;

  RETURN 'V-' || LPAD(v_count::text, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_venta_folio(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_venta_folio(text) TO anon;
GRANT SELECT, INSERT, UPDATE ON public.taller_folio_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.taller_folio_counters TO anon;
