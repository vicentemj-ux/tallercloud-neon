import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOG = "[api/visitas/detect]"

/**
 * Endpoint para recibir eventos de deteccion desde la app Desktop (Tauri).
 *
 * Cuando la camara Hikvision NO tiene panel web, la app desktop hace polling
 * local a la camara via ISAPI y envia los eventos aqui.
 *
 * Body:
 *   {
 *     tallerId: string,
 *     cameraIp: string,
 *     eventType: string,
 *     dateTime: string (ISO),
 *     snapshotBase64?: string  // imagen capturada en base64
 *   }
 */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tallerId?: string
      cameraIp?: string
      eventType?: string
      dateTime?: string
      snapshotBase64?: string
    }

    const { tallerId, cameraIp, eventType, dateTime, snapshotBase64 } = body

    if (!tallerId || !eventType || !dateTime) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: tallerId, eventType, dateTime" },
        { status: 400 }
      )
    }

    let fotoUrl: string | null = null

    // Si viene snapshot en base64, subirlo a Storage
    if (snapshotBase64) {
      try {
        const supabase = await createAdminClient()
        const buffer = Buffer.from(snapshotBase64, "base64")
        const filename = `visita-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        const path = `${tallerId}/${filename}`

        const { error: uploadError } = await supabase.storage
          .from("visitas")
          .upload(path, buffer, {
            contentType: "image/jpeg",
            upsert: false,
          })

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage.from("visitas").getPublicUrl(path)
          fotoUrl = publicUrlData?.publicUrl || null
        }
      } catch (e) {
        console.warn(LOG, "snapshot upload failed", e)
      }
    }

    // Crear registro en bitacora_visitas
    const supabase = await createAdminClient()
    const { error: insertError } = await supabase.from("bitacora_visitas").insert({
      taller_id: tallerId,
      fecha_hora_entrada: dateTime,
      foto_entrada_url: fotoUrl,
      camara_ip: cameraIp || null,
      evento_tipo: eventType,
      estado_atencion: "pendiente",
    })

    if (insertError) {
      console.error(LOG, "insert failed", { tallerId, error: insertError.message })
      return NextResponse.json(
        { success: false, error: "Database insert failed" },
        { status: 500 }
      )
    }

    console.info(LOG, "Visit recorded via desktop polling", {
      tallerId,
      ip: cameraIp,
      type: eventType,
      hasPhoto: !!fotoUrl,
    })

    return NextResponse.json({ success: true, photoCaptured: !!fotoUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(LOG, "Fatal error", { error: msg })
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
