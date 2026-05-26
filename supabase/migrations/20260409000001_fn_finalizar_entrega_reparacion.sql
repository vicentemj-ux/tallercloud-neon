-- Función atómica para finalizar entrega de reparación.
-- Combina en una sola transacción PostgreSQL:
--   1. Actualizar anticipo, estatus y fecha_entrega en reparaciones
--   2. Insertar fila en historial_reparacion
--
-- Esto elimina la condición de carrera donde la venta se registraba
-- pero el anticipo/estado del ticket quedaba inconsistente.

CREATE OR REPLACE FUNCTION finalizar_entrega_reparacion(
  p_repair_id       UUID,
  p_taller_id       UUID,
  p_nuevo_anticipo  NUMERIC,
  p_estado_anterior TEXT,
  p_nota_tecnica    TEXT,
  p_actor_nombre    TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE reparaciones
  SET
    anticipo      = p_nuevo_anticipo,
    estatus       = 'Entregado',
    fecha_entrega = NOW()
  WHERE id = p_repair_id AND taller_id = p_taller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reparacion_no_encontrada: id=%, taller=%', p_repair_id, p_taller_id;
  END IF;

  INSERT INTO historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    actor_nombre
  ) VALUES (
    p_repair_id,
    p_taller_id,
    p_taller_id,
    p_estado_anterior,
    'Entregado',
    NULLIF(TRIM(p_nota_tecnica), ''),
    p_actor_nombre
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
