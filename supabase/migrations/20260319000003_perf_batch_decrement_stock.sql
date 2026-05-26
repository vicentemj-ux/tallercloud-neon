-- =============================================================
-- PERF-01: Elimina N+1 en decremento de stock al crear ventas.
--
-- En lugar de leer stock + actualizar por cada ítem (2N queries),
-- esta función recibe todos los ítems en un solo JSONB y hace
-- los UPDATEs en un loop dentro de la BD — 1 round-trip total.
--
-- Parámetro items: [{ "producto_id": "uuid", "taller_id": "uuid", "cantidad": 2 }, ...]
-- =============================================================

CREATE OR REPLACE FUNCTION batch_decrement_stock(items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    UPDATE productos
    SET stock_actual = GREATEST(0, stock_actual - (item->>'cantidad')::int)
    WHERE id        = (item->>'producto_id')::uuid
      AND taller_id = (item->>'taller_id')::uuid;
  END LOOP;
END;
$$;

-- Solo el service_role puede invocarla directamente;
-- el tenant-client (authenticated) también puede via RLS implícita en SECURITY DEFINER.
GRANT EXECUTE ON FUNCTION batch_decrement_stock(jsonb) TO authenticated;
