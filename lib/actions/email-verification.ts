"use server"

import { randomInt } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { sendMemberVerificationPinEmail } from "@/lib/email/send"

type IssuePinInput = {
  userId: string
  tallerId: string
  email: string
  nombre: string
}

function makePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export async function issueMemberVerificationPin(input: IssuePinInput): Promise<{
  success: boolean
  error?: string
}> {
  const userId = input.userId.trim()
  const tallerId = input.tallerId.trim()
  const email = input.email.trim().toLowerCase()
  const nombre = input.nombre.trim() || "Usuario"

  if (!userId || !tallerId || !email) {
    return { success: false, error: "Datos incompletos para enviar verificación." }
  }

  const admin = await createAdminClient()
  const pin = makePin()
  const expiraAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error: delOldErr } = await admin
    .from("verificaciones_email")
    .delete()
    .eq("user_id", userId)
    .eq("taller_id", tallerId)

  if (delOldErr) {
    console.error("issueMemberVerificationPin delete old:", delOldErr)
  }

  const { error: pinErr } = await admin.from("verificaciones_email").insert({
    user_id: userId,
    taller_id: tallerId,
    pin,
    expira_at: expiraAt,
  })

  if (pinErr) {
    console.error("issueMemberVerificationPin insert:", pinErr)
    return { success: false, error: "No se pudo generar el código de verificación." }
  }

  const emailRes = await sendMemberVerificationPinEmail(email, nombre, pin)
  if (!emailRes.success) {
    return { success: false, error: emailRes.error || "No se pudo enviar el correo de verificación." }
  }

  return { success: true }
}

export async function getCurrentUserVerificationStatus(): Promise<{
  requiresVerification: boolean
  email: string
  nombre: string
  error?: string
}> {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const tallerId = await getCurrentTallerId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return { requiresVerification: false, email: "", nombre: "" }
  }

  const { data: member, error } = await admin
    .from("miembros_taller")
    .select("email_verificado, email, nombre")
    .eq("taller_id", tallerId)
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error("getCurrentUserVerificationStatus:", error)
    return { requiresVerification: false, email: "", nombre: "", error: "No se pudo validar el estado de verificación." }
  }

  if (!member) {
    return { requiresVerification: false, email: "", nombre: "" }
  }

  const m = member as {
    email_verificado?: boolean
    email?: string | null
    nombre?: string | null
  }
  return {
    requiresVerification: !Boolean(m.email_verificado),
    email: m.email?.trim() || user.email || "",
    nombre: m.nombre?.trim() || "Usuario",
  }
}

export async function resendCurrentUserVerificationPin(): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  const admin = await createAdminClient()
  const tallerId = await getCurrentTallerId()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) return { success: false, error: "Sesión no válida para reenviar código." }

  const { data: member, error } = await admin
    .from("miembros_taller")
    .select("email, nombre")
    .eq("taller_id", tallerId)
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (error || !member) {
    return { success: false, error: "No se encontró el miembro para reenviar el código." }
  }

  const m = member as { email?: string | null; nombre?: string | null }
  return issueMemberVerificationPin({
    userId: user.id,
    tallerId,
    email: m.email?.trim() || user.email || "",
    nombre: m.nombre?.trim() || "Usuario",
  })
}

export async function verifyCurrentUserPin(pin: string): Promise<{
  success: boolean
  error?: string
}> {
  const normalizedPin = (pin || "").trim()
  if (!/^[0-9]{6}$/.test(normalizedPin)) {
    return { success: false, error: "Código incorrecto o expirado." }
  }

  const supabase = await createClient()
  const admin = await createAdminClient()
  const tallerId = await getCurrentTallerId()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { success: false, error: "Sesión no válida para verificar código." }

  const { data, error } = await admin.rpc("verificar_pin", {
    p_user_id: user.id,
    p_taller_id: tallerId,
    p_pin: normalizedPin,
  })

  if (error) {
    console.error("verifyCurrentUserPin rpc:", error)
    return { success: false, error: "Código incorrecto o expirado." }
  }

  const row = Array.isArray(data) ? data[0] : null
  if (!row?.ok) {
    return { success: false, error: "Código incorrecto o expirado." }
  }

  return { success: true }
}
