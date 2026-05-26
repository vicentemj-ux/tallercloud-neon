-- Migration: 20260501000001_admin_otp_rate_limit.sql
--
-- Adds attempts tracking and extends OTP to 8 digits for better security.

-- Add attempts counter for rate limiting failed verifications
ALTER TABLE public.admin_otp_codes
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Update constraint to allow 8-digit OTPs
ALTER TABLE public.admin_otp_codes
  DROP CONSTRAINT IF EXISTS admin_otp_code_format;

ALTER TABLE public.admin_otp_codes
  ADD CONSTRAINT admin_otp_code_format CHECK (code ~ '^[0-9]{8}$');

-- Create index for efficient failed-attempts lookup
CREATE INDEX IF NOT EXISTS idx_admin_otp_codes_attempts
  ON public.admin_otp_codes (admin_id, attempts, created_at DESC);
