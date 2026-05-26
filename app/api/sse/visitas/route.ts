import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const LOG = "[api/sse/visitas]"

/**
 * Server-Sent Events para notificar visitas pendientes en tiempo real.
 *
 * Uso del frontend:
 *   const es = new EventSource('/api/sse/visitas?tallerId=XXX')
 *   es.addEventListener('visita', (e) => { const data = JSON.parse(e.data) })
 *
 * El endpoint hace polling a Supabase cada 3 segundos y envía eventos
 * cuando hay nuevas visitas pendientes.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tallerId = searchParams.get("tallerId")?.trim()

  if (!tallerId) {
    return NextResponse.json({ error: "Missing tallerId" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      // Enviar headers SSE
      controller.enqueue(encoder.encode(`event: connected\ndata: "${tallerId}"\n\n`))

      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval)
          return
        }

        try {
          const supabase = await createAdminClient()
          const { data, error } = await supabase
            .from("bitacora_visitas")
            .select("id, fecha_hora_entrada, foto_entrada_url, estado_atencion")
            .eq("taller_id", tallerId)
            .eq("estado_atencion", "pendiente")
            .order("fecha_hora_entrada", { ascending: false })
            .limit(10)

          if (error) {
            console.warn(LOG, "poll error", { tallerId, error: error.message })
            return
          }

          if (data && data.length > 0) {
            const payload = JSON.stringify({
              count: data.length,
              visitas: data,
              timestamp: Date.now(),
            })
            controller.enqueue(encoder.encode(`event: visita\ndata: ${payload}\n\n`))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(LOG, "poll exception", { tallerId, error: msg })
        }
      }, 3000)

      // Cleanup cuando el cliente cierra la conexión
      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(pollInterval)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
