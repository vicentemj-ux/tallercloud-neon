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
