-- =============================================================
-- SEC-09: Rate limiting para endpoints de autenticación
--
-- Tabla ligera que registra intentos de operaciones de auth.
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
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
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
