-- Firma digital de ingreso: tokens y almacenamiento en bucket privado `firmas`.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS firma_ingreso_path TEXT;

COMMENT ON COLUMN public.reparaciones.firma_ingreso_path IS 'Ruta en Storage (bucket firmas) de la imagen de firma del cliente.';

CREATE TABLE IF NOT EXISTS public.firma_digital_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  taller_id UUID NOT NULL REFERENCES public.taller_users(id) ON DELETE CASCADE,
  reparacion_id UUID NOT NULL REFERENCES public.reparaciones(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_firma_digital_tokens_token ON public.firma_digital_tokens(token);
CREATE INDEX IF NOT EXISTS idx_firma_digital_tokens_reparacion ON public.firma_digital_tokens(reparacion_id);

ALTER TABLE public.firma_digital_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firmas',
  'firmas',
  false,
  5242880,
  ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
