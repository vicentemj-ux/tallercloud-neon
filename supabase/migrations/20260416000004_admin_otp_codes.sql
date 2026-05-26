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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_otp_codes TO service_role;
