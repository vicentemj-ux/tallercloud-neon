"use server"

import { Resend } from "resend"
import { MemberVerificationPinTemplate, VerifyEmailTemplate, ResetPasswordTemplate } from "./templates"

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is missing")
    return null
  }
  return new Resend(apiKey)
}

export async function sendVerificationEmail(
  email: string,
  userName: string,
  tallerName: string,
  verificationToken: string,
  signature?: string
) {
  const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${verificationToken}${signature ? `&sig=${signature}` : ""}`

  try {
    const resend = getResendClient()
    if (!resend) return { success: false, error: "Servicio de correo no configurado" }

    const { data, error } = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: email,
      subject: "Verifica tu correo en TallerCloud",
      react: VerifyEmailTemplate({
        userName,
        verificationLink,
        tallerName,
      }),
    })

    if (error) throw error
    return { success: true, messageId: data!.id }
  } catch (error) {
    console.error("[v0] Error sending verification email:", error)
    return { success: false, error: "Error al enviar correo de verificación" }
  }
}

export async function sendPasswordResetEmail(
  email: string,
  userName: string,
  tallerName: string,
  resetToken: string,
  signature?: string
) {
  const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}${signature ? `&sig=${signature}` : ""}`

  try {
    const resend = getResendClient()
    if (!resend) return { success: false, error: "Servicio de correo no configurado" }

    const { data, error } = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: email,
      subject: "Recupera tu contraseña en TallerCloud",
      react: ResetPasswordTemplate({
        userName,
        resetLink,
        tallerName,
      }),
    })

    if (error) throw error
    return { success: true, messageId: data!.id }
  } catch (error) {
    console.error("[v0] Error sending password reset email:", error)
    return { success: false, error: "Error al enviar correo de recuperación" }
  }
}

export async function sendWelcomeEmail(
  email: string,
  userName: string,
  tallerName: string
) {
  try {
    const resend = getResendClient()
    if (!resend) return { success: false, error: "Servicio de correo no configurado" }

    const { data, error } = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: email,
      subject: "Bienvenido a TallerCloud",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 40px; background: #f5f5f5; }
              .card { background: white; border-radius: 8px; padding: 40px; }
              .header { text-align: center; margin-bottom: 30px; }
              .header h1 { color: #2563eb; margin: 0; }
              .content { color: #666; line-height: 1.6; }
              .footer { border-top: 1px solid #eee; padding-top: 20px; text-align: center; color: #999; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="card">
                <div class="header">
                  <h1>¡Bienvenido a TallerCloud!</h1>
                </div>
                <div class="content">
                  <p>Hola ${userName},</p>
                  <p>Tu taller <strong>${tallerName}</strong> está listo para usar TallerCloud.</p>
                  <p>Accede a tu dashboard en <a href="${process.env.NEXT_PUBLIC_APP_URL}">TallerCloud</a> para comenzar a gestionar tus reparaciones.</p>
                  <p>Si tienes preguntas, no dudes en contactarnos.</p>
                </div>
                <div class="footer">
                  <p>© 2024 TallerCloud. Todos los derechos reservados.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
    })

    if (error) throw error
    return { success: true, messageId: data!.id }
  } catch (error) {
    console.error("[v0] Error sending welcome email:", error)
    return { success: false, error: "Error al enviar correo de bienvenida" }
  }
}

export async function sendAdminOTPEmail(email: string, code: string) {
  try {
    const resend = getResendClient()
    if (!resend) return { success: false, error: "Servicio de correo no configurado" }

    const { data, error } = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: email,
      subject: `${code} — Código de verificación de administrador`,
      html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; margin: 0; padding: 40px 0; }
    .wrap { max-width: 480px; margin: 0 auto; }
    .card { background: #1e293b; border-radius: 12px; padding: 40px; border: 1px solid #334155; }
    .logo { color: #60a5fa; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 28px; }
    h1 { color: #f1f5f9; font-size: 20px; font-weight: 700; margin: 0 0 8px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
    .code-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.25em; color: #60a5fa; }
    .expiry { color: #64748b; font-size: 12px; margin-top: 8px; }
    .warning { background: #431407; border: 1px solid #7c2d12; border-radius: 6px; padding: 12px 16px; color: #fca5a5; font-size: 12px; }
    .footer { color: #475569; font-size: 11px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="logo">TallerCloud — Admin</div>
    <h1>Verificación de identidad</h1>
    <p>Se solicitó acceso al panel de administración. Ingresa este código de 6 dígitos para continuar.</p>
    <div class="code-box">
      <div class="code">${code}</div>
      <div class="expiry">Válido por 10 minutos</div>
    </div>
    <div class="warning">
      ⚠️ Si no solicitaste este código, alguien puede estar intentando acceder a tu cuenta. Cambia tu contraseña inmediatamente.
    </div>
    <div class="footer">Este correo fue enviado automáticamente por TallerCloud. No respondas a este mensaje.</div>
  </div>
</div>
</body>
</html>`,
    })
    if (error) throw error
    return { success: true, messageId: data!.id }
  } catch (error) {
    console.error("[admin-otp] Error sending OTP email:", error)
    return { success: false, error: "Error al enviar correo OTP" }
  }
}

export async function sendMemberVerificationPinEmail(
  email: string,
  userName: string,
  pin: string
) {
  try {
    const resend = getResendClient()
    if (!resend) return { success: false, error: "Servicio de correo no configurado" }

    const { data, error } = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: email,
      subject: "Bienvenido a TallerCloud - Confirma tu correo electrónico",
      react: MemberVerificationPinTemplate({
        userName,
        pin,
      }),
    })

    if (error) throw error
    return { success: true, messageId: data!.id }
  } catch (error) {
    console.error("[v0] Error sending member PIN email:", error)
    return { success: false, error: "Error al enviar correo de verificación por PIN" }
  }
}
