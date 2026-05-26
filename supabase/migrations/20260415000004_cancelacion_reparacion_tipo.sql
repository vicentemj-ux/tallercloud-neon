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
