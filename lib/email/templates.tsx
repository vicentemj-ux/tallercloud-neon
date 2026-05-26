import * as React from "react"

interface VerifyEmailProps {
  userName: string
  verificationLink: string
  tallerName: string
}

export function VerifyEmailTemplate({
  userName,
  verificationLink,
  tallerName,
}: VerifyEmailProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f5f5f5", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", padding: "40px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h1 style={{ color: "#2563eb", fontSize: "28px", margin: "0 0 10px 0" }}>TallerCloud</h1>
          <p style={{ color: "#666", margin: "0" }}>Gestión de reparaciones inteligente</p>
        </div>

        {/* Content */}
        <div style={{ marginBottom: "30px" }}>
          <h2 style={{ color: "#333", fontSize: "20px", marginBottom: "15px" }}>Verifica tu correo electrónico</h2>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "15px" }}>
            Hola {userName},
          </p>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "15px" }}>
            Gracias por registrar tu taller <strong>{tallerName}</strong> en TallerCloud. Para completar tu registro y acceder a tu dashboard, necesitamos verificar tu correo electrónico.
          </p>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "20px" }}>
            Haz clic en el botón de abajo para verificar tu email. Este enlace expirará en 24 horas.
          </p>

          {/* CTA Button */}
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <a
              href={verificationLink}
              style={{
                display: "inline-block",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                padding: "12px 30px",
                borderRadius: "6px",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: "16px",
              }}
            >
              Verificar Email
            </a>
          </div>

          <p style={{ color: "#999", fontSize: "12px", marginBottom: "15px" }}>
            O copia y pega este enlace en tu navegador:
          </p>
          <p style={{ color: "#2563eb", fontSize: "12px", wordBreak: "break-all", backgroundColor: "#f0f0f0", padding: "10px", borderRadius: "4px" }}>
            {verificationLink}
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: "20px", textAlign: "center", color: "#999", fontSize: "12px" }}>
          <p>© 2024 TallerCloud. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}

interface ResetPasswordProps {
  userName: string
  resetLink: string
  tallerName: string
}

interface MemberVerificationPinProps {
  userName: string
  pin: string
}

export function MemberVerificationPinTemplate({
  userName,
  pin,
}: MemberVerificationPinProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f8fafc", padding: "24px" }}>
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          padding: "36px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <h1 style={{ color: "#2563eb", fontSize: "26px", margin: "0 0 6px 0", fontWeight: 800 }}>
            TallerCloud
          </h1>
          <p style={{ color: "#6b7280", margin: "0", fontSize: "13px" }}>
            Plataforma de gestión para talleres
          </p>
        </div>

        <h2 style={{ color: "#111827", fontSize: "22px", margin: "0 0 14px 0", textAlign: "center" }}>
          Confirma tu correo electrónico, {userName}
        </h2>

        <p style={{ color: "#374151", lineHeight: "1.65", marginBottom: "18px", textAlign: "center" }}>
          Para completar tu acceso, ingresa el código de verificación en el panel de TallerCloud.
        </p>

        <div
          style={{
            margin: "0 auto 16px auto",
            maxWidth: "280px",
            backgroundColor: "#f3f4f6",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "14px 20px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              color: "#111827",
              fontSize: "38px",
              lineHeight: "1",
              fontWeight: 800,
              letterSpacing: "6px",
            }}
          >
            {pin}
          </span>
        </div>

        <p style={{ color: "#4b5563", textAlign: "center", marginBottom: "22px", fontSize: "14px" }}>
          El código es válido por 15 minutos.
        </p>

        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: "16px",
            color: "#6b7280",
            fontSize: "12px",
            textAlign: "center",
            lineHeight: "1.7",
          }}
        >
          <p style={{ margin: "0 0 8px 0" }}>
            Si no solicitaste este acceso, puedes ignorar este correo.
          </p>
          <p style={{ margin: 0 }}>
            TallerCloud.net · Soporte · Términos · Privacidad
          </p>
        </div>
      </div>
    </div>
  )
}

export function ResetPasswordTemplate({
  userName,
  resetLink,
  tallerName,
}: ResetPasswordProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f5f5f5", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff", borderRadius: "8px", padding: "40px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h1 style={{ color: "#2563eb", fontSize: "28px", margin: "0 0 10px 0" }}>TallerCloud</h1>
          <p style={{ color: "#666", margin: "0" }}>Gestión de reparaciones inteligente</p>
        </div>

        {/* Content */}
        <div style={{ marginBottom: "30px" }}>
          <h2 style={{ color: "#333", fontSize: "20px", marginBottom: "15px" }}>Recupera tu contraseña</h2>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "15px" }}>
            Hola {userName},
          </p>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "15px" }}>
            Recibimos una solicitud para restablecer la contraseña de tu taller <strong>{tallerName}</strong>.
          </p>
          <p style={{ color: "#666", lineHeight: "1.6", marginBottom: "20px" }}>
            Haz clic en el botón de abajo para crear una nueva contraseña. Este enlace expirará en 1 hora.
          </p>

          {/* CTA Button */}
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <a
              href={resetLink}
              style={{
                display: "inline-block",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                padding: "12px 30px",
                borderRadius: "6px",
                textDecoration: "none",
                fontWeight: "bold",
                fontSize: "16px",
              }}
            >
              Restablecer Contraseña
            </a>
          </div>

          <p style={{ color: "#999", fontSize: "12px", marginBottom: "15px" }}>
            O copia y pega este enlace en tu navegador:
          </p>
          <p style={{ color: "#2563eb", fontSize: "12px", wordBreak: "break-all", backgroundColor: "#f0f0f0", padding: "10px", borderRadius: "4px" }}>
            {resetLink}
          </p>

          <p style={{ color: "#d32f2f", lineHeight: "1.6", marginTop: "20px", marginBottom: "0" }}>
            <strong>Nota:</strong> Si no solicitaste restablecer tu contraseña, ignora este correo. Tu contraseña seguirá siendo segura.
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: "20px", textAlign: "center", color: "#999", fontSize: "12px" }}>
          <p>© 2024 TallerCloud. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}
