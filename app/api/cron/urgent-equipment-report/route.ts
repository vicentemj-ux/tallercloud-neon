import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-static"

type UrgentRow = { folio: string; cliente_nombre: string; modelo: string }

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildUrgentEquipmentEmailHtml(params: {
  ownerName: string
  nombreTaller: string
  rows: UrgentRow[]
}) {
  const tableRows = params.rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(r.folio)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(r.cliente_nombre)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(r.modelo || "—")}</td>
      </tr>
    `
    )
    .join("")

  return `
      <div style="background:#f8fafc;padding:24px;font-family:Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#2563eb;color:#ffffff;padding:18px 24px;font-weight:700;">TallerCloud — Equipos urgentes (3+ días)</div>
          <div style="padding:20px 24px;color:#334155;">
            <p>Hola ${escapeHtml(params.ownerName)},</p>
            <p>Este es el resumen diario de equipos en <strong>${escapeHtml(params.nombreTaller)}</strong> sin actualizaciones en la última semana (excluye entregados y cancelados).</p>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:12px;">
              <thead style="background:#eff6ff;">
                <tr>
                  <th style="text-align:left;padding:10px;font-size:12px;color:#1e3a8a;">Folio</th>
                  <th style="text-align:left;padding:10px;font-size:12px;color:#1e3a8a;">Cliente</th>
                  <th style="text-align:left;padding:10px;font-size:12px;color:#1e3a8a;">Modelo</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <p style="margin-top:16px;font-size:12px;color:#64748b;">Puedes desactivar este reporte en Configuración → Reportes y Alertas.</p>
          </div>
        </div>
      </div>
    `
}

/**
 * Diario: talleres con alerta_urgentes activo reciben la lista de reparaciones urgentes (misma lógica que el dashboard).
 */
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = request.headers.get("authorization")
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
      }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "RESEND_API_KEY not configured" }, { status: 500 })
    }

    const resend = new Resend(apiKey)
    const supabase = await createAdminClient()

    const { data: configs, error: cfgErr } = await supabase
      .from("configuracion_taller")
      .select("taller_id, nombre_taller")
      .eq("alerta_urgentes", true)

    if (cfgErr) {
      console.error("[urgent-equipment-report] config query:", cfgErr)
      return NextResponse.json({ success: false, error: cfgErr.message }, { status: 500 })
    }

    let emailsSent = 0
    let workshopsProcessed = 0
    const skipped: string[] = []
    const failures: Array<{ tallerId: string; error: string }> = []

    for (const row of configs || []) {
      const tallerId = row.taller_id as string
      const nombreTaller = (row.nombre_taller as string) || "Tu taller"

      const { data: owner, error: ownerErr } = await supabase
        .from("taller_users")
        .select("email, nombre_propietario")
        .eq("id", tallerId)
        .maybeSingle()

      if (ownerErr || !owner?.email) {
        skipped.push(tallerId)
        continue
      }

      const { data: urgentRows, error: rpcErr } = await supabase.rpc("list_urgent_reparaciones_for_email", {
        p_taller_id: tallerId,
      })

      if (rpcErr) {
        failures.push({ tallerId, error: rpcErr.message })
        continue
      }

      const list = (urgentRows || []) as UrgentRow[]
      if (list.length === 0) {
        workshopsProcessed += 1
        continue
      }

      workshopsProcessed += 1
      const ownerName = (owner.nombre_propietario as string) || "Equipo"

      try {
        await resend.emails.send({
          from: "TallerCloud <noreply@tallercloud.net>",
          to: owner.email as string,
          subject: `Equipos urgentes (${list.length}) — ${nombreTaller}`,
          html: buildUrgentEquipmentEmailHtml({
            ownerName,
            nombreTaller,
            rows: list,
          }),
        })
        emailsSent += 1
      } catch (e) {
        const message = e instanceof Error ? e.message : "send failed"
        failures.push({ tallerId, error: message })
      }
    }

    return NextResponse.json({
      success: true,
      workshopsWithFlag: (configs || []).length,
      workshopsProcessed,
      emailsSent,
      skippedNoEmail: skipped.length,
      failuresCount: failures.length,
      failures,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    console.error("[urgent-equipment-report] Fatal:", err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
