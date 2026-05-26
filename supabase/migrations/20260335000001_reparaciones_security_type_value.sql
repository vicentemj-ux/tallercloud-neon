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
