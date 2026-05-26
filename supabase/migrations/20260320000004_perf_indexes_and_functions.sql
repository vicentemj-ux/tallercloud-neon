-- =============================================================
-- PERF-06: Índices compuestos para queries frecuentes
-- PERF-07: RPC get_dashboard_stats — agrega en DB, sin descargar filas
-- PERF-09: RPC get_next_folio — MAX() en DB, sin descargar todos los folios
-- =============================================================

-- ─── PERF-06+18: Índices de columnas frecuentes y FK ─────────────────────────

-- reparaciones
CREATE INDEX IF NOT EXISTS idx_rep_taller_estatus
  ON reparaciones (taller_id, estatus);

CREATE INDEX IF NOT EXISTS idx_rep_taller_created
  ON reparaciones (taller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_taller_updated
  ON reparaciones (taller_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_rep_taller_cliente
  ON reparaciones (taller_id, cliente_id);

-- ventas
CREATE INDEX IF NOT EXISTS idx_ventas_taller_created
  ON ventas (taller_id, created_at DESC);

-- movimientos_caja
CREATE INDEX IF NOT EXISTS idx_mov_taller_tipo_fecha
  ON movimientos_caja (taller_id, tipo, fecha DESC);

-- clientes (búsqueda por nombre)
CREATE INDEX IF NOT EXISTS idx_clientes_taller_nombre
  ON clientes (taller_id, nombre);

-- caja
CREATE INDEX IF NOT EXISTS idx_caja_taller_estado_fecha
  ON caja (taller_id, estado, fecha_apertura DESC);


-- PERF-18: Índices en FK para acelerar joins (reparaciones → clientes, etc.)
CREATE INDEX IF NOT EXISTS idx_rep_cliente_id
  ON reparaciones (cliente_id);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta_id
  ON detalle_ventas (venta_id);

CREATE INDEX IF NOT EXISTS idx_detalle_ventas_producto_id
  ON detalle_ventas (producto_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_id
  ON movimientos_caja (caja_id);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_ref_id
  ON movimientos_caja (referencia_id);

CREATE INDEX IF NOT EXISTS idx_cambios_rep_reparacion_id
  ON cambios_reparaciones (reparacion_id);


-- ─── PERF-07: Dashboard stats con SUM en DB ──────────────────────────────────

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id    UUID,
  p_first_of_month TIMESTAMPTZ,
  p_seven_days_ago TIMESTAMPTZ
)
RETURNS TABLE (
  en_proceso     BIGINT,
  listos         BIGINT,
  ventas_pdv     NUMERIC,
  cobros_rep     NUMERIC,
  urgentes       BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Reparaciones en proceso
    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')) AS en_proceso,

    -- Listas para entregar
    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id = p_taller_id
        AND estatus = 'Listo') AS listos,

    -- Ventas PDV del mes (SUM, no rows)
    COALESCE(
      (SELECT SUM(total) FROM ventas
        WHERE taller_id = p_taller_id
          AND created_at >= p_first_of_month), 0
    ) AS ventas_pdv,

    -- Cobros de reparaciones del mes (SUM, no rows)
    COALESCE(
      (SELECT SUM(monto) FROM movimientos_caja
        WHERE taller_id = p_taller_id
          AND tipo IN ('anticipo_reparacion','liquidacion_reparacion')
          AND fecha >= p_first_of_month), 0
    ) AS cobros_rep,

    -- Urgentes: activas sin actualizar hace 7+ días
    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')
        AND updated_at < p_seven_days_ago) AS urgentes;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;


-- ─── PERF-09: Siguiente folio con MAX() en DB ─────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_folio(
  p_taller_id UUID,
  p_prefix    TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(
          REGEXP_REPLACE(folio, '^' || p_prefix, ''),
          ''
        ) AS INTEGER
      )
    ), 0
  )
  FROM reparaciones
  WHERE taller_id = p_taller_id
    AND folio LIKE p_prefix || '%'
    AND folio ~ ('^' || p_prefix || '[0-9]+$');
$$;

GRANT EXECUTE ON FUNCTION get_next_folio(UUID, TEXT) TO authenticated;
