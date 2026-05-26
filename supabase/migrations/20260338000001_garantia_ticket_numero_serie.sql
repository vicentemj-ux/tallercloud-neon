-- Incluye IMEI/serie en el comprobante público de garantía.
CREATE OR REPLACE FUNCTION public.get_garantia_ticket(
  p_ticket_id UUID,
  p_last4     TEXT
)
RETURNS TABLE (
  folio               TEXT,
  marca               TEXT,
  modelo              TEXT,
  numero_serie        TEXT,
  falla               TEXT,
  costo_total         NUMERIC,
  anticipo            NUMERIC,
  fecha_entrega       TIMESTAMPTZ,
  nombre_taller       TEXT,
  logo_url            TEXT,
  direccion           TEXT,
  telefono            TEXT,
  terminos_garantia   TEXT,
  pie_pagina          TEXT,
  tamano_papel        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_telefono TEXT;
  v_last4_db TEXT;
BEGIN
  SELECT c.telefono
    INTO v_telefono
    FROM reparaciones r
    JOIN clientes c ON c.id = r.cliente_id
   WHERE r.id = p_ticket_id
   LIMIT 1;

  IF v_telefono IS NULL THEN
    RETURN;
  END IF;

  v_last4_db := RIGHT(REGEXP_REPLACE(v_telefono, '[^0-9]', '', 'g'), 4);

  IF v_last4_db IS DISTINCT FROM TRIM(p_last4) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      r.folio::TEXT,
      r.marca::TEXT,
      r.modelo::TEXT,
      NULLIF(TRIM(r.numero_serie), '')::TEXT,
      r.falla::TEXT,
      COALESCE(r.costo_total, r.precio_estimado, 0)::NUMERIC,
      COALESCE(r.anticipo, 0)::NUMERIC,
      COALESCE(r.fecha_entrega, r.updated_at),
      COALESCE(NULLIF(TRIM(cfg.nombre_taller), ''), tu.nombre_taller, 'Mi Taller')::TEXT,
      cfg.logo_url::TEXT,
      NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(cfg.direccion), ''), NULLIF(TRIM(cfg.ciudad), ''), NULLIF(TRIM(cfg.estado), ''))), '')::TEXT,
      NULLIF(TRIM(cfg.telefono), '')::TEXT,
      COALESCE(cfg.terminos_garantia, 'Garantía de 30 días en reparaciones')::TEXT,
      NULLIF(TRIM(cfg.pie_pagina), '')::TEXT,
      COALESCE(NULLIF(TRIM(cfg.tamano_papel), ''), '80mm')::TEXT
    FROM reparaciones r
    JOIN clientes c ON c.id = r.cliente_id
    LEFT JOIN configuracion_taller cfg ON cfg.taller_id = r.taller_id
    LEFT JOIN taller_users tu ON tu.id = r.taller_id
   WHERE r.id = p_ticket_id
     AND UPPER(TRIM(COALESCE(r.estatus, ''))) LIKE '%ENTREG%'
   LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_garantia_ticket(UUID, TEXT) TO anon;
