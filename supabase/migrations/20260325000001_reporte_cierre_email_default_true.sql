-- Envío automático de reporte de cierre por email: default ON para nuevas filas.
ALTER TABLE configuracion_taller
  ALTER COLUMN reportes_cierre_caja SET DEFAULT true;
