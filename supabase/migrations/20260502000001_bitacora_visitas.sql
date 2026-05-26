-- Migration: 20260502000001_bitacora_visitas.sql
--
-- Crea tabla para registro automático de visitas al mostrador
-- mediante detección de cámara Hikvision (IVS) o manual.

CREATE TABLE IF NOT EXISTS public.bitacora_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id TEXT NOT NULL,

  -- Timestamps de la visita
  fecha_hora_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_hora_salida  TIMESTAMPTZ,

  -- Datos capturados por la cámara
  foto_entrada_url TEXT,
  foto_salida_url  TEXT,
  camara_ip        TEXT,
  evento_tipo      TEXT DEFAULT 'manual', -- 'line_crossing', 'intrusion', 'manual'

  -- Encuesta / motivo de visita (obligatorios para cerrar caja)
  motivo_visita      TEXT, -- 'reparacion', 'cotizacion', 'compra', 'recoger', 'personal', 'otro'
  motivo_otro        TEXT,
  estado_atencion    TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'atendido', 'no_atendido', 'se_fue'

  -- Vinculación con operaciones del sistema
  reparacion_folio TEXT,
  venta_folio      TEXT,

  -- Quién atendió la visita (usuario de TallerCloud)
  atendido_por UUID,
  notas        TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_taller_fecha
  ON public.bitacora_visitas (taller_id, fecha_hora_entrada DESC);

CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_estado_pendiente
  ON public.bitacora_visitas (taller_id, fecha_hora_entrada)
  WHERE estado_atencion = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_bitacora_visitas_folio_rep
  ON public.bitacora_visitas (reparacion_folio)
  WHERE reparacion_folio IS NOT NULL;

-- Comentarios
COMMENT ON TABLE public.bitacora_visitas IS
  'Registro automático de visitas al mostrador mediante detección IVS de cámara Hikvision';

COMMENT ON COLUMN public.bitacora_visitas.motivo_visita IS
  'Motivo de la visita: reparacion, cotizacion, compra, recoger, personal, otro';

COMMENT ON COLUMN public.bitacora_visitas.estado_atencion IS
  'pendiente = sin encuesta; atendido = con encuesta; no_atendido = se fue sin ser atendido; se_fue = detectó salida';

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_bitacora_visitas_updated_at
  BEFORE UPDATE ON public.bitacora_visitas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_timestamp();

-- RLS (se aplicará desde el código de aplicación; aquí habilitamos la tabla)
ALTER TABLE public.bitacora_visitas ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven registros de su taller
CREATE POLICY bitacora_visitas_tenant_isolation
  ON public.bitacora_visitas
  FOR ALL
  USING (taller_id = current_setting('app.current_taller_id', true));
