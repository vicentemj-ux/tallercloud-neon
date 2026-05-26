"use server"

import { randomInt } from "crypto"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendAdminOTPEmail } from "@/lib/email/send"

const OTP_TTL_MINUTES = 10
const OTP_MAX_PER_WINDOW = 3
const OTP_WINDOW_MINUTES = 10
const OTP_MAX_ATTEMPTS = 5
const ADMIN_VERIFIED_COOKIE = "tallercloud_admin_verified"
const ADMIN_VERIFIED_TTL_SECONDS = 8 * 60 * 60 // 8 hours

class AdminAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminAuthError"
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${"*".repeat(Math.max(0, local.length - 2))}@${domain}`
}

/** Verifies that the caller is a logged-in admin. Returns tallerId or throws AdminAuthError. */
async function requireAdmin(): Promise<string> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value
  const isAdmin = cookieStore.get("isAdmin")?.value === "true"

  if (!tallerId || !isAdmin) {
    throw new AdminAuthError("ADMIN_UNAUTHORIZED")
  }

  // Double-check against DB
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from("taller_users")
    .select("es_admin")
    .eq("id", tallerId)
    .single()

  if (error || !data?.es_admin) {
    throw new AdminAuthError("ADMIN_UNAUTHORIZED")
  }

  return tallerId
}

/**
 * Generates an 8-digit OTP, stores it in admin_otp_codes, and emails it to the
 * admin's registered address. Rate-limited to 3 codes per 10-minute window.
 */
export async function sendAdminOTP(): Promise<{
  success: boolean
  maskedEmail?: string
  error?: string
}> {
  try {
    const tallerId = await requireAdmin()
    const supabase = await createAdminClient()

    const { data: adminUser, error: userError } = await supabase
      .from("taller_users")
      .select("email")
      .eq("id", tallerId)
      .single()

    if (userError || !adminUser?.email) {
      console.error("[admin-otp] No se pudo obtener email del admin:", userError)
      return { success: false, error: "No se pudo obtener el correo del administrador. Verifica tu perfil." }
    }

    const windowStart = new Date(Date.now() - OTP_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count, error: countError } = await supabase
      .from("admin_otp_codes")
      .select("*", { count: "exact", head: true })
      .eq("admin_id", tallerId)
      .gte("created_at", windowStart)

    if (countError) {
      console.error("[admin-otp] Rate-limit query failed:", countError)
      return { success: false, error: "Error de base de datos al verificar límites. Contacta soporte." }
    }

    if ((count ?? 0) >= OTP_MAX_PER_WINDOW) {
      return {
        success: false,
        error: `Demasiados intentos. Espera ${OTP_WINDOW_MINUTES} minutos antes de solicitar otro código.`,
      }
    }

    await supabase.from("admin_otp_codes").delete().eq("admin_id", tallerId)

    const code = String(randomInt(0, 100_000_000)).padStart(8, "0")
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString()

    const { error: insertError } = await supabase.from("admin_otp_codes").insert({
      admin_id: tallerId,
      code,
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error("[admin-otp] Insert OTP failed:", insertError)
      return { success: false, error: "Error al guardar el código. Contacta soporte." }
    }

    const emailResult = await sendAdminOTPEmail(adminUser.email, code)
    if (!emailResult.success) {
      console.error("[admin-otp] Email send failed:", emailResult.error)
      await supabase.from("admin_otp_codes").delete().eq("admin_id", tallerId)
      return { success: false, error: `Error al enviar el correo: ${emailResult.error}. Verifica la configuración de RESEND_API_KEY.` }
    }

    return { success: true, maskedEmail: maskEmail(adminUser.email) }
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return { success: false, error: "SESSION_EXPIRED" }
    }
    console.error("[admin-otp] Unhandled error in sendAdminOTP:", err)
    return { success: false, error: "Error inesperado del servidor. Contacta soporte técnico." }
  }
}

/**
 * Validates the submitted OTP. On success, sets the tallercloud_admin_verified
 * cookie (httpOnly, sameSite:strict, path:/admin, 8-hour TTL).
 */
export async function verifyAdminOTP(code: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const tallerId = await requireAdmin()

    if (!code || !/^\d{8}$/.test(code.trim())) {
      return { success: false, error: "El código debe tener exactamente 8 dígitos." }
    }

    const supabase = await createAdminClient()

    const { data: otpRow, error } = await supabase
      .from("admin_otp_codes")
      .select("id, code, expires_at, attempts")
      .eq("admin_id", tallerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (error || !otpRow) {
      return {
        success: false,
        error: "No hay un código activo. Solicita uno nuevo.",
      }
    }

    if (new Date(otpRow.expires_at) < new Date()) {
      await supabase.from("admin_otp_codes").delete().eq("id", otpRow.id)
      return {
        success: false,
        error: "El código ha expirado. Solicita uno nuevo.",
      }
    }

    if ((otpRow.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      await supabase.from("admin_otp_codes").delete().eq("id", otpRow.id)
      return {
        success: false,
        error: "Demasiados intentos fallidos. Solicita un nuevo código.",
      }
    }

    if (otpRow.code !== code.trim()) {
      // Increment attempt counter
      await supabase
        .from("admin_otp_codes")
        .update({ attempts: (otpRow.attempts ?? 0) + 1 })
        .eq("id", otpRow.id)
      return { success: false, error: "Código incorrecto. Verifica e intenta de nuevo." }
    }

    // Consume the code
    await supabase.from("admin_otp_codes").delete().eq("admin_id", tallerId)

    // Issue verified session cookie
    const cookieStore = await cookies()
    cookieStore.set(ADMIN_VERIFIED_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/admin",
      maxAge: ADMIN_VERIFIED_TTL_SECONDS,
    })

    return { success: true }
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return { success: false, error: "SESSION_EXPIRED" }
    }
    console.error("[admin-otp] Unhandled error in verifyAdminOTP:", err)
    return { success: false, error: "Error inesperado. Intenta de nuevo." }
  }
}
