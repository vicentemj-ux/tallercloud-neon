import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { TrialExpiringEmail } from "@/components/emails/TrialExpiringEmail"
import { buildWhatsAppOpenChatUrl, TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS } from "@/lib/whatsapp-send-url"

export const runtime = "nodejs"
export const dynamic = "force-static"

type TrialUser = {
  id: string
  email: string
  nombre_propietario: string | null
  nombre_taller: string | null
  created_at: string
}

export async function GET(request: Request) {
  try {
    // Optional protection for manual/third-party calls
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const auth = request.headers.get("authorization")
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
      }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)
    const supabase = await createAdminClient()

    // Usuarios creados hace exactamente 27 días (UTC)
    const now = new Date()
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 27))
    const start = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 0, 0, 0))
    const end = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 23, 59, 59, 999))

    const { data, error } = await supabase
      .from("taller_users")
      .select("id, email, nombre_propietario, nombre_taller, created_at")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())

    if (error) {
      console.error("[check-trials] Supabase query error:", error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const users = ((data || []) as TrialUser[]).filter((u) => Boolean(u.email))
    let emailsSent = 0
    const failures: Array<{ email: string; error: string }> = []

    for (const user of users) {
      try {
        await resend.emails.send({
          from: "TallerCloud <hola@tallercloud.net>",
          to: user.email,
          subject: "Tu prueba de TallerCloud vence en 3 días",
          react: TrialExpiringEmail({
            ownerName: user.nombre_propietario || "Equipo",
            workshopName: user.nombre_taller || "Tu Taller",
            actionUrl: buildWhatsAppOpenChatUrl(TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS),
          }),
        })
        emailsSent += 1
      } catch (sendErr) {
        const message = sendErr instanceof Error ? sendErr.message : "Unknown error"
        failures.push({ email: user.email, error: message })
      }
    }

    return NextResponse.json({
      success: true,
      totalCandidates: users.length,
      emailsSent,
      failuresCount: failures.length,
      failures,
      targetDateUTC: start.toISOString().slice(0, 10),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    console.error("[check-trials] Fatal error:", err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

