import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOG = "[api/alarms/hikvision]"

/**
 * Webhook receptor para eventos de camara Hikvision (IVS / Line Crossing / Intrusion).
 *
 * URL: /api/alarms/hikvision/{tallerId}
 *
 * La camara envia un POST con XML cuando detecta una persona.
 * Inmediatamente capturamos snapshot via ISAPI y creamos registro en bitacora_visitas.
 *
 * NOTA: Usamos path-based tallerId en vez de buscar por IP porque la camara
 * envia su IP local (192.168.x.x) que no es unica entre negocios distintos.
 */

interface HikvisionEvent {
  ipAddress: string
  portNo: number
  macAddress: string
  dateTime: string
  eventType: string
  eventState: string
  channelID: string
}

function parseHikvisionXml(xmlText: string): HikvisionEvent | null {
  try {
    const ipMatch = xmlText.match(/<ipAddress>([^<]+)<\/ipAddress>/i)
    const portMatch = xmlText.match(/<portNo>(\d+)<\/portNo>/i)
    const macMatch = xmlText.match(/<macAddress>([^<]+)<\/macAddress>/i)
    const dateMatch = xmlText.match(/<dateTime>([^<]+)<\/dateTime>/i)
    const typeMatch = xmlText.match(/<eventType>([^<]+)<\/eventType>/i)
    const stateMatch = xmlText.match(/<eventState>([^<]+)<\/eventState>/i)
    const channelMatch = xmlText.match(/<channelID>([^<]+)<\/channelID>/i)

    if (!ipMatch || !dateMatch || !typeMatch) return null

    return {
      ipAddress: ipMatch[1].trim(),
      portNo: portMatch ? parseInt(portMatch[1], 10) : 80,
      macAddress: macMatch ? macMatch[1].trim() : "",
      dateTime: dateMatch[1].trim(),
      eventType: typeMatch[1].trim(),
      eventState: stateMatch ? stateMatch[1].trim() : "active",
      channelID: channelMatch ? channelMatch[1].trim() : "1",
    }
  } catch {
    return null
  }
}

async function getCameraConfig(tallerId: string): Promise<{
  config: Record<string, unknown> | null
}> {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from("configuracion_taller")
    .select("camara_config")
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (error || !data?.camara_config) return { config: null }

  const camConfig = data.camara_config as Record<string, unknown>
  const hikvision = camConfig.hikvision as Record<string, unknown> | undefined

  if (!hikvision || !hikvision.enabled) return { config: null }

  return { config: hikvision }
}

async function captureSnapshot(
  cameraIp: string,
  port: number,
  username: string,
  password: string,
  channel: string
): Promise<Buffer | null> {
  try {
    const url = `http://${cameraIp}:${port}/ISAPI/Streaming/channels/${channel}/picture`
    const auth = Buffer.from(`${username}:${password}`).toString("base64")

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.warn(LOG, "snapshot failed", { status: response.status, url })
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(LOG, "snapshot error", { cameraIp, error: msg })
    return null
  }
}

async function uploadToStorage(
  buffer: Buffer,
  tallerId: string,
  filename: string
): Promise<string | null> {
  const supabase = await createAdminClient()
  const path = `${tallerId}/${filename}`

  const { error } = await supabase.storage
    .from("visitas")
    .upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    })

  if (error) {
    console.warn(LOG, "storage upload failed", { path, error: error.message })
    return null
  }

  const { data: publicUrlData } = supabase.storage.from("visitas").getPublicUrl(path)
  return publicUrlData?.publicUrl || null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tallerId: string }> }
) {
  const { tallerId } = await params

  if (!tallerId) {
    return NextResponse.json({ success: false, error: "Missing tallerId" }, { status: 400 })
  }

  try {
    const xmlText = await request.text()
    if (!xmlText || xmlText.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Empty body" }, { status: 400 })
    }

    const event = parseHikvisionXml(xmlText)
    if (!event) {
      console.warn(LOG, "Could not parse XML", { tallerId, preview: xmlText.slice(0, 200) })
      return NextResponse.json({ success: false, error: "Invalid XML" }, { status: 400 })
    }

    // Solo procesar eventos activos
    if (event.eventState !== "active") {
      return NextResponse.json({ success: true, ignored: true, reason: "event_state_inactive" })
    }

    // Obtener configuracion de camara para este taller
    const { config: hikvision } = await getCameraConfig(tallerId)
    if (!hikvision) {
      console.warn(LOG, "Camera not configured for taller", { tallerId })
      return NextResponse.json(
        { success: false, error: "Camera not configured" },
        { status: 404 }
      )
    }

    const username = String(hikvision.username || "admin")
    const password = String(hikvision.password || "")
    const channel = String(hikvision.snapshot_channel || "101")
    const cameraIp = String(hikvision.ip || event.ipAddress)
    const port = Number(hikvision.port) || 80

    if (!password) {
      console.warn(LOG, "Camera password not configured", { tallerId })
      return NextResponse.json(
        { success: false, error: "Camera password missing" },
        { status: 500 }
      )
    }

    // Capturar snapshot
    const snapshotBuffer = await captureSnapshot(cameraIp, port, username, password, channel)

    let fotoUrl: string | null = null
    if (snapshotBuffer) {
      const filename = `visita-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      fotoUrl = await uploadToStorage(snapshotBuffer, tallerId, filename)
    }

    // Crear registro en bitacora_visitas
    const supabase = await createAdminClient()
    const { error: insertError } = await supabase.from("bitacora_visitas").insert({
      taller_id: tallerId,
      fecha_hora_entrada: event.dateTime,
      foto_entrada_url: fotoUrl,
      camara_ip: event.ipAddress,
      evento_tipo: event.eventType,
      estado_atencion: "pendiente",
    })

    if (insertError) {
      console.error(LOG, "Failed to insert bitacora_visitas", { tallerId, error: insertError.message })
      return NextResponse.json(
        { success: false, error: "Database insert failed" },
        { status: 500 }
      )
    }

    console.info(LOG, "Visit recorded", {
      tallerId,
      ip: event.ipAddress,
      type: event.eventType,
      hasPhoto: !!fotoUrl,
    })

    return NextResponse.json({ success: true, photoCaptured: !!fotoUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(LOG, "Fatal error", { tallerId, error: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
