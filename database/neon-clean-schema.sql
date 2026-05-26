-- TallerCloud Neon Clean Schema
-- Generated from supabase/migrations with Supabase-specific ACL/RLS/Storage/Auth statements removed.
-- Compatible target: PostgreSQL (Neon).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ===== MIGRATION: 20250303000000_create_productos.sql =====

-- TallerCloud: tabla productos para el módulo de Inventario
-- Multi-tenant por taller_id (taller_users = CDSE/Reparatech, etc.)

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references taller_users(id) on delete cascade,
  nombre text not null,
  sku text,
  codigo_barras text,
  imagen_url text,
  costo numeric not null default 0,
  precio_venta numeric not null default 0,
  stock_actual int not null default 1,
  stock_minimo int not null default 5,
  es_equipo boolean not null default false,
  imei_serie text,
  color text,
  created_at timestamptz not null default now()
);

-- Índices para consultas por taller y búsquedas
create index idx_productos_taller_id on productos(taller_id);
create index idx_productos_nombre on productos(taller_id, nombre);
create index idx_productos_created_at on productos(taller_id, created_at desc);

-- SKU único por taller (varios NULL permitidos)
create unique index idx_productos_taller_sku on productos(taller_id, sku)
  where sku is not null;

-- Código de barras único por taller (varios NULL permitidos)
create unique index idx_productos_taller_codigo_barras on productos(taller_id, codigo_barras)
  where codigo_barras is not null;

-- Comentarios para documentación
comment on table productos is 'Productos del inventario por taller (TallerCloud)';
comment on column productos.taller_id is 'Tenant: referencia a taller_users';
comment on column productos.stock_minimo is 'Umbral para alertas de reabastecimiento';
comment on column productos.es_equipo is 'Si true, se usan imei_serie y color';

-- ===== MIGRATION: 20260304000001_oauth_nullable_password.sql =====

-- Usuarios que solo inician sesión con OAuth (Google) no tienen contraseña local.
ALTER TABLE taller_users
  ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON COLUMN taller_users.password_hash IS
  'Hash bcrypt; NULL si el acceso es solo OAuth (Google).';

-- ===== MIGRATION: 20260304000002_add_alert_preferences.sql =====

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS alertas_stock_bajo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reportes_cierre_caja BOOLEAN NOT NULL DEFAULT false;

-- ===== MIGRATION: 20260319000001_fix_rls_tenant_jwt.sql =====

-- =============================================================
-- FIX SEC-05: Políticas RLS corregidas para auth custom (JWT claims)
--
--
-- Solución: El nuevo tenant-client.ts genera un JWT firmado con
--   SUPABASE_JWT_SECRET que incluye taller_id en los claims.
--
-- IMPORTANTE: Ejecutar DESPUÉS de haber configurado SUPABASE_JWT_SECRET
--   en Vercel y de haber migrado las Server Actions a createTenantClient().
-- =============================================================

-- ---------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- REPARACIONES
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- TECNICOS
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- CAMBIOS_REPARACIONES
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- CONFIGURACION_TALLER
-- ---------------------------------------------------------------






-- ---------------------------------------------------------------
-- PRODUCTOS
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- VENTAS
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- CAJA
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- MOVIMIENTOS_CAJA
-- ---------------------------------------------------------------







-- ---------------------------------------------------------------
-- TALLER_USERS: solo el propio taller puede ver/editar su perfil
-- que usa createAdminClient() y no pasa por RLS.
-- ---------------------------------------------------------------




-- ===== MIGRATION: 20260319000002_create_auth_rate_limits.sql =====

-- =============================================================
-- SEC-09: Rate limiting para endpoints de autenticación
--
-- La función check_rate_limit() cuenta intentos en una ventana
-- de tiempo y bloquea si se supera el máximo.
-- =============================================================

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  TEXT        NOT NULL,   -- email o IP del solicitante
  action      TEXT        NOT NULL,   -- 'login' | 'login_admin' | 'register' | 'reset' | 'verify'
  attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para queries de conteo por ventana de tiempo
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON auth_rate_limits (identifier, action, attempt_at DESC);

-- Solo el service_role puede leer/escribir (no exponer a anon)
-- Sin policies para anon/authenticated → solo service_role accede

-- Limpieza automática: eliminar registros de más de 24 horas
-- (ejecutar periódicamente o dejar que crezca; es una tabla pequeña)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM auth_rate_limits WHERE attempt_at < now() - INTERVAL '24 hours';
$$;

-- ===== MIGRATION: 20260319000003_perf_batch_decrement_stock.sql =====

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

-- ===== MIGRATION: 20260320000004_perf_indexes_and_functions.sql =====

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


-- ===== MIGRATION: 20260320000005_fix_rpc_taller_id_type.sql =====

-- =============================================================
-- FIX: Cambiar p_taller_id de UUID a TEXT en get_dashboard_stats
--      y get_next_folio para compatibilidad con columnas taller_id
--      de tipo text en la BD.
-- =============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id    TEXT,
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
    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')) AS en_proceso,

    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus = 'Listo') AS listos,

    COALESCE(
      (SELECT SUM(total) FROM ventas
        WHERE taller_id::text = p_taller_id
          AND created_at >= p_first_of_month), 0
    ) AS ventas_pdv,

    COALESCE(
      (SELECT SUM(monto) FROM movimientos_caja
        WHERE taller_id::text = p_taller_id
          AND tipo IN ('anticipo_reparacion','liquidacion_reparacion')
          AND fecha >= p_first_of_month), 0
    ) AS cobros_rep,

    (SELECT COUNT(*) FROM reparaciones
      WHERE taller_id::text = p_taller_id
        AND estatus NOT IN ('Entregado','Cancelado')
        AND updated_at < p_seven_days_ago) AS urgentes;
$$;



CREATE OR REPLACE FUNCTION get_next_folio(
  p_taller_id TEXT,
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
  WHERE taller_id::text = p_taller_id
    AND folio LIKE p_prefix || '%'
    AND folio ~ ('^' || p_prefix || '[0-9]+$');
$$;


-- ===== MIGRATION: 20260320000006_gastos_tables.sql =====

-- =============================================================
-- GASTOS EN DOS NIVELES
-- Nivel 1: reparacion_gastos  — gastos por ticket de reparación
-- Nivel 2: bitacora_gastos    — gastos generales del taller
--          (tabla ya existe en producción, solo se agregan
--           columnas faltantes y se crea reparacion_gastos)
-- =============================================================

-- ─── Tabla: reparacion_gastos ─────────────────────────────────

CREATE TABLE IF NOT EXISTS reparacion_gastos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       TEXT NOT NULL,
  reparacion_id   UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  concepto        TEXT NOT NULL,
  monto           DECIMAL(10, 2) NOT NULL CHECK (monto >= 0),
  tipo            TEXT NOT NULL CHECK (tipo IN ('mano_obra', 'refaccion', 'otro')),
  producto_id     UUID REFERENCES productos(id) ON DELETE SET NULL,
  mostrar_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


  ON reparacion_gastos
  FOR ALL
  TO authenticated

CREATE INDEX IF NOT EXISTS idx_reparacion_gastos_reparacion
  ON reparacion_gastos (taller_id, reparacion_id);

-- ─── Tabla: bitacora_gastos (ya existe) — agregar columnas ─────

ALTER TABLE bitacora_gastos
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS notas       TEXT,
  ADD COLUMN IF NOT EXISTS categoria   TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS caja_id     UUID;

-- ===== MIGRATION: 20260321000001_dashboard_timezone_rpc.sql =====

-- =============================================================
-- Dashboard por zona horaria del taller
-- 1) Asegura columna configuracion_taller.zona_horaria
-- 2) Reemplaza RPC get_dashboard_stats para calcular periodos en DB
-- =============================================================

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS zona_horaria TEXT NOT NULL DEFAULT 'America/Mexico_City';

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id TEXT
)
RETURNS TABLE (
  en_proceso BIGINT,
  listos BIGINT,
  ventas_pdv NUMERIC,
  cobros_rep NUMERIC,
  urgentes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'America/Mexico_City';
  v_now_tz TIMESTAMPTZ;
  v_first_of_month_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Mexico_City');

  -- "ahora" convertido a zona horaria del taller
  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);

  -- inicio de mes y umbral de urgencia calculados en la misma zona horaria
  v_first_of_month_tz := date_trunc('month', v_now_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    -- Reparaciones activas (sin entregadas/canceladas)
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')) AS en_proceso,

    -- Equipos listos
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus = 'Listo') AS listos,

    -- Ventas del mes en TZ del taller
    COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS ventas_pdv,

    -- Cobros de reparación del mes en TZ del taller
    COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS cobros_rep,

    -- Urgentes: activas sin actualizar en 7+ días (en TZ del taller)
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
        AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
    ) AS urgentes;
END;
$$;


-- ===== MIGRATION: 20260321000002_timezone_default_utc.sql =====

-- Asegura default UTC para nuevos talleres en configuración
ALTER TABLE configuracion_taller
  ALTER COLUMN zona_horaria SET DEFAULT 'UTC';

-- Normaliza filas sin valor explícito
UPDATE configuracion_taller
SET zona_horaria = 'UTC'
WHERE zona_horaria IS NULL OR btrim(zona_horaria) = '';

-- ===== MIGRATION: 20260321000003_rpc_timezone_fallback_utc.sql =====

-- Homologa fallback de zona horaria a UTC en la RPC del dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_taller_id TEXT
)
RETURNS TABLE (
  en_proceso BIGINT,
  listos BIGINT,
  ventas_pdv NUMERIC,
  cobros_rep NUMERIC,
  urgentes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'UTC';
  v_now_tz TIMESTAMPTZ;
  v_first_of_month_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'UTC');

  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
  v_first_of_month_tz := date_trunc('month', v_now_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')) AS en_proceso,

    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus = 'Listo') AS listos,

    COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS ventas_pdv,

    COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    ) AS cobros_rep,

    (SELECT COUNT(*) FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
        AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
    ) AS urgentes;
END;
$$;

-- ===== MIGRATION: 20260321000004_alerta_urgentes_and_list_rpc.sql =====

-- Preferencias: reporte diario de equipos urgentes (7+ días sin movimiento, mismo criterio que dashboard)
ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS alerta_urgentes BOOLEAN NOT NULL DEFAULT false;

-- Lista para correo: misma lógica que get_dashboard_stats.urgentes (TZ del taller, exclusión Entregado/Cancelado)
CREATE OR REPLACE FUNCTION list_urgent_reparaciones_for_email(
  p_taller_id TEXT
)
RETURNS TABLE (
  folio TEXT,
  cliente_nombre TEXT,
  modelo TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'UTC';
  v_now_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id::text = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'UTC');

  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  RETURN QUERY
  SELECT
    r.folio::text,
    COALESCE(c.nombre, '—')::text AS cliente_nombre,
    TRIM(BOTH ' ' FROM CONCAT(COALESCE(r.marca, ''), ' ', COALESCE(r.modelo, '')))::text AS modelo
  FROM reparaciones r
  LEFT JOIN clientes c ON c.id = r.cliente_id AND c.taller_id = r.taller_id
  WHERE r.taller_id::text = p_taller_id
    AND r.estatus NOT IN ('Entregado', 'Cancelado')
    AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
  ORDER BY r.updated_at ASC;
END;
$$;


-- ===== MIGRATION: 20260322000001_storage_inventario_bucket_rls.sql =====

-- Bucket privado para fotos de productos (inventario).
-- El cliente sube con JWT tenant (claim taller_id); path = {taller_id}/{archivo}.jpg
VALUES (
  'inventario',
  'inventario',
  false,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS: cada taller solo accede a objetos bajo su prefijo (primera carpeta = taller_id).
-- Requiere JWT con claim taller_id (createTenantClient en lib/supabase/tenant-client.ts).


  TO authenticated
  USING (
    bucket_id = 'inventario'
  );

  TO authenticated
  WITH CHECK (
    bucket_id = 'inventario'
  );

  TO authenticated
  USING (
    bucket_id = 'inventario'
  )
  WITH CHECK (
    bucket_id = 'inventario'
  );

  TO authenticated
  USING (
    bucket_id = 'inventario'
  );

-- ===== MIGRATION: 20260323000001_dashboard_stats_rpc_final_columns.sql =====

  -- RPC dashboard: nombres de columnas alineados con el cliente (en_proceso_count, listos_count, …)
  -- PostgreSQL no permite cambiar el tipo de retorno con CREATE OR REPLACE; hay que DROP primero.
  -- Incluye firmas antiguas por si el proyecto aún tenía overloads (uuid, parámetros de fecha, etc.).

  DROP FUNCTION IF EXISTS get_dashboard_stats(text);
  DROP FUNCTION IF EXISTS get_dashboard_stats(uuid);
  DROP FUNCTION IF EXISTS get_dashboard_stats(text, timestamptz, timestamptz);
  DROP FUNCTION IF EXISTS get_dashboard_stats(uuid, timestamptz, timestamptz);

  CREATE FUNCTION get_dashboard_stats(
    p_taller_id TEXT
  )
  RETURNS TABLE (
    en_proceso_count BIGINT,
    listos_count BIGINT,
    ingresos_brutos_mes NUMERIC,
    urgentes_count BIGINT
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_tz TEXT := 'UTC';
    v_now_tz TIMESTAMPTZ;
    v_first_of_month_tz TIMESTAMPTZ;
    v_seven_days_ago_tz TIMESTAMPTZ;
    v_ventas NUMERIC;
    v_cobros NUMERIC;
  BEGIN
    SELECT ct.zona_horaria
      INTO v_tz
    FROM configuracion_taller ct
    WHERE ct.taller_id::text = p_taller_id
    LIMIT 1;

    v_tz := COALESCE(v_tz, 'UTC');

    v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
    v_first_of_month_tz := date_trunc('month', v_now_tz);
    v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

    v_ventas := COALESCE(
      (SELECT SUM(v.total) FROM ventas v
        WHERE v.taller_id::text = p_taller_id
          AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    );

    v_cobros := COALESCE(
      (SELECT SUM(m.monto) FROM movimientos_caja m
        WHERE m.taller_id::text = p_taller_id
          AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
          AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
      ), 0
    );

    RETURN QUERY
    SELECT
      -- Tickets en cola: activos (no entregados ni cancelados; incluye Listo)
      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus NOT IN ('Entregado', 'Cancelado')
      ) AS en_proceso_count,

      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus = 'Listo'
      ) AS listos_count,

      (v_ventas + v_cobros) AS ingresos_brutos_mes,

      (SELECT COUNT(*)::bigint FROM reparaciones r
        WHERE r.taller_id::text = p_taller_id
          AND r.estatus NOT IN ('Entregado', 'Cancelado')
          AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
      ) AS urgentes_count;
  END;
  $$;


-- ===== MIGRATION: 20260324000001_folio_sequence_trigger.sql =====

-- =============================================================================
-- Folios seguros: prefijo + contador en configuracion_taller, trigger en INSERT
-- =============================================================================

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS prefijo_folio VARCHAR(64) NOT NULL DEFAULT 'REP';

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS siguiente_folio INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN configuracion_taller.prefijo_folio IS 'Prefijo del folio (ej. CDS, REP). Se concatena con guion y número.';
COMMENT ON COLUMN configuracion_taller.siguiente_folio IS 'Siguiente número a asignar (bloqueado con FOR UPDATE en el trigger).';

-- -----------------------------------------------------------------------------
-- BEFORE INSERT: si folio es NULL o vacío, asignar desde configuracion_taller
-- Formato: {prefijo}-{número}  ej. CDS-15000
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reparaciones_assign_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref   TEXT;
  v_next   INTEGER;
  v_folio  TEXT;
BEGIN
  IF NEW.folio IS NOT NULL AND btrim(NEW.folio) <> '' THEN
    RETURN NEW;
  END IF;

  -- Asegurar fila de configuración (concurrencia: otro insert pudo crearla)
  INSERT INTO configuracion_taller (taller_id, nombre_taller, prefijo_folio, siguiente_folio)
  VALUES (NEW.taller_id, 'Mi Taller', 'REP', 1)
  ON CONFLICT (taller_id) DO NOTHING;

  SELECT ct.prefijo_folio, ct.siguiente_folio
    INTO v_pref, v_next
    FROM configuracion_taller ct
   WHERE ct.taller_id = NEW.taller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró configuracion_taller para taller_id %', NEW.taller_id;
  END IF;

  v_pref := COALESCE(NULLIF(btrim(v_pref), ''), 'REP');
  v_next := COALESCE(v_next, 1);

  v_folio := v_pref || '-' || v_next::text;
  NEW.folio := v_folio;

  UPDATE configuracion_taller
     SET siguiente_folio = v_next + 1
   WHERE taller_id = NEW.taller_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_assign_folio ON public.reparaciones;

CREATE TRIGGER trg_reparaciones_assign_folio
  BEFORE INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_assign_folio();

-- ===== MIGRATION: 20260324000002_add_plan_activo_to_taller_users.sql =====

-- Control de acceso al Plan Pro por taller.
-- Fuente de verdad para habilitar módulos Pro en la app.
ALTER TABLE public.taller_users
ADD COLUMN IF NOT EXISTS plan_activo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.taller_users.plan_activo IS
'Indica si el taller tiene acceso al Plan Pro.';

-- ===== MIGRATION: 20260324000003_add_es_pro_to_taller_users.sql =====

-- Flag permanente para habilitar funcionalidades Pro por taller.
ALTER TABLE public.taller_users
ADD COLUMN IF NOT EXISTS es_pro boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.taller_users.es_pro IS
'Habilita el acceso al modo Pro del taller.';

-- ===== MIGRATION: 20260324000004_consolidate_pro_flags_to_plan_activo.sql =====

-- Consolidacion de banderas PRO:
-- Fuente de verdad final: taller_users.plan_activo
-- 1) Copia datos de es_pro -> plan_activo (si existen ambas columnas)
-- 2) Elimina es_pro para evitar doble fuente de verdad

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'taller_users'
      AND column_name = 'es_pro'
  ) THEN
    UPDATE public.taller_users
    SET plan_activo = COALESCE(es_pro, false)
    WHERE COALESCE(plan_activo, false) = false
      AND COALESCE(es_pro, false) = true;

    ALTER TABLE public.taller_users
    DROP COLUMN es_pro;
  END IF;
END $$;

-- ===== MIGRATION: 20260324000005_normalize_productos_imagen_url_to_canonical_webp.sql =====

-- Normaliza productos.imagen_url al formato canónico:
--   {taller_id}/{producto_id}.webp
--
-- Esto elimina referencias legacy (URLs completas, .jpg/.png, paths viejos) para que
-- el frontend siempre apunte a product-photos con el esquema actual.
--

UPDATE public.productos
SET imagen_url = (taller_id::text || '/' || id::text || '.webp')
WHERE imagen_url IS NOT NULL
  AND btrim(imagen_url) <> ''
  AND btrim(imagen_url) !~* '\\.webp(\\?.*)?$';


-- ===== MIGRATION: 20260324000006_storage_product_photos_public_select_server_write_only.sql =====

-- Bucket: product-photos
-- Reglas:
-- - SELECT: Público (lectura pública)
-- - INSERT/UPDATE/DELETE: None para clientes (solo server role / backend seguro)

-- Asegurar que el bucket exista y sea público.
VALUES (
  'product-photos',
  'product-photos',
  true,
  ARRAY['image/webp', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- Políticas: permitir lectura pública del bucket.
  TO public
  USING (bucket_id = 'product-photos');

-- No crear políticas de INSERT/UPDATE/DELETE para este bucket.
-- para anon/authenticated. El service role (backend) sigue pudiendo escribir.


-- ===== MIGRATION: 20260324000007_disable_legacy_inventario_bucket_policies.sql =====

-- Deshabilita el bucket legacy `inventario` (no usar más en TallerCloud).
-- Objetivo: eliminar puertas traseras de lectura/escritura desde cliente.

-- 1) Asegurar bucket no público (si existe).
SET public = false
WHERE id = 'inventario';

-- 2) Eliminar policies conocidas creadas por migraciones anteriores.

-- Nota:
-- No borramos el bucket ni objetos para evitar pérdida de datos.
-- El server role puede seguir accediendo si fuera necesario para migraciones internas.


-- ===== MIGRATION: 20260325000001_historial_reparacion_auditoria.sql =====

-- =============================================================================
-- Historial de cambios de estado + costo_total / restante en reparaciones
-- =============================================================================

-- Columnas financieras (anticipo ya existe en el esquema típico)
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS costo_total NUMERIC(12, 2);

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS restante NUMERIC(12, 2);

COMMENT ON COLUMN public.reparaciones.costo_total IS 'Total acordado/cobrable; si es NULL se toma precio_estimado en el trigger.';
COMMENT ON COLUMN public.reparaciones.restante IS 'costo_total - anticipo (calculado en trigger).';

UPDATE public.reparaciones
SET costo_total = COALESCE(costo_total, precio_estimado, 0)
WHERE costo_total IS NULL;

UPDATE public.reparaciones
SET restante = COALESCE(costo_total, 0) - COALESCE(anticipo, 0);

CREATE OR REPLACE FUNCTION public.reparaciones_sync_costos()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- costo_total sigue al presupuesto (precio_estimado); restante = costo_total - anticipo
  NEW.costo_total := COALESCE(NEW.precio_estimado, NEW.costo_total, 0);
  NEW.restante := COALESCE(NEW.costo_total, 0) - COALESCE(NEW.anticipo, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_sync_costos ON public.reparaciones;
CREATE TRIGGER trg_reparaciones_sync_costos
  BEFORE INSERT OR UPDATE OF precio_estimado, costo_total, anticipo
  ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_sync_costos();

-- Tabla de auditoría por cambio de estado
CREATE TABLE IF NOT EXISTS public.historial_reparacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reparacion_id uuid NOT NULL REFERENCES public.reparaciones(id) ON DELETE CASCADE,
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.taller_users(id) ON DELETE SET NULL,
  estado_anterior text,
  estado_nuevo text,
  nota_tecnica text,
  fecha timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_reparacion_rep ON public.historial_reparacion(reparacion_id);
CREATE INDEX IF NOT EXISTS idx_historial_reparacion_taller_fecha ON public.historial_reparacion(taller_id, fecha DESC);





-- ===== MIGRATION: 20260325000001_reporte_cierre_email_default_true.sql =====

-- Envío automático de reporte de cierre por email: default ON para nuevas filas.
ALTER TABLE configuracion_taller
  ALTER COLUMN reportes_cierre_caja SET DEFAULT true;

-- ===== MIGRATION: 20260326000001_historial_reparacion_grants_and_rls.sql =====

-- =============================================================================
-- historial_reparacion: permisos explícitos + políticas RLS para INSERT/SELECT
-- El cliente usa JWT custom (claim taller_id) con rol "authenticated" en el token.
-- =============================================================================


-- Reemplazar políticas para que apliquen a los roles que usa Supabase + PostgREST

  FOR SELECT
  TO authenticated, anon

  FOR INSERT
  TO authenticated, anon

COMMENT ON POLICY "historial_reparacion_insert" ON public.historial_reparacion IS
  'INSERT permitido cuando taller_id del JWT coincide con la fila (tenant).';

-- ===== MIGRATION: 20260326000001_taller_users_is_pro_and_admin_rls.sql =====

-- Modo Pro: asegura plan_activo + is_pro (bases sin migraciones 20260324 previas).
-- Política RLS: cuentas con es_admin pueden actualizar cualquier fila taller_users (JWT tenant).

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS plan_activo boolean NOT NULL DEFAULT false;

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;

UPDATE public.taller_users
SET is_pro = COALESCE(plan_activo, false)
WHERE is_pro IS DISTINCT FROM COALESCE(plan_activo, false);

COMMENT ON COLUMN public.taller_users.plan_activo IS
  'Modo Pro / plan activo (Chat, Mercado, etc.).';

COMMENT ON COLUMN public.taller_users.is_pro IS
  'Modo Pro (sincronizado con plan_activo; la app actualiza ambos).';


  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.taller_users AS me
        AND me.es_admin IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.taller_users AS me
        AND me.es_admin IS TRUE
    )
  );

-- ===== MIGRATION: 20260327000001_historial_basal_on_insert_reparacion.sql =====

-- =============================================================================
-- Registro basal en historial_reparacion al crear una reparación (punto de partida del folio)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    fecha
  ) VALUES (
    NEW.id,
    NEW.taller_id,
    NEW.taller_id,
    NULL,
    COALESCE(NULLIF(trim(NEW.estatus::text), ''), 'Recibido'),
    'Ingreso del equipo al sistema',
    COALESCE(NEW.created_at, NOW())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reparaciones_historial_basal ON public.reparaciones;
CREATE TRIGGER trg_reparaciones_historial_basal
  AFTER INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_historial_basal_insert();

COMMENT ON FUNCTION public.reparaciones_historial_basal_insert() IS
  'Inserta el primer evento de auditoría (Recibido + ingreso al sistema) por cada folio nuevo.';

-- Backfill: folios que aún no tienen este evento basal
INSERT INTO public.historial_reparacion (
  reparacion_id,
  taller_id,
  usuario_id,
  estado_anterior,
  estado_nuevo,
  nota_tecnica,
  fecha
)
SELECT
  r.id,
  r.taller_id,
  r.taller_id,
  NULL,
  COALESCE(NULLIF(trim(r.estatus::text), ''), 'Recibido'),
  'Ingreso del equipo al sistema',
  r.created_at
FROM public.reparaciones r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.historial_reparacion h
  WHERE h.reparacion_id = r.id
    AND h.nota_tecnica = 'Ingreso del equipo al sistema'
);

-- ===== MIGRATION: 20260328000001_equipo_roles_miembros_actor_historial.sql =====

-- =============================================================================
-- 1) Quién hizo el cambio: nombre visible en historial (no placeholder genérico)
-- 2) Catálogo global roles_taller + miembros_taller (MVP máx. 5 por taller)
-- =============================================================================

-- --- historial: snapshot del nombre del actor --------------------------------
ALTER TABLE public.historial_reparacion
  ADD COLUMN IF NOT EXISTS actor_nombre text;

COMMENT ON COLUMN public.historial_reparacion.actor_nombre IS
  'Nombre para mostrar de quien registró el evento (propietario o miembro).';

-- Catálogo de roles (global, sin taller_id)
CREATE TABLE IF NOT EXISTS public.roles_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('estandar', 'especial')),
  permisos jsonb NOT NULL DEFAULT '[]'::jsonb,
  orden int NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.roles_taller IS 'Roles predefinidos para miembros del equipo (MVP).';

INSERT INTO public.roles_taller (slug, nombre, categoria, permisos, orden) VALUES
  ('administrador', 'Administrador', 'estandar',
   '["all","configuracion","equipo","reportes","finanzas","caja","reparaciones","ventas","inventario","clientes","bitacora"]'::jsonb, 1),
  ('tecnico_estandar', 'Técnico Estándar', 'estandar',
   '["reparaciones","ventas","inventario","clientes","caja","bitacora"]'::jsonb, 2),
  ('vendedor_recepcion', 'Vendedor / Recepción', 'estandar',
   '["reparaciones_read","ventas","caja_ventas","clientes","nuevo_ticket"]'::jsonb, 3),
  ('reparador', 'Reparador', 'especial',
   '["reparaciones_mias","notas_tecnicas"]'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING;

-- Miembros del equipo (Supabase Auth user_id + taller)
CREATE TABLE IF NOT EXISTS public.miembros_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  email text NOT NULL,
  nombre text NOT NULL,
  rol_id uuid NOT NULL REFERENCES public.roles_taller(id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_miembros_taller_taller ON public.miembros_taller(taller_id);
CREATE INDEX IF NOT EXISTS idx_miembros_taller_auth ON public.miembros_taller(auth_user_id);

COMMENT ON TABLE public.miembros_taller IS 'Usuarios creados vía Auth vinculados al taller (máx. 5 activos MVP).';







-- roles_taller: lectura para usuarios autenticados del tenant
  USING (true);


-- Trigger basal: actor_nombre desde propietario del taller
CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_label text;
BEGIN
  SELECT COALESCE(
    NULLIF(trim(tu.nombre_propietario), ''),
    NULLIF(trim(tu.email), ''),
    'Usuario'
  )
  INTO actor_label
  FROM public.taller_users tu
  WHERE tu.id = NEW.taller_id;

  INSERT INTO public.historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    fecha,
    actor_nombre
  ) VALUES (
    NEW.id,
    NEW.taller_id,
    NEW.taller_id,
    NULL,
    COALESCE(NULLIF(trim(NEW.estatus::text), ''), 'Recibido'),
    'Ingreso del equipo al sistema',
    COALESCE(NEW.created_at, NOW()),
    actor_label
  );
  RETURN NEW;
END;
$$;

-- Backfill actor_nombre en historial existente
UPDATE public.historial_reparacion h
SET actor_nombre = COALESCE(
  NULLIF(trim(tu.nombre_propietario), ''),
  NULLIF(trim(tu.email), ''),
  'Usuario'
)
FROM public.taller_users tu
WHERE h.taller_id = tu.id
  AND (h.actor_nombre IS NULL OR trim(h.actor_nombre) = '');

-- ===== MIGRATION: 20260328000002_miembros_taller_mvp_limit.sql =====

-- Límite MVP: máximo 5 miembros activos por taller (además de validación en app)

CREATE OR REPLACE FUNCTION public.enforce_miembros_taller_mvp_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activo THEN
      SELECT COUNT(*)::int INTO cnt
      FROM public.miembros_taller
      WHERE taller_id = NEW.taller_id AND activo = true;
      IF cnt >= 5 THEN
        RAISE EXCEPTION 'MVP_LIMIT_MIEMBROS'
          USING HINT = 'Has alcanzado el límite de 5 usuarios para la fase MVP. Contacta a soporte para más detalles.';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.activo AND (NOT OLD.activo) THEN
      SELECT COUNT(*)::int INTO cnt
      FROM public.miembros_taller
      WHERE taller_id = NEW.taller_id AND activo = true AND id <> NEW.id;
      IF cnt >= 5 THEN
        RAISE EXCEPTION 'MVP_LIMIT_MIEMBROS'
          USING HINT = 'Has alcanzado el límite de 5 usuarios para la fase MVP. Contacta a soporte para más detalles.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_miembros_taller_mvp_limit ON public.miembros_taller;
CREATE TRIGGER trg_miembros_taller_mvp_limit
  BEFORE INSERT OR UPDATE ON public.miembros_taller
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_miembros_taller_mvp_limit();

COMMENT ON FUNCTION public.enforce_miembros_taller_mvp_limit() IS
  'MVP: máximo 5 filas activas en miembros_taller por taller_id.';

-- ===== MIGRATION: 20260328000003_email_pin_verification.sql =====

-- =============================================================================
-- Onboarding Security: verificación de email por PIN (miembros del equipo)
-- =============================================================================

ALTER TABLE public.miembros_taller
  ADD COLUMN IF NOT EXISTS email_verificado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.miembros_taller.email_verificado IS
  'Indica si el miembro confirmó su correo mediante PIN de 6 dígitos.';

CREATE TABLE IF NOT EXISTS public.verificaciones_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  taller_id uuid NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  pin text NOT NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL,
  CONSTRAINT verificaciones_email_pin_6digits CHECK (pin ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_email_user_taller
  ON public.verificaciones_email (user_id, taller_id, creado_at DESC);


  ON public.verificaciones_email
  FOR ALL


CREATE OR REPLACE FUNCTION public.verificar_pin(
  p_user_id uuid,
  p_taller_id uuid,
  p_pin text
)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.verificaciones_email%ROWTYPE;
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT false, 'Código inválido.';
    RETURN;
  END IF;

  SELECT ve.*
  INTO v_row
  FROM public.verificaciones_email ve
  WHERE ve.user_id = p_user_id
    AND ve.taller_id = p_taller_id
  ORDER BY ve.creado_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No existe un código activo para este usuario.';
    RETURN;
  END IF;

  IF v_row.expira_at < now() THEN
    DELETE FROM public.verificaciones_email WHERE id = v_row.id;
    RETURN QUERY SELECT false, 'Código expirado.';
    RETURN;
  END IF;

  IF v_row.pin <> p_pin THEN
    RETURN QUERY SELECT false, 'Código incorrecto.';
    RETURN;
  END IF;

  UPDATE public.miembros_taller
  SET email_verificado = true
  WHERE auth_user_id = p_user_id
    AND taller_id = p_taller_id;

  DELETE FROM public.verificaciones_email
  WHERE user_id = p_user_id
    AND taller_id = p_taller_id;

  RETURN QUERY SELECT true, 'Correo verificado correctamente.';
END;
$$;


-- ===== MIGRATION: 20260329000001_printer_mapping.sql =====

-- supabase/migrations/20260329000001_printer_mapping.sql
-- Agrega columnas de mapeo de impresoras por tipo al taller

ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS impresora_ticket    text,
  ADD COLUMN IF NOT EXISTS impresora_etiqueta  text,
  ADD COLUMN IF NOT EXISTS impresora_documento text;

COMMENT ON COLUMN public.configuracion_taller.impresora_ticket    IS 'Nombre exacto de impresora térmica para tickets (reparaciones, abonos, corte).';
COMMENT ON COLUMN public.configuracion_taller.impresora_etiqueta  IS 'Nombre exacto de impresora de etiquetas (2×1 pulgadas).';
COMMENT ON COLUMN public.configuracion_taller.impresora_documento IS 'Nombre exacto de impresora para documentos tamaño Carta/A4.';

-- ===== MIGRATION: 20260329000001_ventas_estado_increment_stock_anulacion.sql =====

-- Estado de venta (anulación) + stock de reversión + tipo de movimiento anulación + RPC dashboard

-- ── ventas.estado ─────────────────────────────────────────────────────────────
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'
  CHECK (estado IN ('activa', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_ventas_taller_estado_created
  ON public.ventas (taller_id, estado, created_at DESC);

COMMENT ON COLUMN public.ventas.estado IS 'activa | cancelada (anulación admin devuelve inventario PDV).';

-- ── batch_increment_stock (reversión de batch_decrement_stock) ───────────────
CREATE OR REPLACE FUNCTION public.batch_increment_stock(items jsonb)
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
    UPDATE public.productos
    SET stock_actual = stock_actual + (item->>'cantidad')::int
    WHERE id = (item->>'producto_id')::uuid
      AND taller_id = (item->>'taller_id')::uuid;
  END LOOP;
END;
$$;


-- ── movimientos_caja: permitir anulación de venta PDV ───────────────────────
ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;

ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN (
    'venta_pdv',
    'anticipo_reparacion',
    'liquidacion_reparacion',
    'gasto',
    'anulacion_venta'
  ));

-- ── get_dashboard_stats: excluir ventas canceladas ─────────────────────────
DROP FUNCTION IF EXISTS get_dashboard_stats(text);

CREATE FUNCTION get_dashboard_stats(
  p_taller_id TEXT
)
RETURNS TABLE (
  en_proceso_count BIGINT,
  listos_count BIGINT,
  ingresos_brutos_mes NUMERIC,
  urgentes_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT := 'UTC';
  v_now_tz TIMESTAMPTZ;
  v_first_of_month_tz TIMESTAMPTZ;
  v_seven_days_ago_tz TIMESTAMPTZ;
  v_ventas NUMERIC;
  v_cobros NUMERIC;
BEGIN
  SELECT ct.zona_horaria
    INTO v_tz
  FROM configuracion_taller ct
  WHERE ct.taller_id::text = p_taller_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'UTC');

  v_now_tz := (now() AT TIME ZONE 'UTC' AT TIME ZONE v_tz);
  v_first_of_month_tz := date_trunc('month', v_now_tz);
  v_seven_days_ago_tz := v_now_tz - INTERVAL '7 days';

  v_ventas := COALESCE(
    (SELECT SUM(v.total) FROM ventas v
      WHERE v.taller_id::text = p_taller_id
        AND (v.estado IS NULL OR v.estado = 'activa')
        AND (v.created_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
    ), 0
  );

  v_cobros := COALESCE(
    (SELECT SUM(m.monto) FROM movimientos_caja m
      WHERE m.taller_id::text = p_taller_id
        AND m.tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
        AND (m.fecha AT TIME ZONE 'UTC' AT TIME ZONE v_tz) >= v_first_of_month_tz
    ), 0
  );

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
    ) AS en_proceso_count,

    (SELECT COUNT(*)::bigint FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus = 'Listo'
    ) AS listos_count,

    (v_ventas + v_cobros) AS ingresos_brutos_mes,

    (SELECT COUNT(*)::bigint FROM reparaciones r
      WHERE r.taller_id::text = p_taller_id
        AND r.estatus NOT IN ('Entregado', 'Cancelado')
        AND (r.updated_at AT TIME ZONE 'UTC' AT TIME ZONE v_tz) < v_seven_days_ago_tz
    ) AS urgentes_count;
END;
$$;


-- ===== MIGRATION: 20260330000001_anular_venta_atomic_audit.sql =====

-- Anulación atómica de venta PDV + auditoría (estado anulado, anulado_por, motivo)
-- Inventario: productos.stock_actual vía batch_increment_stock
-- Caja: ajuste totales + movimiento tipo anulacion_venta

-- ── Columnas de auditoría en ventas ───────────────────────────────────────────
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES public.taller_users(id) ON DELETE SET NULL;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

COMMENT ON COLUMN public.ventas.anulado_por IS 'Cuenta taller_users que anuló la venta (propietario / sesión).';
COMMENT ON COLUMN public.ventas.fecha_anulacion IS 'Momento de la anulación.';
COMMENT ON COLUMN public.ventas.motivo_anulacion IS 'Motivo opcional de la anulación.';

-- Estado: activa | anulado (migrar cancelada legacy → anulado)
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;

UPDATE public.ventas SET estado = 'anulado' WHERE estado = 'cancelada';

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_estado_check CHECK (estado IN ('activa', 'anulado'));

COMMENT ON COLUMN public.ventas.estado IS 'activa | anulado';

-- ── RPC atómica: anular venta PDV ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.anular_venta_pdv(
  p_venta_id uuid,
  p_taller_id text,
  p_anulado_por uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  items jsonb;
  v_metodo text;
BEGIN
  IF p_taller_id IS NULL OR trim(p_taller_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'taller_id requerido.');
  END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para este taller.');
  END IF;

  SELECT
    id,
    taller_id,
    caja_id,
    folio,
    total,
    estado,
    metodo_pago,
    monto_efectivo,
    monto_tarjeta,
    monto_transferencia
  INTO v
  FROM public.ventas
  WHERE id = p_venta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no encontrada.');
  END IF;

  IF v.taller_id IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no pertenece al taller.');
  END IF;

  IF v.estado IS DISTINCT FROM 'activa' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta no está activa.');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'producto_id', d.producto_id::text,
        'taller_id', p_taller_id,
        'cantidad', d.cantidad
      )
    ),
    '[]'::jsonb
  )
  INTO items
  FROM public.detalle_ventas d
  WHERE d.venta_id = p_venta_id
    AND d.producto_id IS NOT NULL
    AND NOT COALESCE(d.es_especial, false);

  IF items IS NOT NULL AND jsonb_array_length(items) > 0 THEN
    PERFORM public.batch_increment_stock(items);
  END IF;

  IF v.caja_id IS NOT NULL THEN
    UPDATE public.caja c
    SET
      total_efectivo = c.total_efectivo - COALESCE(v.monto_efectivo, 0),
      total_tarjeta = c.total_tarjeta - COALESCE(v.monto_tarjeta, 0),
      total_transferencia = c.total_transferencia - COALESCE(v.monto_transferencia, 0),
      total_ventas = GREATEST(0, c.total_ventas - 1)
    WHERE c.id = v.caja_id
      AND c.taller_id = p_taller_id;

    v_metodo := lower(COALESCE(v.metodo_pago, 'efectivo'));
    IF v_metodo NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto') THEN
      v_metodo := 'efectivo';
    END IF;

    INSERT INTO public.movimientos_caja (
      taller_id,
      caja_id,
      tipo,
      referencia_id,
      descripcion,
      monto,
      metodo_pago,
      fecha
    )
    VALUES (
      p_taller_id,
      v.caja_id,
      'anulacion_venta',
      p_venta_id,
      'Anulación ' || COALESCE(v.folio, ''),
      -ABS(COALESCE(v.total, 0)),
      v_metodo,
      NOW()
    );
  END IF;

  UPDATE public.ventas
  SET
    estado = 'anulado',
    anulado_por = p_anulado_por,
    fecha_anulacion = NOW(),
    motivo_anulacion = NULLIF(trim(p_motivo), '')
  WHERE id = p_venta_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


-- get_dashboard_stats (20260329000001) ya suma solo ventas activas; tras migrar
-- cancelada → anulado, el CHECK sigue excluyendo ingresos de ventas anuladas.

-- ===== MIGRATION: 20260331000001_movimientos_caja_created_at.sql =====

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

-- ===== MIGRATION: 20260332000001_inventory_operational_kpis.sql =====

-- KPIs inventario: valor en riesgo (stock crítico) y rotación promedio (últimas 20 líneas PDV con producto)

CREATE OR REPLACE FUNCTION public.get_inventory_operational_kpis(p_taller_id text)
RETURNS TABLE (
  valor_riesgo numeric,
  rotacion_dias_promedio numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_taller_id IS NULL OR trim(p_taller_id) = '' THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric;
    RETURN;
  END IF;

    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT COALESCE(SUM(p.costo * p.stock_actual), 0::numeric)
      FROM public.productos p
      WHERE p.taller_id::text = p_taller_id
        AND p.stock_actual <= p.stock_minimo
    ) AS valor_riesgo,
    (
      SELECT COALESCE(AVG(sub.days_diff), 0::numeric)
      FROM (
        SELECT
          EXTRACT(EPOCH FROM (v.created_at - pr.created_at)) / 86400.0 AS days_diff
        FROM public.detalle_ventas d
        INNER JOIN public.ventas v ON v.id = d.venta_id
        INNER JOIN public.productos pr ON pr.id = d.producto_id
        WHERE v.taller_id = p_taller_id
          AND (v.estado IS NULL OR v.estado = 'activa')
          AND d.producto_id IS NOT NULL
          AND NOT COALESCE(d.es_especial, false)
          AND pr.taller_id::text = p_taller_id
        ORDER BY v.created_at DESC
        LIMIT 20
      ) sub
    ) AS rotacion_dias_promedio;
END;
$$;

COMMENT ON FUNCTION public.get_inventory_operational_kpis(text) IS
  'valor_riesgo: suma costo×stock en SKU con stock crítico. rotacion: promedio días (fecha venta − created_at producto) últimas 20 líneas PDV.';


-- ===== MIGRATION: 20260333000001_productos_marca_hardware_ubicacion.sql =====

-- Inventario: marca, modelo, ubicación, bloque hardware (procesador, ram, almacenamiento)

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS modelo text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS ubicacion text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS procesador text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS ram text;
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS almacenamiento text;

COMMENT ON COLUMN public.productos.marca IS 'Marca o fabricante (agnóstico).';
COMMENT ON COLUMN public.productos.modelo IS 'Modelo o referencia comercial.';
COMMENT ON COLUMN public.productos.ubicacion IS 'Ubicación física en almacén.';
COMMENT ON COLUMN public.productos.procesador IS 'Hardware: CPU / SoC.';
COMMENT ON COLUMN public.productos.ram IS 'Hardware: memoria RAM.';
COMMENT ON COLUMN public.productos.almacenamiento IS 'Hardware: almacenamiento interno (sustituye uso principal de capacidad legacy).';

UPDATE public.productos
SET almacenamiento = capacidad
WHERE almacenamiento IS NULL
  AND capacidad IS NOT NULL
  AND trim(capacidad) <> '';

-- ===== MIGRATION: 20260334000001_reparaciones_usuario_recepcion.sql =====

-- =============================================================================
-- Quién registró la orden: auth user al momento del INSERT (recepción)
-- =============================================================================

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS usuario_recepcion_id uuid;

COMMENT ON COLUMN public.reparaciones.usuario_recepcion_id IS
  'Usuario de Supabase Auth que creó el ticket (sesión activa al insertar).';

ALTER TABLE public.reparaciones
  DROP CONSTRAINT IF EXISTS reparaciones_usuario_recepcion_id_fkey;

ALTER TABLE public.reparaciones
  ADD CONSTRAINT reparaciones_usuario_recepcion_id_fkey

CREATE INDEX IF NOT EXISTS idx_reparaciones_usuario_recepcion
  ON public.reparaciones (usuario_recepcion_id)
  WHERE usuario_recepcion_id IS NOT NULL;

-- Trigger basal: actor_nombre según usuario_recepcion_id (miembro o propietario) o fallback taller
CREATE OR REPLACE FUNCTION public.reparaciones_historial_basal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_label text;
  auth_uid uuid;
BEGIN
  auth_uid := NEW.usuario_recepcion_id;

  IF auth_uid IS NOT NULL THEN
    SELECT NULLIF(trim(m.nombre), '')
    INTO actor_label
    FROM public.miembros_taller m
    WHERE m.taller_id = NEW.taller_id
      AND m.auth_user_id = auth_uid
      AND m.activo = true
    LIMIT 1;

    IF actor_label IS NULL OR trim(actor_label) = '' THEN
      SELECT COALESCE(
        NULLIF(trim(tu.nombre_propietario), ''),
        NULLIF(trim(tu.email), ''),
        NULLIF(trim(tu.nombre_taller), '')
      )
      INTO actor_label
      FROM public.taller_users tu
      WHERE tu.id = auth_uid;
    END IF;
  END IF;

  IF actor_label IS NULL OR trim(actor_label) = '' THEN
    SELECT COALESCE(
      NULLIF(trim(tu.nombre_propietario), ''),
      NULLIF(trim(tu.email), ''),
      'Usuario'
    )
    INTO actor_label
    FROM public.taller_users tu
    WHERE tu.id = NEW.taller_id;
  END IF;

  INSERT INTO public.historial_reparacion (
    reparacion_id,
    taller_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    nota_tecnica,
    fecha,
    actor_nombre
  ) VALUES (
    NEW.id,
    NEW.taller_id,
    NEW.taller_id,
    NULL,
    COALESCE(NULLIF(trim(NEW.estatus::text), ''), 'Recibido'),
    'Orden creada / Recibida',
    COALESCE(NEW.created_at, NOW()),
    actor_label
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reparaciones_historial_basal_insert() IS
  'Primer evento de auditoría al crear folio: recepción con nombre de quien abrió la sesión.';

UPDATE public.historial_reparacion h
SET nota_tecnica = 'Orden creada / Recibida'
WHERE trim(COALESCE(h.nota_tecnica, '')) = 'Ingreso del equipo al sistema';

-- ===== MIGRATION: 20260335000001_reparaciones_security_type_value.sql =====

-- Seguridad del equipo v2: tipo + valor canónico (PIN / contraseña / patrón)
-- Se mantienen pin_contrasena y patron_desbloqueo como compatibilidad con impresión e histórico.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS security_type text;

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS security_value text;

COMMENT ON COLUMN public.reparaciones.security_type IS
  'none | pin | password | pattern';

COMMENT ON COLUMN public.reparaciones.security_value IS
  'PIN o contraseña en texto, o patrón como secuencia 1-9 (ej. 1-4-7-8).';

-- ===== MIGRATION: 20260336000001_historial_recepcion_app_entrega.sql =====

-- =============================================================================
-- 1) Basal de creación: lo inserta la app (createRepair), no el trigger.
-- 2) Backfill de textos viejos en nota_tecnica del primer evento por folio.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_reparaciones_historial_basal ON public.reparaciones;
DROP FUNCTION IF EXISTS public.reparaciones_historial_basal_insert();

COMMENT ON TABLE public.reparaciones IS
  'Primer evento de historial_reparacion lo crea createRepair (Server Action).';

-- Normalizar notas históricas del ingreso inicial
UPDATE public.historial_reparacion h
SET nota_tecnica = 'Equipo Recibido - Orden Generada por ' || COALESCE(NULLIF(trim(h.actor_nombre), ''), 'Usuario')
WHERE trim(COALESCE(h.nota_tecnica, '')) IN (
  'Ingreso del equipo al sistema',
  'Orden creada / Recibida'
)
AND h.estado_anterior IS NULL
AND trim(COALESCE(h.estado_nuevo, '')) = 'Recibido';

-- ===== MIGRATION: 20260337000001_get_garantia_ticket.sql =====

-- Comprobante de garantía digital (público): valida últimos 4 del teléfono y solo órdenes entregadas.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_garantia_ticket(
  p_ticket_id UUID,
  p_last4     TEXT
)
RETURNS TABLE (
  folio               TEXT,
  marca               TEXT,
  modelo              TEXT,
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


-- ===== MIGRATION: 20260338000001_garantia_ticket_numero_serie.sql =====

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


-- ===== MIGRATION: 20260339000001_firma_digital.sql =====

-- Firma digital de ingreso: tokens y almacenamiento en bucket privado `firmas`.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS firma_ingreso_path TEXT;


CREATE TABLE IF NOT EXISTS public.firma_digital_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  taller_id UUID NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  reparacion_id UUID NOT NULL REFERENCES public.reparaciones(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_firma_digital_tokens_token ON public.firma_digital_tokens(token);
CREATE INDEX IF NOT EXISTS idx_firma_digital_tokens_reparacion ON public.firma_digital_tokens(reparacion_id);


VALUES (
  'firmas',
  'firmas',
  false,
  5242880,
  ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ===== MIGRATION: 20260340000001_checklist_ingreso.sql =====

-- Checklist de ingreso (recepción): encendido, ítems funcionales, observaciones estéticas.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS checklist_ingreso jsonb DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.checklist_ingreso IS
  'JSON: encendido (ok|intermitente|no), funcional {clave: bool}, observacionesEsteticas (texto).';

-- ===== MIGRATION: 20260341000001_reparaciones_notas_internas.sql =====

-- Notas internas del taller (no visibles al cliente en tracking).

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS notas_internas text DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.notas_internas IS
  'Notas operativas del taller; solo panel interno.';

-- ===== MIGRATION: 20260342000001_ajustes_taller_flujo_pro.sql =====

-- Reglas PRO por taller (flujo obligatorio: health check, firma, evidencia fotográfica).

CREATE TABLE IF NOT EXISTS public.ajustes_taller (
  taller_id uuid PRIMARY KEY REFERENCES public.taller_users(id) ON DELETE CASCADE,
  health_check_required boolean NOT NULL DEFAULT false,
  firma_required boolean NOT NULL DEFAULT false,
  fotos_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ajustes_taller IS 'Flags de flujo PRO por tenant (reglas antes de avanzar estatus).';





-- ===== MIGRATION: 20260342000002_reparaciones_checklist_pro.sql =====

-- Diagnóstico PRO (health check): pruebas por tipo de equipo + omisión express.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS checklist_pro jsonb DEFAULT NULL;

COMMENT ON COLUMN public.reparaciones.checklist_pro IS
  'JSON: { funcional: {clave: bool}, expressOmitReason?: string } — mín. 5 pruebas OK si el taller exige health check.';

-- ===== MIGRATION: 20260343000001_taller_users_precio_plan_mensual.sql =====

-- Precio mensual contratado (MXN) para mostrar PLAN CORE vs PLAN PRO en el dashboard.
ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS precio_plan_mensual integer NULL;

COMMENT ON COLUMN public.taller_users.precio_plan_mensual IS
  'Precio mensual en MXN (189 = PLAN CORE, 299 = PLAN PRO). NULL = legado o sin dato.';

-- ===== MIGRATION: 20260401000001_ventas_cliente_id_telefono.sql =====

-- TallerCloud: agrega cliente_id (FK a clientes) y cliente_telefono a ventas
-- Permite vincular ventas del POS a un cliente registrado (sistema de recompensas futuro)
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS cliente_id       UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;

CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id
  ON ventas(taller_id, cliente_id)
  WHERE cliente_id IS NOT NULL;

-- ===== MIGRATION: 20260407000001_detalle_ventas_device_fields.sql =====

-- Agrega campos de hardware a detalle_ventas para persistir detalles del equipo al momento de la venta.
-- Estos campos se copian de productos.* en el momento de la venta para mantener historial inmutable.

ALTER TABLE public.detalle_ventas
  ADD COLUMN IF NOT EXISTS marca           TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS modelo          TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS procesador      TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ram             TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS almacenamiento  TEXT DEFAULT NULL;

-- ===== MIGRATION: 20260408000001_perf_indexes.sql =====

-- Performance indexes for the three instrumented hot paths.
-- All use IF NOT EXISTS — safe to re-run on any environment.

-- ─── POS: getProductosDisponibles ────────────────────────────────────────────
-- Query pattern: taller_id = ? AND stock_actual > 0 ORDER BY nombre ASC
-- Partial index covers only in-stock rows → smaller, faster index.
CREATE INDEX IF NOT EXISTS idx_productos_taller_stock_nombre
  ON productos(taller_id, nombre)
  WHERE stock_actual > 0;

-- ─── Historial de Ventas: ventas PDV ─────────────────────────────────────────
-- Query pattern: taller_id = ? AND estado IN (...) AND created_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_ventas_taller_created_at
  ON ventas(taller_id, created_at DESC);

-- ─── Historial de Ventas: cobros de reparación ───────────────────────────────
-- Query pattern: taller_id = ? AND tipo IN (...) AND fecha BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_taller_tipo_fecha
  ON movimientos_caja(taller_id, tipo, fecha DESC);

-- ─── Historial de Ventas: detalle_ventas lookup ──────────────────────────────
-- Query pattern: venta_id IN (...)
CREATE INDEX IF NOT EXISTS idx_detalle_ventas_venta_id
  ON detalle_ventas(venta_id);

-- ─── Reparaciones: list query ─────────────────────────────────────────────────
-- Query pattern: taller_id = ? ORDER BY created_at DESC LIMIT/OFFSET
-- (Likely exists from PERF-06 but included for completeness.)
CREATE INDEX IF NOT EXISTS idx_reparaciones_taller_created_at
  ON reparaciones(taller_id, created_at DESC);

-- ===== MIGRATION: 20260409000001_fn_finalizar_entrega_reparacion.sql =====

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

-- ===== MIGRATION: 20260409000002_clientes_fiscal_fields.sql =====

-- Información fiscal para clientes (CFDI 4.0)
-- Todos los campos son opcionales — el sistema no obliga a llenarlos.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rfc                 TEXT,
  ADD COLUMN IF NOT EXISTS razon_social        TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal      TEXT,
  ADD COLUMN IF NOT EXISTS uso_cfdi            TEXT;

-- ===== MIGRATION: 20260411000001_compras_schema.sql =====

-- ============================================================
-- MÓDULO: COMPRAS & PROVISIÓN
-- Proveedores + Órdenes de Compra + Detalle
-- Integración: recibir orden → actualiza stock en productos
-- ============================================================

-- ── Proveedores ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proveedores (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id  UUID        NOT NULL,
  nombre     TEXT        NOT NULL,
  contacto   TEXT,
  telefono   TEXT,
  email      TEXT,
  notas      TEXT,
  activo     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proveedores_taller ON proveedores(taller_id, activo);


-- ── Órdenes de Compra ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ordenes_compra (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        UUID        NOT NULL,
  folio            TEXT        NOT NULL,
  proveedor_id     UUID        REFERENCES proveedores(id) ON DELETE SET NULL,
  proveedor_nombre TEXT        NOT NULL DEFAULT '',
  estatus          TEXT        NOT NULL DEFAULT 'pendiente'
                   CHECK (estatus IN ('pendiente','recibida','parcial','cancelada')),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas            TEXT,
  fecha_orden      DATE        NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega    DATE,
  stock_aplicado   BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ordenes_compra_taller      ON ordenes_compra(taller_id, created_at DESC);
CREATE INDEX idx_ordenes_compra_taller_est  ON ordenes_compra(taller_id, estatus);


-- ── Detalle de Orden ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS detalle_orden_compra (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID          NOT NULL,
  orden_id        UUID          NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  descripcion     TEXT          NOT NULL,
  cantidad        NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  producto_id     UUID,         -- FK opcional a productos (para auto-stock)
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_detalle_orden_orden  ON detalle_orden_compra(orden_id);
CREATE INDEX idx_detalle_orden_taller ON detalle_orden_compra(taller_id);


-- ── RPC: recibir_orden_compra ─────────────────────────────────
-- Marca la orden como recibida Y actualiza stock en productos.
-- Idempotente: stock_aplicado evita doble conteo.

CREATE OR REPLACE FUNCTION recibir_orden_compra(
  p_orden_id  UUID,
  p_taller_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validar que la orden existe, pertenece al taller y no fue procesada
  IF NOT EXISTS (
    SELECT 1 FROM ordenes_compra
    WHERE id = p_orden_id
      AND taller_id = p_taller_id
      AND estatus IN ('pendiente', 'parcial')
      AND stock_aplicado = false
  ) THEN
    RAISE EXCEPTION 'Orden no encontrada, ya recibida o cancelada';
  END IF;

  -- Incrementar stock de productos vinculados
  UPDATE productos p
  SET    stock_actual = GREATEST(0, p.stock_actual + d.cantidad)
  FROM   detalle_orden_compra d
  WHERE  d.orden_id   = p_orden_id
    AND  d.taller_id  = p_taller_id
    AND  d.producto_id IS NOT NULL
    AND  d.producto_id = p.id
    AND  p.taller_id  = p_taller_id;

  -- Actualizar estatus y marcar stock como aplicado
  UPDATE ordenes_compra
  SET    estatus        = 'recibida',
         stock_aplicado = true,
         fecha_entrega  = COALESCE(fecha_entrega, CURRENT_DATE)
  WHERE  id        = p_orden_id
    AND  taller_id = p_taller_id;
END;
$$;


-- ===== MIGRATION: 20260415000001_folio_numerico_puro.sql =====

-- =============================================================================
-- Folios numéricos puros: solo el número entero como texto (sin prefijo)
-- Reemplaza el formato {prefijo}-{número} → ahora solo "{número}" (ej. "1", "2", "3")
-- prefijo_folio se conserva en la tabla pero ya no se usa en la asignación
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reescribir la función del trigger: folio = número entero como texto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reparaciones_assign_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next   INTEGER;
BEGIN
  -- Si el folio ya viene asignado, no tocar nada
  IF NEW.folio IS NOT NULL AND btrim(NEW.folio) <> '' THEN
    RETURN NEW;
  END IF;

  -- Asegurar que existe fila de configuración para este taller (guard de concurrencia)
  INSERT INTO configuracion_taller (taller_id, nombre_taller, prefijo_folio, siguiente_folio)
  VALUES (NEW.taller_id, 'Mi Taller', 'REP', 1)
  ON CONFLICT (taller_id) DO NOTHING;

  -- Leer y bloquear el contador actual
  SELECT ct.siguiente_folio
    INTO v_next
    FROM configuracion_taller ct
   WHERE ct.taller_id = NEW.taller_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró configuracion_taller para taller_id %', NEW.taller_id;
  END IF;

  v_next := COALESCE(v_next, 1);

  -- Asignar folio como entero puro en texto (sin prefijo, sin guion)
  NEW.folio := v_next::text;

  -- Incrementar el contador para la siguiente reparación
  UPDATE configuracion_taller
     SET siguiente_folio = v_next + 1
   WHERE taller_id = NEW.taller_id;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Resetear siguiente_folio = 1 en talleres sin reparaciones
-- Solo aplica si la tabla reparaciones está vacía (post-truncate).
-- Idempotente: si ya existen reparaciones para un taller, su contador no se toca.
-- -----------------------------------------------------------------------------
UPDATE configuracion_taller ct
   SET siguiente_folio = 1
 WHERE NOT EXISTS (
   SELECT 1 FROM reparaciones r
    WHERE r.taller_id = ct.taller_id
 );

-- -----------------------------------------------------------------------------
-- 3. Recrear el trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reparaciones_assign_folio ON public.reparaciones;

CREATE TRIGGER trg_reparaciones_assign_folio
  BEFORE INSERT ON public.reparaciones
  FOR EACH ROW
  EXECUTE PROCEDURE public.reparaciones_assign_folio();

-- ===== MIGRATION: 20260415000002_reparaciones_cliente_denormalized.sql =====

-- Migration: denormalize cliente_nombre / cliente_telefono on reparaciones
-- Purpose: enable .or() PostgREST search across folio, cliente_nombre,
--          cliente_telefono, marca, and modelo without a JOIN.
-- Date: 2026-04-15

-- 1. Add columns
ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS cliente_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;

-- 2. Backfill existing rows
UPDATE reparaciones r
   SET cliente_nombre    = c.nombre,
       cliente_telefono  = c.telefono
  FROM clientes c
 WHERE c.id = r.cliente_id
   AND (r.cliente_nombre IS NULL OR r.cliente_telefono IS NULL);

-- 3. Trigger function: sync on INSERT
CREATE OR REPLACE FUNCTION reparaciones_sync_cliente()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nombre, telefono
      INTO NEW.cliente_nombre, NEW.cliente_telefono
      FROM clientes
     WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger (BEFORE INSERT OR UPDATE OF cliente_id — syncs denormalized
--    fields when client assignment changes. Using UPDATE OF cliente_id avoids
--    unnecessary lookups when only status/price/etc. change)
DROP TRIGGER IF EXISTS trg_reparaciones_sync_cliente ON reparaciones;
CREATE TRIGGER trg_reparaciones_sync_cliente
  BEFORE INSERT OR UPDATE OF cliente_id ON reparaciones
  FOR EACH ROW
  EXECUTE FUNCTION reparaciones_sync_cliente();

-- 5. B-tree index on cliente_telefono for fast substring / equality lookups
CREATE INDEX IF NOT EXISTS idx_reparaciones_cliente_telefono
  ON reparaciones (cliente_telefono);

-- ===== MIGRATION: 20260415000003_clientes_sync_repairs.sql =====

-- =============================================================================
-- Reverse sync: when a client's name or phone changes, update all their repairs
-- Keeps reparaciones.cliente_nombre / cliente_telefono in sync with clientes table
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_repairs_on_cliente_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE reparaciones
     SET cliente_nombre    = NEW.nombre,
         cliente_telefono  = NEW.telefono
   WHERE cliente_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_sync_repairs ON public.clientes;

CREATE TRIGGER trg_clientes_sync_repairs
  AFTER UPDATE OF nombre, telefono ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_repairs_on_cliente_update();

-- ===== MIGRATION: 20260415000004_cancelacion_reparacion_tipo.sql =====

-- Migration: add 'devolucion_cancelacion' to movimientos_caja.tipo CHECK
-- Date: 2026-04-15
-- Context: cancelarReparacion() inserts reversal movements with this tipo.
--
-- Current valid tipos (from 20260329000001):
--   venta_pdv, anticipo_reparacion, liquidacion_reparacion, gasto, anulacion_venta
-- After this migration: same list + devolucion_cancelacion

ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;

ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN (
    'venta_pdv',
    'anticipo_reparacion',
    'liquidacion_reparacion',
    'gasto',
    'anulacion_venta',
    'devolucion_cancelacion'
  ));

-- ===== MIGRATION: 20260415000005_gasto_reparacion_tipo.sql =====

-- Migration: add 'gasto_reparacion' to movimientos_caja.tipo CHECK
-- Date: 2026-04-15
-- Context: addGastoTicket() inserts cash outflow movements with this tipo
--          to distinguish internal repair expenses from generic 'gasto' (bitacora_gastos).
--
-- Full list after this migration:
--   venta_pdv, anticipo_reparacion, liquidacion_reparacion, gasto,
--   anulacion_venta, devolucion_cancelacion, gasto_reparacion

ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS movimientos_caja_tipo_check;

ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT movimientos_caja_tipo_check CHECK (tipo IN (
    'venta_pdv',
    'anticipo_reparacion',
    'liquidacion_reparacion',
    'gasto',
    'anulacion_venta',
    'devolucion_cancelacion',
    'gasto_reparacion'
  ));

-- ===== MIGRATION: 20260415000006_movimientos_caja_abono_fields.sql =====

-- Migration: add folio and vendedor_nombre to movimientos_caja
-- Date: 2026-04-15
-- Context:
--   folio          → unique per-payment identifier (A-00001, A-00002, …)
--                    generated by registrarAbono at insert time
--   vendedor_nombre → display name of the staff member who registered the payment,
--                    denormalized for reporting without joining users tables

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS folio          TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT;

COMMENT ON COLUMN public.movimientos_caja.folio IS
  'Human-readable unique folio per payment movement (e.g. A-00001). NULL for older rows.';
COMMENT ON COLUMN public.movimientos_caja.vendedor_nombre IS
  'Display name of the staff member who created this movement. NULL for older rows.';

-- ===== MIGRATION: 20260415000007_abono_atomico_rpc.sql =====

-- Migration: atomic abono registration + unique sequential folio
-- Date: 2026-04-15
--
-- Problems solved:
--   1. Non-atomic writes: anticipo updated even when movimientos_caja INSERT fails.
--   2. Silent INSERT failures: folio/vendedor_nombre columns might not exist yet.
--   3. Race-condition folio: COUNT+1 approach generates duplicates under concurrency.
--
-- Solution:
--   - Ensure folio + vendedor_nombre columns exist (idempotent with migration 000006).
--   - Create a global PostgreSQL SEQUENCE for abono folio numbers (no race conditions).
--   - Create RPC `registrar_abono_atomico`: both writes happen in a single DB transaction.
--     If either fails, the whole transaction rolls back automatically.

-- ─── 1. Ensure folio and vendedor_nombre columns exist ───────────────────────
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS folio           TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_nombre  TEXT;

-- ─── 2. Global sequence for abono folio numbers ──────────────────────────────
-- Shared across all tallers so folios are globally unique (A-00001 … A-99999+).
CREATE SEQUENCE IF NOT EXISTS public.movimientos_caja_abono_seq START 1;

-- ─── 3. Atomic RPC ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_repair_id        uuid,
  p_taller_id        text,
  p_monto            numeric,
  p_metodo_pago      text,
  p_caja_id          text,
  p_folio_rep        text,
  p_cliente_nombre   text,
  p_vendedor_nombre  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_precio_estimado  numeric;
  v_nuevo_anticipo   numeric;
  v_liquidado        boolean;
  v_tipo             text;
  v_tipo_label       text;
  v_folio_abono      text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
  -- JWT tenant guard: caller must own this taller
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  -- Lock repair row to prevent concurrent double-payments
  -- NOTE: reparaciones.taller_id is uuid; p_taller_id is text → cast required.
  SELECT anticipo, precio_estimado
    INTO v_anticipo_actual, v_precio_estimado
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  -- Compute new totals
  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;
  v_liquidado      := (COALESCE(v_precio_estimado, 0) > 0
                       AND v_nuevo_anticipo >= COALESCE(v_precio_estimado, 0));
  v_tipo           := CASE WHEN v_liquidado
                           THEN 'liquidacion_reparacion'
                           ELSE 'anticipo_reparacion' END;
  v_tipo_label     := CASE WHEN v_liquidado THEN 'Liquidación' ELSE 'Anticipo' END;

  -- Generate folio from atomic sequence (no race conditions)
  v_folio_abono := 'A-' || LPAD(nextval('public.movimientos_caja_abono_seq')::text, 5, '0');

  -- Build description
  v_descripcion := v_tipo_label || ' — Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_cliente_nombre IS NOT NULL AND trim(p_cliente_nombre) <> '' THEN
    v_descripcion := v_descripcion || ' · ' || trim(p_cliente_nombre);
  END IF;

  -- Write 1: update anticipo
  UPDATE public.reparaciones
     SET anticipo = v_nuevo_anticipo
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  -- Write 2: insert cash movement (same transaction — if this fails, Write 1 rolls back)
  INSERT INTO public.movimientos_caja (
    taller_id,
    caja_id,
    tipo,
    referencia_id,
    descripcion,
    monto,
    metodo_pago,
    folio,
    vendedor_nombre,
    fecha
  ) VALUES (
    p_taller_id,
    p_caja_id::uuid,
    v_tipo,
    p_repair_id,
    v_descripcion,
    p_monto,
    p_metodo_pago,
    v_folio_abono,
    NULLIF(trim(p_vendedor_nombre), ''),
    now()
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'nuevo_anticipo', v_nuevo_anticipo,
    'liquidado',      v_liquidado,
    'folio_abono',    v_folio_abono,
    'movimiento_id',  v_mov_id
  );
END;
$$;

  TO authenticated;

-- ===== MIGRATION: 20260416000001_fix_abono_atomico_uuid_cast.sql =====

-- Migration: fix uuid = text type mismatch in registrar_abono_atomico
-- Date: 2026-04-16
--
-- Problem:
--   reparaciones.taller_id is uuid, but p_taller_id was declared text.
--   PostgreSQL raised: operator does not exist: uuid = text
--   Affected lines: SELECT...FOR UPDATE and UPDATE reparaciones.
--
-- Fix:
--   Cast p_taller_id::uuid in both WHERE clauses against reparaciones.
--   movimientos_caja.taller_id is text, so p_taller_id stays text there.

CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_repair_id        uuid,
  p_taller_id        text,
  p_monto            numeric,
  p_metodo_pago      text,
  p_caja_id          text,
  p_folio_rep        text,
  p_cliente_nombre   text,
  p_vendedor_nombre  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_precio_estimado  numeric;
  v_nuevo_anticipo   numeric;
  v_liquidado        boolean;
  v_tipo             text;
  v_tipo_label       text;
  v_folio_abono      text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
  -- JWT tenant guard: caller must own this taller
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  -- Lock repair row to prevent concurrent double-payments
  -- NOTE: reparaciones.taller_id is uuid; p_taller_id is text → cast required.
  SELECT anticipo, precio_estimado
    INTO v_anticipo_actual, v_precio_estimado
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  -- Compute new totals
  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;
  v_liquidado      := (COALESCE(v_precio_estimado, 0) > 0
                       AND v_nuevo_anticipo >= COALESCE(v_precio_estimado, 0));
  v_tipo           := CASE WHEN v_liquidado
                           THEN 'liquidacion_reparacion'
                           ELSE 'anticipo_reparacion' END;
  v_tipo_label     := CASE WHEN v_liquidado THEN 'Liquidación' ELSE 'Anticipo' END;

  -- Generate folio from atomic sequence (no race conditions)
  v_folio_abono := 'A-' || LPAD(nextval('public.movimientos_caja_abono_seq')::text, 5, '0');

  -- Build description
  v_descripcion := v_tipo_label || ' — Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_cliente_nombre IS NOT NULL AND trim(p_cliente_nombre) <> '' THEN
    v_descripcion := v_descripcion || ' · ' || trim(p_cliente_nombre);
  END IF;

  -- Write 1: update anticipo
  -- NOTE: reparaciones.taller_id is uuid → cast p_taller_id::uuid here too.
  UPDATE public.reparaciones
     SET anticipo = v_nuevo_anticipo
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  -- Write 2: insert cash movement (same transaction — if this fails, Write 1 rolls back)
  -- movimientos_caja.taller_id is text — no cast needed.
  INSERT INTO public.movimientos_caja (
    taller_id,
    caja_id,
    tipo,
    referencia_id,
    descripcion,
    monto,
    metodo_pago,
    folio,
    vendedor_nombre,
    fecha
  ) VALUES (
    p_taller_id,
    p_caja_id::uuid,
    v_tipo,
    p_repair_id,
    v_descripcion,
    p_monto,
    p_metodo_pago,
    v_folio_abono,
    NULLIF(trim(p_vendedor_nombre), ''),
    now()
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'nuevo_anticipo', v_nuevo_anticipo,
    'liquidado',      v_liquidado,
    'folio_abono',    v_folio_abono,
    'movimiento_id',  v_mov_id
  );
END;
$$;

  TO authenticated;

-- ===== MIGRATION: 20260416000002_liquidacion_atomica_rpc.sql =====

-- Migration: liquidacion_atomica RPC + better description format
-- Date: 2026-04-16
--
-- Changes:
--   1. New sequence for liquidacion folios (L-00001 … L-99999+)
--   2. registrar_abono_atomico: add p_dispositivo param, new description format
--      "Anticipo - Folio X (Marca Modelo)"  /  "Liquidación - Folio X (Marca Modelo)"
--      DROP old 8-param signature first (PostgreSQL treats different arity as overloads).
--   3. New registrar_liquidacion_atomica: single DB transaction that covers
--      movimientos_caja INSERT  +  reparaciones UPDATE (anticipo/estatus/fecha_entrega)
--      +  historial_reparacion INSERT — replaces the old crearVenta+finalizar_entrega flow.

-- ─── 1. Sequence for liquidacion folios ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.movimientos_caja_liquidacion_seq START 1;

-- ─── 2. Update registrar_abono_atomico (drop 8-param, recreate as 9-param) ──
DROP FUNCTION IF EXISTS public.registrar_abono_atomico(uuid, text, numeric, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.registrar_abono_atomico(
  p_repair_id        uuid,
  p_taller_id        text,
  p_monto            numeric,
  p_metodo_pago      text,
  p_caja_id          text,
  p_folio_rep        text,
  p_cliente_nombre   text,
  p_vendedor_nombre  text,
  p_dispositivo      text    -- "Marca Modelo" e.g. "Apple iPhone 17"
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_precio_estimado  numeric;
  v_nuevo_anticipo   numeric;
  v_liquidado        boolean;
  v_tipo             text;
  v_tipo_label       text;
  v_folio_abono      text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  SELECT anticipo, precio_estimado
    INTO v_anticipo_actual, v_precio_estimado
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;
  v_liquidado      := (COALESCE(v_precio_estimado, 0) > 0
                       AND v_nuevo_anticipo >= COALESCE(v_precio_estimado, 0));
  v_tipo           := CASE WHEN v_liquidado THEN 'liquidacion_reparacion' ELSE 'anticipo_reparacion' END;
  v_tipo_label     := CASE WHEN v_liquidado THEN 'Liquidación' ELSE 'Anticipo' END;

  v_folio_abono := 'A-' || LPAD(nextval('public.movimientos_caja_abono_seq')::text, 5, '0');

  -- "Anticipo - Folio CDS001 (Apple iPhone 17)"
  v_descripcion := v_tipo_label || ' - Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_dispositivo IS NOT NULL AND trim(p_dispositivo) <> '' THEN
    v_descripcion := v_descripcion || ' (' || trim(p_dispositivo) || ')';
  END IF;

  UPDATE public.reparaciones
     SET anticipo = v_nuevo_anticipo
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  INSERT INTO public.movimientos_caja (
    taller_id, caja_id, tipo, referencia_id, descripcion,
    monto, metodo_pago, folio, vendedor_nombre, fecha
  ) VALUES (
    p_taller_id, p_caja_id::uuid, v_tipo, p_repair_id, v_descripcion,
    p_monto, p_metodo_pago, v_folio_abono, NULLIF(trim(p_vendedor_nombre), ''), now()
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'nuevo_anticipo', v_nuevo_anticipo,
    'liquidado',      v_liquidado,
    'folio_abono',    v_folio_abono,
    'movimiento_id',  v_mov_id
  );
END;
$$;

  TO authenticated;

-- ─── 3. registrar_liquidacion_atomica ───────────────────────────────────────
-- Replaces the old crearVenta + finalizar_entrega_reparacion two-step flow.
-- Everything in one PostgreSQL transaction: if any write fails, all roll back.
CREATE OR REPLACE FUNCTION public.registrar_liquidacion_atomica(
  p_repair_id       uuid,
  p_taller_id       text,
  p_monto           numeric,
  p_metodo_pago     text,
  p_caja_id         text,
  p_folio_rep       text,
  p_dispositivo     text,
  p_vendedor_nombre text,
  p_estado_anterior text,
  p_nota_tecnica    text,
  p_actor_nombre    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anticipo_actual  numeric;
  v_nuevo_anticipo   numeric;
  v_folio_liq        text;
  v_mov_id           uuid;
  v_descripcion      text;
BEGIN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso no autorizado.');
  END IF;

  -- Lock repair to prevent concurrent double-delivery
  SELECT anticipo
    INTO v_anticipo_actual
    FROM public.reparaciones
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Reparación no encontrada.');
  END IF;

  v_nuevo_anticipo := COALESCE(v_anticipo_actual, 0) + p_monto;

  v_folio_liq := 'L-' || LPAD(nextval('public.movimientos_caja_liquidacion_seq')::text, 5, '0');

  -- "Liquidación - Folio CDS001 (Apple iPhone 17)"
  v_descripcion := 'Liquidación - Folio ' || COALESCE(NULLIF(trim(p_folio_rep), ''), '?');
  IF p_dispositivo IS NOT NULL AND trim(p_dispositivo) <> '' THEN
    v_descripcion := v_descripcion || ' (' || trim(p_dispositivo) || ')';
  END IF;

  -- Write 1: cash movement (liquidacion_reparacion, NOT venta_pdv)
  INSERT INTO public.movimientos_caja (
    taller_id, caja_id, tipo, referencia_id, descripcion,
    monto, metodo_pago, folio, vendedor_nombre, fecha
  ) VALUES (
    p_taller_id, p_caja_id::uuid, 'liquidacion_reparacion', p_repair_id, v_descripcion,
    p_monto, p_metodo_pago, v_folio_liq, NULLIF(trim(p_vendedor_nombre), ''), now()
  )
  RETURNING id INTO v_mov_id;

  -- Write 2: repair row (anticipo + status + delivery date)
  UPDATE public.reparaciones
     SET anticipo      = v_nuevo_anticipo,
         estatus       = 'Entregado',
         fecha_entrega = now()
   WHERE id = p_repair_id
     AND taller_id = p_taller_id::uuid;

  -- Write 3: audit history
  INSERT INTO public.historial_reparacion (
    reparacion_id, taller_id, usuario_id,
    estado_anterior, estado_nuevo, nota_tecnica, actor_nombre
  ) VALUES (
    p_repair_id, p_taller_id::uuid, p_taller_id::uuid,
    p_estado_anterior, 'Entregado',
    NULLIF(TRIM(p_nota_tecnica), ''), p_actor_nombre
  );

  RETURN jsonb_build_object(
    'ok',                true,
    'nuevo_anticipo',    v_nuevo_anticipo,
    'folio_liquidacion', v_folio_liq,
    'movimiento_id',     v_mov_id
  );
END;
$$;

  TO authenticated;

-- ===== MIGRATION: 20260416000003_crear_reparacion_con_anticipo.sql =====

-- Migration: 20260416000003_crear_reparacion_con_anticipo.sql
--
-- Adds RPC `registrar_movimiento_anticipo_inicial` that inserts the opening
-- anticipo into movimientos_caja when a new repair is created with a deposit.
--
-- This RPC intentionally does NOT update reparaciones.anticipo — that field is
-- already set during the INSERT in createRepairInner. It only registers the
-- cash-drawer movement so the corte de caja stays accurate.
--
-- If this RPC fails the caller (createRepairInner) must DELETE the repair
-- to enforce the strict-failure / atomic guarantee.

CREATE OR REPLACE FUNCTION registrar_movimiento_anticipo_inicial(
  p_repair_id       uuid,
  p_taller_id       text,
  p_monto           numeric,
  p_metodo_pago     text,
  p_caja_id         text,
  p_folio_rep       text,
  p_dispositivo     text,
  p_vendedor_nombre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_jwt_taller_id  text;
  v_seq_val        bigint;
  v_folio_mov      text;
  v_movimiento_id  uuid;
  v_descripcion    text;
BEGIN
  -- ── JWT tenant guard ─────────────────────────────────────────────────────
  IF v_jwt_taller_id IS DISTINCT FROM p_taller_id THEN
    RAISE EXCEPTION 'tenant_mismatch: jwt=% param=%', v_jwt_taller_id, p_taller_id;
  END IF;

  -- ── Validate caja still open (race-condition guard) ──────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM caja
    WHERE id = p_caja_id
      AND taller_id = p_taller_id
      AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'caja_not_open: caja_id=% taller=%', p_caja_id, p_taller_id;
  END IF;

  -- ── Validate repair belongs to this tenant ────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM reparaciones
    WHERE id = p_repair_id
      AND taller_id = p_taller_id::uuid
  ) THEN
    RAISE EXCEPTION 'repair_not_found: repair_id=% taller=%', p_repair_id, p_taller_id;
  END IF;

  -- ── Generate folio A-XXXXX ─────────────────────────────────────────────
  SELECT nextval('movimientos_caja_abono_seq') INTO v_seq_val;
  v_folio_mov := 'A-' || LPAD(v_seq_val::text, 5, '0');

  -- ── Build description ────────────────────────────────────────────────────
  IF p_dispositivo IS NOT NULL AND p_dispositivo <> '' THEN
    v_descripcion := 'Anticipo - Folio ' || p_folio_rep || ' (' || p_dispositivo || ')';
  ELSE
    v_descripcion := 'Anticipo - Folio ' || p_folio_rep;
  END IF;

  -- ── Insert movement ───────────────────────────────────────────────────────
  INSERT INTO movimientos_caja (
    taller_id,
    caja_id,
    tipo,
    monto,
    metodo_pago,
    descripcion,
    referencia_id,
    folio,
    vendedor_nombre
  ) VALUES (
    p_taller_id,
    p_caja_id,
    'anticipo_reparacion',
    p_monto,
    p_metodo_pago,
    v_descripcion,
    p_repair_id::text,
    v_folio_mov,
    p_vendedor_nombre
  )
  RETURNING id INTO v_movimiento_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'movimiento_id', v_movimiento_id,
    'folio',        v_folio_mov
  );
END;
$$;

  TO authenticated;

-- ===== MIGRATION: 20260416000004_admin_otp_codes.sql =====

-- Migration: 20260416000004_admin_otp_codes.sql
--
-- Creates the table for admin 2FA OTP codes.
-- Only accessible via service_role (no RLS, no public access).

CREATE TABLE IF NOT EXISTS public.admin_otp_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    text        NOT NULL,         -- tallerId of the super-admin (text, matches cookie)
  code        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CONSTRAINT admin_otp_code_format CHECK (code ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_admin_id
  ON public.admin_otp_codes (admin_id, created_at DESC);

-- No RLS — table is never queried by JWT-authenticated clients.
-- All access goes through service_role via createAdminClient().
ALTER TABLE public.admin_otp_codes DISABLE ROW LEVEL SECURITY;


-- ===== MIGRATION: 20260422000001_sync_plan_tipo_with_expiry.sql =====

-- Migración: sincronizar plan_tipo con fecha_vencimiento_plan
-- Problema: cuentas con fecha de vencimiento futura tenían plan_tipo = "prueba"
-- porque extendSuscripcion y actualizarPlanActivo no actualizaban plan_tipo.
--
-- Esta migración promueve a "activo" cualquier cuenta que tenga:
--   - fecha_vencimiento_plan en el futuro (o hoy)
--   - plan_tipo = "prueba"
--
-- También sincroniza plan_activo e is_pro para coherencia.

UPDATE public.taller_users
SET
  plan_tipo = 'activo',
  plan_activo = true,
  is_pro = true
WHERE
  plan_tipo = 'prueba'
  AND fecha_vencimiento_plan IS NOT NULL
  AND fecha_vencimiento_plan >= CURRENT_DATE;

-- Opcional: si hay cuentas con plan_tipo = 'prueba' y fecha_vencimiento_plan pasada,
-- dejarlas como están (ya muestran 0 días) o suspenderlas según política de negocio.
-- Por seguridad, no tocamos esas.

-- ===== MIGRATION: 20260425000001_reparaciones_add_color.sql =====

-- Agregar columna color a reparaciones (ya se referencia en código pero no existía en BD)
ALTER TABLE public.reparaciones
ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.reparaciones.color IS 'Color del dispositivo (ej: Negro, Azul, Rojo)';

-- ===== MIGRATION: 20260426000001_impresion_config_and_social_media.sql =====

-- Fase 1: Infraestructura del módulo IMPRENTA
-- Agrega configuración de impresión JSONB y redes sociales al perfil del taller

-- 1) Configuración de impresión por tipo de documento
ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS impresion_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.configuracion_taller.impresion_config IS
  'Configuración de impresión por tipo de documento: reparacion, venta, compra, etiqueta, barras. Cada key contiene {formato, mostrarLogo, mostrarTecnico, mostrarPrecios, mostrarRedesSociales, terminos, despedida, declaracionJurat}';

-- 2) Redes sociales del taller (para mostrar en tickets)
ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS facebook  TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS tiktok    TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp  TEXT;

COMMENT ON COLUMN public.configuracion_taller.facebook  IS 'URL o nombre de usuario de Facebook del taller';
COMMENT ON COLUMN public.configuracion_taller.instagram IS 'URL o @usuario de Instagram del taller';
COMMENT ON COLUMN public.configuracion_taller.tiktok    IS 'URL o @usuario de TikTok del taller';
COMMENT ON COLUMN public.configuracion_taller.whatsapp  IS 'Número de WhatsApp del taller (sin +52)';

-- 3) Índice GIN para búsquedas rápidas dentro de impresion_config
CREATE INDEX IF NOT EXISTS idx_configuracion_taller_impresion_config
  ON public.configuracion_taller USING GIN (impresion_config);

-- ===== MIGRATION: 20260427000001_catalogo_servicios.sql =====

-- =============================================================
-- CATÁLOGO DE SERVICIOS + VÍNCULO CON REPARACIONES
-- =============================================================

-- ─── Tabla: catalogo_servicios ─────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_servicios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id   UUID NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      DECIMAL(10, 2) NOT NULL CHECK (precio >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


  ON catalogo_servicios
  FOR ALL
  TO authenticated

CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_taller
  ON catalogo_servicios (taller_id);

CREATE INDEX IF NOT EXISTS idx_catalogo_servicios_nombre
  ON catalogo_servicios (taller_id, nombre);

-- ─── Tabla: reparacion_servicios (pivote) ──────────────────────
CREATE TABLE IF NOT EXISTS reparacion_servicios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID NOT NULL,
  reparacion_id   UUID NOT NULL REFERENCES reparaciones(id) ON DELETE CASCADE,
  servicio_id     UUID REFERENCES catalogo_servicios(id) ON DELETE SET NULL,
  nombre_snapshot TEXT NOT NULL,
  precio_snapshot DECIMAL(10, 2) NOT NULL CHECK (precio_snapshot >= 0),
  cantidad        INTEGER NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


  ON reparacion_servicios
  FOR ALL
  TO authenticated

CREATE INDEX IF NOT EXISTS idx_reparacion_servicios_reparacion
  ON reparacion_servicios (taller_id, reparacion_id);

-- ===== MIGRATION: 20260429000001_compras_estados_borrador.sql =====

-- ============================================================
-- MIGRACIÓN: Actualizar estados de órdenes de compra + columnas extra
-- Agrega borrador, en_transito y campos de auditoría
-- ============================================================

-- 1. Agregar columna errores_recepcion si no existe (usada por código existente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordenes_compra' AND column_name = 'errores_recepcion'
  ) THEN
    ALTER TABLE ordenes_compra ADD COLUMN errores_recepcion JSONB DEFAULT NULL;
  END IF;
END $$;

-- 2. Agregar columna custodio (quién creó/emitió la orden)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ordenes_compra' AND column_name = 'custodio'
  ) THEN
    ALTER TABLE ordenes_compra ADD COLUMN custodio TEXT DEFAULT NULL;
  END IF;
END $$;

-- 3. Actualizar CHECK constraint de estatus para incluir borrador y en_transito
DO $$
BEGIN
  -- Eliminar constraint anterior si existe
  ALTER TABLE ordenes_compra
    DROP CONSTRAINT IF EXISTS ordenes_compra_estatus_check;

  -- Agregar nuevo constraint con todos los estados
  ALTER TABLE ordenes_compra
    ADD CONSTRAINT ordenes_compra_estatus_check
    CHECK (estatus IN ('borrador','en_transito','pendiente','recibida','parcial','cancelada'));
END $$;

-- ===== MIGRATION: 20260429000002_compras_usadas.sql =====

-- ============================================================
-- MÓDULO: Compras de Equipos Usados (Activos Adquiridos)
-- ============================================================

CREATE TABLE IF NOT EXISTS compras_usadas (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id       UUID          NOT NULL,
  folio           TEXT          NOT NULL,
  fecha           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  vendedor        TEXT          NOT NULL,
  documento       TEXT          NOT NULL,
  telefono        TEXT,
  marca           TEXT          NOT NULL,
  modelo          TEXT          NOT NULL,
  serial          TEXT,
  imei            TEXT,
  color           TEXT,
  condicion       TEXT,
  capacidad       TEXT,
  monto           NUMERIC(12,2) NOT NULL,
  observaciones   TEXT,
  actor_nombre    TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_compras_usadas_taller ON compras_usadas(taller_id, created_at DESC);


-- ===== MIGRATION: 20260429000003_ventas_descuento.sql =====

-- ============================================================
-- MIGRACIÓN: Agregar columna descuento a ventas
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ventas' AND column_name = 'descuento'
  ) THEN
    ALTER TABLE ventas ADD COLUMN descuento NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ===== MIGRATION: 20260429000004_caja_saldo_actual.sql =====

-- ============================================================
-- MIGRACIÓN: Agregar columna saldo_actual a tabla caja
-- Esta columna es necesaria para registrar egresos (compras usadas,
-- gastos, anticipos de reparación) verificando fondos disponibles.
-- ============================================================

-- 1. Agregar columna si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caja' AND column_name = 'saldo_actual'
  ) THEN
    ALTER TABLE caja ADD COLUMN saldo_actual NUMERIC(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. Inicializar saldo_actual para cajas existentes basándose en
--    monto_inicial + total_efectivo (aproximación del saldo disponible)
UPDATE caja
SET saldo_actual = COALESCE(monto_inicial, 0) + COALESCE(total_efectivo, 0)
WHERE saldo_actual = 0;

-- ===== MIGRATION: 20260501000001_admin_otp_rate_limit.sql =====

-- Migration: 20260501000001_admin_otp_rate_limit.sql
--
-- Adds attempts tracking and extends OTP to 8 digits for better security.

-- Add attempts counter for rate limiting failed verifications
ALTER TABLE public.admin_otp_codes
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Update constraint to allow 8-digit OTPs
ALTER TABLE public.admin_otp_codes
  DROP CONSTRAINT IF EXISTS admin_otp_code_format;

ALTER TABLE public.admin_otp_codes
  ADD CONSTRAINT admin_otp_code_format CHECK (code ~ '^[0-9]{8}$');

-- Create index for efficient failed-attempts lookup
CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_attempts
  ON public.admin_otp_codes (admin_id, attempts, created_at DESC);

-- ===== MIGRATION: 20260501000002_session_version.sql =====

-- Migration: 20260501000002_session_version.sql
--
-- Agrega session_version para invalidar sesiones existentes
-- cuando el usuario cambia su contraseña.

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;

-- ===== MIGRATION: 20260501000003_atomic_folio_sequence.sql =====

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


-- ===== MIGRATION: 20260501000004_detalle_ventas_categoria.sql =====

-- Migration: 20260501000004_detalle_ventas_categoria.sql
--
-- Agrega columna categoria a detalle_ventas para mostrar categoría en tickets.

ALTER TABLE public.detalle_ventas
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT NULL;

-- ===== MIGRATION: 20260502000001_bitacora_visitas.sql =====

-- Migration: 20260502000001_bitacora_visitas.sql
--
-- Crea tabla para registro automático de visitas al mostrador
-- mediante detección de cámara Hikvision (IVS) o manual.

CREATE TABLE IF NOT EXISTS public.bitacora_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id TEXT NOT NULL,

  -- Timestamps de la visita
  fecha_hora_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_hora_salida  TIMESTAMPTZ,

  -- Datos capturados por la cámara
  foto_entrada_url TEXT,
  foto_salida_url  TEXT,
  camara_ip        TEXT,
  evento_tipo      TEXT DEFAULT 'manual', -- 'line_crossing', 'intrusion', 'manual'

  -- Encuesta / motivo de visita (obligatorios para cerrar caja)
  motivo_visita      TEXT, -- 'reparacion', 'cotizacion', 'compra', 'recoger', 'personal', 'otro'
  motivo_otro        TEXT,
  estado_atencion    TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'atendido', 'no_atendido', 'se_fue'

  -- Vinculación con operaciones del sistema
  reparacion_folio TEXT,
  venta_folio      TEXT,

  -- Quién atendió la visita (usuario de TallerCloud)
  atendido_por UUID,
  notas        TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_taller_fecha
  ON public.bitacora_visitas (taller_id, fecha_hora_entrada DESC);

CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_estado_pendiente
  ON public.bitacora_visitas (taller_id, fecha_hora_entrada)
  WHERE estado_atencion = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_folio_rep
  ON public.bitacora_visitas (reparacion_folio)
  WHERE reparacion_folio IS NOT NULL;

-- Comentarios
COMMENT ON TABLE public.bitacora_visitas IS
  'Registro automático de visitas al mostrador mediante detección IVS de cámara Hikvision';

COMMENT ON COLUMN public.bitacora_visitas.motivo_visita IS
  'Motivo de la visita: reparacion, cotizacion, compra, recoger, personal, otro';

COMMENT ON COLUMN public.bitacora_visitas.estado_atencion IS
  'pendiente = sin encuesta; atendido = con encuesta; no_atendido = se fue sin ser atendido; se_fue = detectó salida';

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_bitacora_visitas_updated_at
  BEFORE UPDATE ON public.bitacora_visitas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();


-- Política: usuarios solo ven registros de su taller
  ON public.bitacora_visitas
  FOR ALL
  USING (taller_id = current_setting('app.current_taller_id', true));

-- ===== MIGRATION: 20260502000002_camara_config.sql =====

-- Migration: 20260502000002_camara_config.sql
--
-- Agrega configuración de cámaras (webcam + Hikvision IP) a configuracion_taller.

ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS camara_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.configuracion_taller.camara_config IS
  'Configuración de cámaras: {hikvision: {enabled, ip, port, username, password_encrypted, detection_type, snapshot_channel, webhook_secret}, webcam: {enabled, device_id, label, usar_para_visitas}}';

-- Índice GIN para búsquedas rápidas dentro de camara_config
CREATE INDEX IF NOT EXISTS idx_configuracion_taller_camara_config
  ON public.configuracion_taller USING GIN (camara_config);

-- El bucket 'visitas' debe crearse manualmente en Supabase Dashboard con:
--   public = false
--   allowed mime types: image/jpeg, image/png
--   file size limit: 2MB

-- ===== MIGRATION: 20260504000001_ventas_vendedor_nombre.sql =====

-- Migration: add vendedor_nombre to ventas
-- Purpose: track which staff member registered each PDV sale

ALTER TABLE public.ventas
ADD COLUMN IF NOT EXISTS vendedor_nombre TEXT;

COMMENT ON COLUMN public.ventas.vendedor_nombre IS
  'Nombre visible del usuario que registró la venta (miembro del taller o propietario).';

-- ===== MIGRATION: 20260505000001_fix_anular_venta_pdv_compat.sql =====

-- Redefinir anular_venta_pdv con p_anulado_por como text para compatibilidad con RPC
-- (Supabase infiere tipos desde TypeScript; pasar string a uuid causa "function not found").

-- Asegurar columnas de auditoría
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES public.taller_users(id) ON DELETE SET NULL;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS motivo_anulacion text;

-- Estado: activa | anulado
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
UPDATE public.ventas SET estado = 'anulado' WHERE estado = 'cancelada';
ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_estado_check CHECK (estado IN ('activa', 'anulado'));

-- RPC atómica: anular venta PDV (compatibilidad text → uuid)
CREATE OR REPLACE FUNCTION public.anular_venta_pdv(
  p_venta_id uuid,
  p_taller_id text,
  p_anulado_por text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  items jsonb;
  v_metodo text;
  v_anulado_por uuid;
BEGIN
  IF p_taller_id IS NULL OR trim(p_taller_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'taller_id requerido.');
  END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado para este taller.');
  END IF;

  v_anulado_por := NULLIF(trim(p_anulado_por), '')::uuid;

  SELECT
    id,
    taller_id,
    caja_id,
    folio,
    total,
    estado,
    metodo_pago,
    monto_efectivo,
    monto_tarjeta,
    monto_transferencia
  INTO v
  FROM public.ventas
  WHERE id = p_venta_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no encontrada.');
  END IF;

  IF v.taller_id IS DISTINCT FROM p_taller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Venta no pertenece al taller.');
  END IF;

  IF v.estado IS DISTINCT FROM 'activa' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta no está activa.');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'producto_id', d.producto_id::text,
        'taller_id', p_taller_id,
        'cantidad', d.cantidad
      )
    ),
    '[]'::jsonb
  )
  INTO items
  FROM public.detalle_ventas d
  WHERE d.venta_id = p_venta_id
    AND d.producto_id IS NOT NULL
    AND NOT COALESCE(d.es_especial, false);

  IF items IS NOT NULL AND jsonb_array_length(items) > 0 THEN
    PERFORM public.batch_increment_stock(items);
  END IF;

  IF v.caja_id IS NOT NULL THEN
    UPDATE public.caja c
    SET
      total_efectivo = c.total_efectivo - COALESCE(v.monto_efectivo, 0),
      total_tarjeta = c.total_tarjeta - COALESCE(v.monto_tarjeta, 0),
      total_transferencia = c.total_transferencia - COALESCE(v.monto_transferencia, 0),
      total_ventas = GREATEST(0, c.total_ventas - 1)
    WHERE c.id = v.caja_id
      AND c.taller_id = p_taller_id;

    v_metodo := lower(COALESCE(v.metodo_pago, 'efectivo'));
    IF v_metodo NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto') THEN
      v_metodo := 'efectivo';
    END IF;

    INSERT INTO public.movimientos_caja (
      taller_id,
      caja_id,
      tipo,
      referencia_id,
      descripcion,
      monto,
      metodo_pago,
      fecha
    )
    VALUES (
      p_taller_id,
      v.caja_id,
      'anulacion_venta',
      p_venta_id,
      'Anulación ' || COALESCE(v.folio, ''),
      -ABS(COALESCE(v.total, 0)),
      v_metodo,
      NOW()
    );
  END IF;

  UPDATE public.ventas
  SET
    estado = 'anulado',
    anulado_por = v_anulado_por,
    fecha_anulacion = NOW(),
    motivo_anulacion = NULLIF(trim(p_motivo), '')
  WHERE id = p_venta_id;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


-- ===== MIGRATION: 20260514000001_add_pais_to_config.sql =====

ALTER TABLE configuracion_taller
  ADD COLUMN IF NOT EXISTS pais VARCHAR(100) NOT NULL DEFAULT 'México';

-- ===== MIGRATION: 20260522000001_cotizaciones_schema.sql =====

-- ============================================================
-- MODULO PRO: COTIZACIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  folio TEXT NOT NULL,
  cliente_id UUID NULL REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NULL,
  equipo_tipo TEXT NOT NULL DEFAULT 'Celular',
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  observaciones TEXT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada', 'convertida')),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_expiracion DATE NULL,
  creado_por TEXT NULL,
  reparacion_id UUID NULL REFERENCES reparaciones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (taller_id, folio)
);

CREATE TABLE IF NOT EXISTS cotizacion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_unitario >= 0),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_taller_created_at ON cotizaciones(taller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_taller_estado ON cotizaciones(taller_id, estado);
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_taller_cotizacion ON cotizacion_items(taller_id, cotizacion_id);

CREATE OR REPLACE FUNCTION touch_updated_at_cotizaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at_cotizaciones ON cotizaciones;
CREATE TRIGGER trg_touch_updated_at_cotizaciones
BEFORE UPDATE ON cotizaciones
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at_cotizaciones();

DROP TRIGGER IF EXISTS trg_touch_updated_at_cotizacion_items ON cotizacion_items;
CREATE TRIGGER trg_touch_updated_at_cotizacion_items
BEFORE UPDATE ON cotizacion_items
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at_cotizaciones();




-- ===== MIGRATION: 20260522000002_chat_taller_schema.sql =====

-- ============================================================
-- MODULO PRO: CHAT TALLER
-- ============================================================

CREATE TABLE IF NOT EXISTS workshop_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id UUID NOT NULL,
  sender_id UUID NULL,
  sender_name TEXT NOT NULL DEFAULT 'Tecnico',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workshop_messages_taller_created
  ON workshop_messages(taller_id, created_at DESC);



-- ===== MIGRATION: 20260522000003_chat_private_messages.sql =====

-- ============================================================
-- CHAT TALLER: MENSAJERIA PRIVADA 1:1
-- ============================================================

ALTER TABLE workshop_messages
  ADD COLUMN IF NOT EXISTS recipient_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_messages_taller_recipient_created
  ON workshop_messages(taller_id, recipient_id, created_at DESC);

COMMIT;

