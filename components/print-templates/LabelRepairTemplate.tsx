"use client"

import { forwardRef } from "react"

export interface LabelRepairTemplateData {
  folio: string
  deviceName?: string
  customerName: string
  customerPhone: string
  reportedFault: string
  estimatedPrice?: string
  /** "PIN: 1234" | "PATRON: 1-4-7" | "PASS: abc" - null si sin bloqueo */
  accessCode?: string | null
  extras?: string | null
  /** Nombre del taller (branding en la etiqueta) */
  tallerName?: string
}

interface LabelRepairTemplateProps {
  data: LabelRepairTemplateData
  /** Fase 3 - visibilidad controlada desde Imprenta */
  mostrarPrecios?: boolean
}

function decodeIfEncoded(str: string): string {
  if (!str) return str
  if (str.includes("%20") || str.includes("%2C") || str.includes("%C3") || str.includes("%")) {
    try {
      return decodeURIComponent(str)
    } catch {
      return str
    }
  }
  return str
}

function getTallerNameFromCookie(): string {
  if (typeof document === "undefined") return ""
  const match = document.cookie.match(/(?:^|; )tallerName=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ""
}

function fmtMoney(value?: string | null): string {
  if (!value) return ""
  const n = Number(value)
  if (Number.isNaN(n)) return value
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
}

/**
 * Etiqueta de reparacion - formato UNICO: 2x1" (50.8mm x 25.4mm).
 * @page CSS: size: 50.8mm 25.4mm; margin: 0;
 *
 * Layout de 5 lineas optimizado:
 *   1. TALLER NAME          #FOLIO      ← branding + id
 *   2. CLIENTE                          ← mas grande, quien trajo el equipo
 *   3. DISPOSITIVO          PIN:xxxx    ← modelo + seguridad
 *   4-5. FALLA REPORTADA (wrap)         ← ocupa ~1.5 lineas
 *        PRESP. $X            ← al extremo derecho, ultima linea
 */
const LabelRepairTemplate = forwardRef<HTMLDivElement, LabelRepairTemplateProps>(
  ({ data, mostrarPrecios = true }, ref) => {
    const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    const hasAccess = !!data.accessCode
    const hasPrice = mostrarPrecios && !!data.estimatedPrice && Number(data.estimatedPrice) > 0
    const tallerName = decodeIfEncoded(data.tallerName || "") || getTallerNameFromCookie() || ""

    return (
      <div
        ref={ref}
        id="etiqueta"
        className="label-repair-template"
        style={{
          position: "relative",
          width: "50.8mm",
          height: "25.4mm",
          /* Padding minimo para eliminar margenes libres */
          padding: "0.5mm 0.3mm 0.4mm 0.3mm",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          overflow: "hidden",
          background: "white",
          color: "black",
          fontFamily: FONT,
          lineHeight: 1.05,
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "unset",
          textRendering: "optimizeSpeed",
          imageRendering: "pixelated",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        } as React.CSSProperties}
      >
        {/* ── Linea 1: Branding (Taller) + Folio ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexShrink: 0,
            borderBottom: "1px solid black",
            paddingBottom: "0.3mm",
          }}
        >
          <span
            style={{
              fontSize: "7.5px",
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "65%",
            }}
          >
            {tallerName || "TALLER"}
          </span>
          <span style={{ fontSize: "8.5px", fontWeight: 900, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
            #{data.folio}
          </span>
        </div>

        {/* ── Linea 2: Cliente (mas grande) ── */}
        <div
          style={{
            fontSize: "9px",
            fontWeight: 900,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {data.customerName}
        </div>

        {/* ── Linea 3: Dispositivo + Codigo de acceso ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span
            style={{
              fontSize: "8.5px",
              fontWeight: 900,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: hasAccess ? "58%" : "100%",
            }}
          >
            {data.deviceName || "-"}
          </span>
          {hasAccess && (
            <span
              style={{
                fontSize: "7.5px",
                fontWeight: 900,
                letterSpacing: "0.04em",
                border: "1px solid black",
                padding: "0.2mm 0.6mm",
                lineHeight: 1,
                whiteSpace: "nowrap",
                background: "white",
                flexShrink: 0,
              }}
            >
              {data.accessCode}
            </span>
          )}
        </div>

        {/* ── Lineas 4-5: Falla reportada (wrap ~1.5 lineas) + Presupuesto al extremo derecho ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexShrink: 0, gap: "1.5mm" }}>
          <div
            style={{
              flex: 1,
              fontSize: "8px",
              fontWeight: 700,
              lineHeight: 1.08,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              wordBreak: "break-word",
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 900 }}>FALLA REPORTADA:</span>{" "}
            {data.reportedFault || "Sin descripcion"}
          </div>
          {hasPrice && (
            <span
              style={{
                fontSize: "8.5px",
                fontWeight: 900,
                whiteSpace: "nowrap",
                flexShrink: 0,
                lineHeight: 1.08,
              }}
            >
              PRESP. {fmtMoney(data.estimatedPrice)}
            </span>
          )}
        </div>
      </div>
    )
  }
)

LabelRepairTemplate.displayName = "LabelRepairTemplate"
export { LabelRepairTemplate }
