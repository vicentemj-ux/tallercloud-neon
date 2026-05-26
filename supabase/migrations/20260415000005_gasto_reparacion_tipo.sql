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
