-- Migration: 20260501000004_detalle_ventas_categoria.sql
--
-- Agrega columna categoria a detalle_ventas para mostrar categoría en tickets.

ALTER TABLE public.detalle_ventas
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT NULL;
