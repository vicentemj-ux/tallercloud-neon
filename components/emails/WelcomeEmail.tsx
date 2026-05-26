import * as React from "react"

interface WelcomeEmailProps {
  ownerName: string
  workshopName: string
  dashboardUrl: string
}

export function WelcomeEmail({ ownerName, workshopName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <div
      style={{
        margin: 0,
        padding: "24px",
        backgroundColor: "#f8fafc",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: "620px",
          margin: "0 auto",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            backgroundColor: "#eff6ff",
            borderBottom: "1px solid #dbeafe",
            padding: "20px 24px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "24px",
              lineHeight: "30px",
              fontWeight: 800,
              color: "#2563eb",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
            }}
          >
            Bienvenido a TallerCloud
          </h1>
        </div>

        <div style={{ padding: "24px" }}>
          <p style={{ margin: "0 0 12px 0", fontSize: "15px", lineHeight: "24px", color: "#0f172a" }}>
            Hola {ownerName},
          </p>
          <p style={{ margin: "0 0 12px 0", fontSize: "15px", lineHeight: "24px", color: "#0f172a" }}>
            Tu cuenta para <strong>{workshopName}</strong> se creó correctamente.
          </p>
          <p style={{ margin: "0 0 12px 0", fontSize: "15px", lineHeight: "24px", color: "#0f172a" }}>
            Tus <strong>30 días de prueba gratuita</strong> ya comenzaron automáticamente.
          </p>
          <p style={{ margin: "0 0 20px 0", fontSize: "14px", lineHeight: "22px", color: "#475569" }}>
            Ingresa a tu panel para empezar a gestionar reparaciones, inventario y ventas.
          </p>

          <div style={{ textAlign: "center", marginTop: "4px" }}>
            <a
              href={dashboardUrl}
              style={{
                display: "inline-block",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                textDecoration: "none",
                borderRadius: "10px",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              Ir a mi Panel
            </a>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            padding: "14px 24px",
            backgroundColor: "#f8fafc",
            fontSize: "12px",
            lineHeight: "18px",
            color: "#64748b",
            textAlign: "center",
          }}
        >
          TallerCloud · Plataforma SaaS para talleres de reparación
        </div>
      </div>
    </div>
  )
}

