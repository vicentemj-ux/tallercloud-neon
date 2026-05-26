-- Asegura default UTC para nuevos talleres en configuración
ALTER TABLE configuracion_taller
  ALTER COLUMN zona_horaria SET DEFAULT 'UTC';

-- Normaliza filas sin valor explícito
UPDATE configuracion_taller
SET zona_horaria = 'UTC'
WHERE zona_horaria IS NULL OR btrim(zona_horaria) = '';
