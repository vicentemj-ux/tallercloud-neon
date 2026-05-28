"use server"
// LEGACY SUPABASE ACTIONS.
// No importar desde rutas MVP (usar auth-prisma.ts).
// Pendiente migracion completa de modulos legacy/PRO.

import { createClient } from "@/lib/supabase/server"
import bcrypt from "bcryptjs"
import { cookies, headers } from "next/headers"
import { randomBytes } from "crypto"
import { Resend } from "resend"
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email/send"
import { checkRateLimit } from "@/lib/auth/rate-limit"
import { esUsuarioPro } from "@/lib/auth-server"
import { z } from "zod"
import { WelcomeEmail } from "@/components/emails/WelcomeEmail"

// ── Schemas de validacion ────────────────────────────────────────────────────

const emailSchema = z.string().email("Email invalido").max(254)
const passwordSchema = z.string().min(8, "La contrasena debe tener al menos 8 caracteres").max(128)

const registerSchema = z.object({
  nombrePropietario: z.string().min(2, "Nombre muy corto").max(100).trim(),
  nombreTaller:      z.string().min(2, "Nombre del taller muy corto").max(100).trim(),
  email:             emailSchema,
  password:          passwordSchema,
})

const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, "Contrasena requerida").max(128),
})

const resetPasswordSchema = z.object({
  token:       z.string().length(64, "Token invalido"),
  newPassword: passwordSchema,
})

/** Obtiene la IP del request para rate limiting basado en IP */
async function getClientIp(): Promise<string> {
  const headerStore = await headers()
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0].trim() ||
    headerStore.get("x-real-ip") ||
    "unknown"
  )
}

// Generate secure tokens
function generateToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Firma un token con HMAC-SHA256 usando SUPABASE_JWT_SECRET.
 * Se usa para validar la integridad de los links de verificacion y reset.
 */
function signToken(token: string): string {
  const { createHmac } = require("crypto")
  const secret = process.env.SUPABASE_JWT_SECRET || ""
  if (!secret) {
    console.error("[signToken] SUPABASE_JWT_SECRET no esta configurado")
    return ""
  }
  return createHmac("sha256", secret).update(token).digest("hex")
}

export async function registerTaller(data: {
  nombrePropietario: string
  nombreTaller: string
  email: string
  password: string
}) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const ip = await getClientIp()
  const rl = await checkRateLimit(ip, "register")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  const supabase = await createClient()

  // Check if email already exists
  const { data: existing } = await supabase
    .from("taller_users")
    .select("id")
    .eq("email", data.email.toLowerCase().trim())
    .single()

  if (existing) {
    return { success: false, error: "El email ya esta registrado" }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12)

  // Generate verification token
  const verificationToken = generateToken()
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 30)

  // Create new taller user (NOT verified)
  const { data: newUser, error } = await supabase
    .from("taller_users")
    .insert({
      nombre_propietario: data.nombrePropietario.trim(),
      nombre_taller: data.nombreTaller.trim(),
      email: data.email.toLowerCase().trim(),
      password_hash: passwordHash,
      email_verified: false,
      verification_token: verificationToken,
      verification_expires_at: tokenExpiry,
      plan_tipo: "prueba",
      fecha_vencimiento_plan: trialEndsAt.toISOString(),
    })
    .select("id, nombre_taller, email")
    .single()

  if (error) {
    console.error("[v0] Error registering taller:", error)
    return { success: false, error: "Error al registrar el taller. Intenta nuevamente." }
  }

  // Send welcome email (trial starts automatically)
  try {
    await resend.emails.send({
      from: "TallerCloud <hola@tallercloud.net>",
      to: newUser.email,
      subject: "Bienvenido a TallerCloud - Tu prueba de 30 dias ya inicio",
      react: WelcomeEmail({
        ownerName: data.nombrePropietario.trim(),
        workshopName: data.nombreTaller.trim(),
        dashboardUrl: "https://tallercloud.net/dashboard",
      }),
    })
  } catch (welcomeErr) {
    console.error("[registerTaller] Error sending welcome email:", welcomeErr)
    // Best effort: no bloquear registro
  }

  // Send verification email with HMAC signature
  const emailResult = await sendVerificationEmail(
    newUser.email,
    data.nombrePropietario,
    data.nombreTaller,
    verificationToken,
    signToken(verificationToken)
  )

  if (!emailResult.success) {
    console.error("[v0] Error sending verification email:", emailResult.error)
    // Don't fail - user can request verification email again later
  }

  return { 
    success: true, 
    message: "Registro exitoso. Por favor verifica tu correo electronico para activar tu cuenta.",
    data: newUser 
  }
}

export async function loginTaller(email: string, password: string) {
  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) {
    return { success: false, error: "Email o contrasena incorrectos" }
  }

  const rl = await checkRateLimit(email, "login")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  const supabase = await createClient()

  // Find user by email
  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, email, password_hash, nombre_taller, email_verified, es_admin, session_version")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (error || !user) {
    console.error("[v0] Login error - user not found:", error)
    return { success: false, error: "Email o contrasena incorrectos" }
  }

  if (user.password_hash == null) {
    return {
      success: false,
      error: "Esta cuenta solo permite acceso con Google. Usa «Continuar con Google».",
    }
  }

  // Check if email is verified
  if (!user.email_verified) {
    return { success: false, error: "Por favor verifica tu email antes de iniciar sesion", needsVerification: true }
  }

  // Verify password with bcrypt.compare
  const passwordMatch = await bcrypt.compare(password, user.password_hash as string)

  if (!passwordMatch) {
    return { success: false, error: "Email o contrasena incorrectos" }
  }

  // Create session cookies
  const cookieStore = await cookies()
  cookieStore.set("tallerId", user.id, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  cookieStore.set("tallerName", encodeURIComponent(user.nombre_taller), {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  // Store admin status in cookie
  if (user.es_admin) {
    cookieStore.set("isAdmin", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  // Store session_version for session invalidation on password change
  cookieStore.set("session_version", String(user.session_version ?? 1), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return { success: true, data: { id: user.id, nombre_taller: user.nombre_taller, isAdmin: user.es_admin || false } }
}

export async function logoutTaller() {
  const cookieStore = await cookies()
  cookieStore.delete("tallerId")
  cookieStore.delete("tallerName")
  cookieStore.delete("isAdmin")
  cookieStore.delete("session_version")
  cookieStore.delete("tallercloud_admin_verified")
  return { success: true }
}

export async function loginAdmin(email: string, password: string) {
  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) {
    return { success: false, error: "Email o contrasena incorrectos" }
  }

  const rl = await checkRateLimit(email, "login_admin")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  try {
    const { getPrismaClient } = await import("@/lib/prisma")
    const prisma = getPrismaClient()

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), role: "ADMIN" },
    })

    if (!user) {
      return { success: false, error: "Email o contrasena incorrectos" }
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return { success: false, error: "Email o contrasena incorrectos" }
    }

    const cookieStore = await cookies()
    cookieStore.set("tallerId", user.id, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    cookieStore.set("tallerName", encodeURIComponent(user.nombre), {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    cookieStore.set("isAdmin", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return { success: true }
  } catch (error) {
    console.error("[loginAdmin] Prisma error:", error instanceof Error ? error.message : String(error))
    return { success: false, error: "Error interno. Contacta soporte." }
  }
}

export async function getCurrentTaller() {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value
  const tallerName = cookieStore.get("tallerName")?.value

  if (!tallerId) return null

  return {
    id: tallerId,
    nombre_taller: tallerName ? decodeURIComponent(tallerName) : "Mi Taller",
  }
}

export async function getEsUsuarioPro(): Promise<boolean> {
  return esUsuarioPro()
}

export async function getOwnerLoginEmail(): Promise<{ email: string; error: string | null }> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value

  if (!tallerId) {
    return { email: "", error: "No autenticado" }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("taller_users")
    .select("email")
    .eq("id", tallerId)
    .single()

  if (error || !data) {
    console.error("Error fetching owner email:", error)
    return { email: "", error: "No se pudo cargar el email de acceso" }
  }

  return { email: (data as { email: string }).email, error: null }
}

export async function getCurrentOwnerIdentity(): Promise<{
  nombre: string
  email: string
  error: string | null
}> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value

  if (!tallerId) {
    return { nombre: "Usuario activo", email: "", error: "No autenticado" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("taller_users")
    .select("nombre_propietario, email")
    .eq("id", tallerId)
    .single()

  if (error || !data) {
    return { nombre: "Usuario activo", email: "", error: "No se pudo cargar el usuario activo" }
  }

  const row = data as { nombre_propietario?: string | null; email?: string | null }
  return {
    nombre: row.nombre_propietario?.trim() || "Usuario activo",
    email: row.email?.trim() || "",
    error: null,
  }
}

export async function changeOwnerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value

  if (!tallerId) {
    return { success: false, error: "No autenticado" }
  }

  const supabase = await createClient()

  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, password_hash")
    .eq("id", tallerId)
    .single()

  if (error || !user) {
    console.error("Error fetching owner for password change:", error)
    return { success: false, error: "No se pudo cargar tu usuario" }
  }

  const match = await bcrypt.compare(currentPassword, (user as { password_hash: string }).password_hash)
  if (!match) {
    return { success: false, error: "La contrasena actual no es correcta" }
  }

  if (newPassword.length < 8) {
    return { success: false, error: "La nueva contrasena debe tener al menos 8 caracteres" }
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  // Incrementar session_version para invalidar sesiones en otros dispositivos
  const newSessionVersion = Math.floor(Date.now() / 1000)

  const { error: updateError } = await supabase
    .from("taller_users")
    .update({ password_hash: passwordHash, session_version: newSessionVersion })
    .eq("id", tallerId)

  if (updateError) {
    console.error("Error updating owner password:", updateError)
    return { success: false, error: "No se pudo actualizar la contrasena" }
  }

  // Actualizar cookie de session_version para el dispositivo actual
  cookieStore.set("session_version", String(newSessionVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return { success: true }
}

// Request email verification
export async function requestEmailVerification(email: string) {
  const rl = await checkRateLimit(email, "verify")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  const supabase = await createClient()

  // Find user by email
  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, email, nombre_propietario, nombre_taller, email_verified")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (error || !user || user.email_verified) {
    // Generic message - don't reveal whether the email exists or is already verified
    return { success: true, error: null }
  }

  // Generate verification token
  const verificationToken = generateToken()
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Save token to database
  const { error: updateError } = await supabase
    .from("taller_users")
    .update({ verification_token: verificationToken, verification_expires_at: tokenExpiry })
    .eq("id", user.id)

  if (updateError) {
    console.error("[v0] Error updating verification token:", updateError)
    return { success: false, error: "Error al generar token de verificacion" }
  }

  // Send verification email with HMAC signature
  const emailResult = await sendVerificationEmail(
    user.email,
    user.nombre_propietario,
    user.nombre_taller,
    verificationToken,
    signToken(verificationToken)
  )

  if (!emailResult.success) {
    return emailResult
  }

  return { success: true, message: "Correo de verificacion enviado" }
}

// Verify email with token
export async function verifyEmailToken(token: string, signature?: string) {
  // Validar firma HMAC antes de procesar el token
  const expectedSig = signToken(token)
  if (!expectedSig || signature !== expectedSig) {
    return { success: false, error: "Token invalido o manipulado" }
  }

  const supabase = await createClient()

  // Find user with matching token
  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, verification_expires_at")
    .eq("verification_token", token)
    .single()

  if (error || !user) {
    return { success: false, error: "Token invalido o expirado" }
  }

  // Check token expiry
  if (new Date(user.verification_expires_at) < new Date()) {
    return { success: false, error: "El token de verificacion ha expirado" }
  }

  // Mark email as verified
  const { error: updateError } = await supabase
    .from("taller_users")
    .update({
      email_verified: true,
      verification_token: null,
      verification_expires_at: null,
    })
    .eq("id", user.id)

  if (updateError) {
    console.error("[v0] Error verifying email:", updateError)
    return { success: false, error: "Error al verificar email" }
  }

  return { success: true, message: "Email verificado correctamente" }
}

// Request password reset
export async function requestPasswordReset(email: string) {
  const rl = await checkRateLimit(email, "reset")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  const supabase = await createClient()

  // Find user by email
  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, email, nombre_propietario, nombre_taller")
    .eq("email", email.toLowerCase().trim())
    .single()

  if (error || !user) {
    // Don't reveal if email exists for security
    return { success: true, message: "Si el email existe, recibiras un correo de recuperacion" }
  }

  // Generate reset token
  const resetToken = generateToken()
  const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  // Save token to database
  const { error: updateError } = await supabase
    .from("taller_users")
    .update({ reset_token: resetToken, reset_expires_at: tokenExpiry })
    .eq("id", user.id)

  if (updateError) {
    console.error("[v0] Error updating reset token:", updateError)
    return { success: true, message: "Si el email existe, recibiras un correo de recuperacion" }
  }

  // Send password reset email with HMAC signature
  const emailResult = await sendPasswordResetEmail(
    user.email,
    user.nombre_propietario,
    user.nombre_taller,
    resetToken,
    signToken(resetToken)
  )

  if (!emailResult.success) {
    console.error("[v0] Error sending reset email:", emailResult.error)
  }

  return { success: true, message: "Si el email existe, recibiras un correo de recuperacion" }
}

// Verify reset token and reset password
export async function resetPasswordWithToken(token: string, newPassword: string, signature?: string) {
  const parsed = resetPasswordSchema.safeParse({ token, newPassword })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  // Validar firma HMAC antes de procesar el token
  const expectedSig = signToken(token)
  if (!expectedSig || signature !== expectedSig) {
    return { success: false, error: "Token invalido o manipulado" }
  }

  const supabase = await createClient()

  // Find user with matching token
  const { data: user, error } = await supabase
    .from("taller_users")
    .select("id, reset_expires_at")
    .eq("reset_token", token)
    .single()

  if (error || !user) {
    return { success: false, error: "Token invalido o expirado" }
  }

  // Check token expiry
  if (new Date(user.reset_expires_at) < new Date()) {
    return { success: false, error: "El token de recuperacion ha expirado" }
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12)

  // Update password and clear reset token
  const { error: updateError } = await supabase
    .from("taller_users")
    .update({
      password_hash: passwordHash,
      reset_token: null,
      reset_expires_at: null,
    })
    .eq("id", user.id)

  if (updateError) {
    console.error("[v0] Error resetting password:", updateError)
    return { success: false, error: "Error al restablecer contrasena" }
  }

  return { success: true, message: "Contrasena restablecida correctamente" }
}
