-- Reglas PRO por taller (flujo obligatorio: health check, firma, evidencia fotográfica).

CREATE TABLE IF NOT EXISTS public.ajustes_taller (
  taller_id uuid PRIMARY KEY REFERENCES public.taller_users(id) ON DELETE CASCADE,
  health_check_required boolean NOT NULL DEFAULT false,
  firma_required boolean NOT NULL DEFAULT false,
  fotos_required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ajustes_taller IS 'Flags de flujo PRO por tenant (reglas antes de avanzar estatus).';

ALTER TABLE public.ajustes_taller ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ajustes_taller_select" ON public.ajustes_taller FOR SELECT
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "ajustes_taller_insert" ON public.ajustes_taller FOR INSERT
  WITH CHECK (taller_id = (auth.jwt() ->> 'taller_id')::uuid);

CREATE POLICY "ajustes_taller_update" ON public.ajustes_taller FOR UPDATE
  USING (taller_id = (auth.jwt() ->> 'taller_id')::uuid);
