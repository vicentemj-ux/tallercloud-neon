-- Fase 1: Infraestructura del módulo IMPRENTA
-- Agrega configuración de impresión JSONB y redes sociales al perfil del taller

-- 1) Configuración de impresión por tipo de documento
ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS impresion_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.configuracion_taller.impresion_config IS
  'Configuración de impresión por tipo de documento: reparacion, venta, compra, etiqueta, barras. Cada key contiene {formato, mostrarLogo, mostrarTecnico, mostrarPrecios, mostrarRedesSociales, terminos, despedida, declaracionJurat}';

-- 2) Redes sociales del taller (para mostrar en tickets)
ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS facebook  TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS tiktok    TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp  TEXT;

COMMENT ON COLUMN public.configuracion_taller.facebook  IS 'URL o nombre de usuario de Facebook del taller';
COMMENT ON COLUMN public.configuracion_taller.instagram IS 'URL o @usuario de Instagram del taller';
COMMENT ON COLUMN public.configuracion_taller.tiktok    IS 'URL o @usuario de TikTok del taller';
COMMENT ON COLUMN public.configuracion_taller.whatsapp  IS 'Número de WhatsApp del taller (sin +52)';

-- 3) Índice GIN para búsquedas rápidas dentro de impresion_config
CREATE INDEX IF NOT EXISTS idx_configuracion_taller_impresion_config
  ON public.configuracion_taller USING GIN (impresion_config);
