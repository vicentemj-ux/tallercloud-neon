-- =============================================================
-- FIX: Acceso público al tracking de reparaciones
--
-- Problema: RLS bloquea la consulta porque auth.uid() = NULL
--           para usuarios no autenticados.
--
-- Solución: Función SECURITY DEFINER que valida los últimos 4
--           dígitos del teléfono DENTRO de la BD y solo devuelve
--           los campos públicos necesarios si la validación pasa.
--           El teléfono nunca sale de la base de datos.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_tracking_info(
  p_ticket_id UUID,
  p_last4     TEXT
)
RETURNS TABLE (
  id               UUID,
  folio            TEXT,
  marca            TEXT,
  modelo           TEXT,
  tipo_equipo      TEXT,
  numero_serie     TEXT,
  falla            TEXT,
  precio_estimado  NUMERIC,
  estatus          TEXT,
  fotos            TEXT,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER          -- corre como el dueño de la función, esquiva RLS
SET search_path = public  -- evita search_path hijacking
AS $$
DECLARE
  v_telefono TEXT;
  v_last4_db TEXT;
BEGIN
  -- 1. Obtener el teléfono del cliente asociado a esta reparación
  SELECT c.telefono
    INTO v_telefono
    FROM reparaciones r
    JOIN clientes c ON c.id = r.cliente_id
   WHERE r.id = p_ticket_id
   LIMIT 1;

  -- 2. Si no existe la reparación, no devolvemos nada
  IF v_telefono IS NULL THEN
    RETURN;
  END IF;

  -- 3. Extraer solo dígitos y tomar los últimos 4
  v_last4_db := RIGHT(REGEXP_REPLACE(v_telefono, '[^0-9]', '', 'g'), 4);

  -- 4. Validar. Si no coincide, no devolvemos nada (sin mensajes de error
  --    que ayuden a enumerar registros)
  IF v_last4_db IS DISTINCT FROM TRIM(p_last4) THEN
    RETURN;
  END IF;

  -- 5. Coincide: devolver solo los campos públicos necesarios
  RETURN QUERY
    SELECT
      r.id,
      r.folio,
      r.marca,
      r.modelo,
      r.tipo_equipo,
      r.numero_serie,
      r.falla,
      r.precio_estimado,
      r.estatus,
      r.fotos::TEXT,
      r.created_at,
      r.updated_at
    FROM reparaciones r
   WHERE r.id = p_ticket_id;
END;
$$;

-- Permitir que el rol anon (peticiones sin sesión) ejecute esta función
GRANT EXECUTE ON FUNCTION public.get_tracking_info(UUID, TEXT) TO anon;

-- Revocar acceso directo a las tablas para el rol anon (ya lo bloquea RLS,
-- pero esto es defensa en profundidad)
REVOKE SELECT ON public.reparaciones FROM anon;
REVOKE SELECT ON public.clientes FROM anon;
