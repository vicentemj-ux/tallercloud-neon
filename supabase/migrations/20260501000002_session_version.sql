-- Migration: 20260501000002_session_version.sql
--
-- Agrega session_version para invalidar sesiones existentes
-- cuando el usuario cambia su contraseña.

ALTER TABLE public.taller_users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
