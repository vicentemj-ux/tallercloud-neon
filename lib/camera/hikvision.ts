/**
 * lib/camera/hikvision.ts
 *
 * Helpers para interactuar con cámaras Hikvision vía ISAPI y RTSP.
 * Puros — sin side effects. Usables desde cliente y servidor.
 */

export interface HikvisionConfig {
  enabled: boolean
  ip: string
  port: number
  username: string
  password: string
  snapshot_channel: string
  detection_type: "line_crossing" | "intrusion" | "region_entrance"
  webhook_secret?: string
}

export interface WebcamConfig {
  enabled: boolean
  device_id?: string
  label?: string
  usar_para_visitas: boolean
}

export interface CamaraConfig {
  hikvision?: HikvisionConfig
  webcam?: WebcamConfig
}

/**
 * Construye la URL RTSP principal de una cámara Hikvision.
 * Canal 101 = stream principal (HD), 102 = substream (SD para preview).
 */
export function buildRtspUrl(
  config: HikvisionConfig,
  channel: 101 | 102 = 101
): string {
  const port = config.port || 554
  return `rtsp://${config.username}:${config.password}@${config.ip}:${port}/Streaming/Channels/${channel}`
}

/**
 * Construye la URL de snapshot ISAPI.
 */
export function buildSnapshotUrl(
  config: HikvisionConfig,
  channel?: string
): string {
  const ch = channel || config.snapshot_channel || "101"
  const port = config.port || 80
  return `http://${config.ip}:${port}/ISAPI/Streaming/channels/${ch}/picture`
}

/**
 * Valida que la configuración tenga los campos mínimos para operar.
 */
export function validateHikvisionConfig(
  config: Partial<HikvisionConfig>
): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  if (!config.ip?.trim()) missing.push("ip")
  if (!config.username?.trim()) missing.push("username")
  if (!config.password) missing.push("password")
  return { valid: missing.length === 0, missing }
}

/**
 * Extrae la configuración de cámara desde el row de configuracion_taller.
 */
export function extractCamaraConfig(
  row: Record<string, unknown> | null
): CamaraConfig {
  if (!row) return {}
  const raw = row.camara_config as Record<string, unknown> | null
  if (!raw) return {}
  return raw as CamaraConfig
}
