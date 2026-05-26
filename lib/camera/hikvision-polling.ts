/**
 * lib/camera/hikvision-polling.ts
 *
 * Servicio de polling para cámaras Hikvision sin panel web.
 * Se ejecuta desde la app desktop (misma red local) para detectar eventos IVS.
 */

export interface HikvisionEventDetected {
  dateTime: string
  eventType: string
  channelID: string
  activePostCount: number
}

export interface HikvisionEventSearchResult {
  responseStatusStrg: string
  numOfMatches: number
  matchList?: Array<{
    searchResultPosition: number
    ehomeParams?: unknown
    sourceID?: string
    event?: {
      eventType: string
      eventDescription?: string
      dateTime: string
      channelID?: string
      activePostCount?: number
    }
  }>
}

/**
 * Consulta eventos recientes de la cámara vía ISAPI /ISAPI/Event/triggers
 */
export async function pollHikvisionEvents(config: {
  ip: string
  port: number
  username: string
  password: string
  channel?: string
}): Promise<HikvisionEventDetected[]> {
  const url = `http://${config.ip}:${config.port}/ISAPI/Event/notification/alertStream`
  const auth = btoa(`${config.username}:${config.password}`)

  try {
    // Usamos el alertStream de ISAPI: devuelve eventos en formato multipart o XML
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(3000),
    })

    if (!res.ok) return []

    const text = await res.text()
    return parseEventsFromText(text)
  } catch {
    return []
  }
}

/**
 * Alternativa: consultar eventos almacenados en la cámara (search)
 */
export async function searchHikvisionEvents(config: {
  ip: string
  port: number
  username: string
  password: string
  startTime: string // ISO
  endTime: string   // ISO
}): Promise<HikvisionEventDetected[]> {
  const url = `http://${config.ip}:${config.port}/ISAPI/ContentMgmt/EventSearch`
  const auth = btoa(`${config.username}:${config.password}`)

  const body = `<?xml version="1.0" encoding="utf-8"?>
<CMSearchDescription>
  <searchID>${crypto.randomUUID()}</searchID>
  <trackList>
    <trackID>101</trackID>
  </trackList>
  <timeSpanList>
    <timeSpan>
      <startTime>${config.startTime}</startTime>
      <endTime>${config.endTime}</endTime>
    </timeSpan>
  </timeSpanList>
  <maxResults>50</maxResults>
  <searchResultPostion>0</searchResultPostion>
  <metadataList>
    <metadataDescriptor>VCA//</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/xml",
      },
      body,
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return []
    const text = await res.text()
    return parseEventsFromText(text)
  } catch {
    return []
  }
}

function parseEventsFromText(xmlText: string): HikvisionEventDetected[] {
  const events: HikvisionEventDetected[] = []
  // Buscar múltiples eventos en el XML
  const eventRegex = /<EventNotificationAlert[\s\S]*?<\/EventNotificationAlert>/gi
  const matches = xmlText.match(eventRegex) || []

  for (const eventXml of matches) {
    const typeMatch = eventXml.match(/<eventType>([^<]+)<\/eventType>/i)
    const dateMatch = eventXml.match(/<dateTime>([^<]+)<\/dateTime>/i)
    const channelMatch = eventXml.match(/<channelID>([^<]+)<\/channelID>/i)

    if (typeMatch && dateMatch) {
      events.push({
        eventType: typeMatch[1].trim(),
        dateTime: dateMatch[1].trim(),
        channelID: channelMatch ? channelMatch[1].trim() : "1",
        activePostCount: 1,
      })
    }
  }

  return events
}

/**
 * Modo BÁSICO: Captura un snapshot periódicamente y lo devuelve como evento.
 * Como la cámara no tiene eventos IVS configurados (sin panel web),
 * usamos snapshots como mecanismo de "detección".
 *
 * Limitantes:
 *   - No es detección inteligente (cualquier snapshot = visita).
 *   - Requiere PC encendida con app desktop corriendo.
 *   - Consume ancho de banda de red por cada snapshot.
 */
export async function pollHikvisionSnapshot(config: {
  ip: string
  port: number
  username: string
  password: string
  channel?: string
}): Promise<
  | { type: "snapshot"; dateTime: string; snapshotBase64: string }
  | { type: "error"; message: string }
> {
  const url = `http://${config.ip}:${config.port}/ISAPI/Streaming/channels/${config.channel || "101"}/picture`
  const auth = btoa(`${config.username}:${config.password}`)

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return { type: "error", message: `HTTP ${res.status}` }
    }

    const blob = await res.blob()
    if (blob.size === 0) {
      return { type: "error", message: "Imagen vacía" }
    }

    const arrayBuffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)

    return {
      type: "snapshot",
      dateTime: new Date().toISOString(),
      snapshotBase64: base64,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { type: "error", message: msg }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Verifica si la cámara responde a ISAPI (snapshot).
 * Usado para test de conexión sin panel web.
 */
export async function testHikvisionConnection(config: {
  ip: string
  port: number
  username: string
  password: string
  channel?: string
}): Promise<{ ok: boolean; error?: string; imageSize?: number }> {
  const url = `http://${config.ip}:${config.port}/ISAPI/Streaming/channels/${config.channel || "101"}/picture`
  const auth = btoa(`${config.username}:${config.password}`)

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: La cámara no respondió al snapshot.` }
    }

    const blob = await res.blob()
    if (blob.size === 0) {
      return { ok: false, error: "La cámara respondió pero la imagen está vacía." }
    }

    return { ok: true, imageSize: blob.size }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}
