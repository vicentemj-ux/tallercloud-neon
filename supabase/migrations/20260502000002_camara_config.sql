-- Migration: 20260502000002_camara_config.sql
--
-- Agrega configuración de cámaras (webcam + Hikvision IP) a configuracion_taller.

ALTER TABLE public.configuracion_taller
  ADD COLUMN IF NOT EXISTS camara_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.configuracion_taller.camara_config IS
  'Configuración de cámaras: {hikvision: {enabled, ip, port, username, password_encrypted, detection_type, snapshot_channel, webhook_secret}, webcam: {enabled, device_id, label, usar_para_visitas}}';

-- Índice GIN para búsquedas rápidas dentro de camara_config
CREATE INDEX IF NOT EXISTS idx_configuracion_taller_camara_config
  ON public.configuracion_taller USING GIN (camara_config);

-- Bucket de Storage para fotos de visitas (se crea vía dashboard o SQL; aquí documentamos)
-- El bucket 'visitas' debe crearse manualmente en Supabase Dashboard con:
--   public = false
--   allowed mime types: image/jpeg, image/png
--   file size limit: 2MB
--   RLS: authenticated users pueden subir/eliminar, public puede leer
