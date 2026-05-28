"use client"

import dynamic from "next/dynamic"
import { forwardRef, useMemo } from "react"
const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => m.QRCodeSVG), { ssr: false })
import { getPublicAppBaseUrl } from "@/lib/app-public"
import {
  type ChecklistIngreso,
  encendidoRecepcionLabel,
  itemsForDeviceType,
} from "@/lib/reparaciones/checklist-ingreso"
import type { ChecklistProData } from "@/lib/reparaciones/checklist-pro"

export interface TicketRecepcionData {
  folio: string
  date: string
  customerName: string
  customerPhone: string
  tipo_equipo?: string
  deviceBrand: string
  deviceModel: string
  imei?: string
  color?: string
  reportedFault: string
  falla?: string
  estimatedPrice?: string
  deposit?: string
  repairId?: string
  checklistIngreso?: ChecklistIngreso | null
  checklistPro?: ChecklistProData | null
  servicios?: { nombre: string; precio: number; cantidad: number }[]
}

interface TicketRecepcionTemplateProps {
  data: TicketRecepcionData
  businessName?: string
  businessPhone?: string
  terminosGarantia?: string
  ticketSize?: string
  logoUrl?: string
  showHealthCheckFuncional?: boolean
  mensajeDespedida?: string
  /** Fase 2 - visibilidad controlada desde Imprenta */
  mostrarLogo?: boolean
  mostrarTecnico?: boolean
  mostrarPrecios?: boolean
  mostrarRedesSociales?: boolean
  redesSociales?: {
    facebook?: string | null
    instagram?: string | null
    tiktok?: string | null
    whatsapp?: string | null
  }
  tecnicoNombre?: string
  /** Servicios aplicados del catalogo */
  servicios?: { nombre: string; precio: number; cantidad: number }[]
}

// ─── Tokens de diseno ─────────────────────────────────────────────────────────
// Todo inline → garantiza negro puro e impacto en cualquier driver de impresora

const FONT  = "Arial, Helvetica, sans-serif"
const MONO  = "'Courier New', Courier, monospace"
const BLACK = "#000000"

// Bloques de estilo reutilizables
const SHARP: React.CSSProperties = {
  WebkitFontSmoothing: "none",
  MozOsxFontSmoothing: "grayscale",
  textRendering: "optimizeSpeed",
  color: BLACK,
}

// Pesos: minimo 700 en cuerpo, 900 en encabezados de seccion
const w700: React.CSSProperties = { ...SHARP, fontWeight: 700, fontFamily: FONT }
const w900: React.CSSProperties = { ...SHARP, fontWeight: 900, fontFamily: FONT }
const w600: React.CSSProperties = { ...SHARP, fontWeight: 600, fontFamily: FONT }

const LABEL_STYLE: React.CSSProperties = {
  ...w900,
  fontSize: "9px",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
  flexShrink: 0,
}

const DIVIDER_DASH = "- - - - - - - - - - - - - - - - - - - - -"

function resolveReportedFault(d: TicketRecepcionData): string {
  return (d.reportedFault && String(d.reportedFault).trim())
    || (d.falla && String(d.falla).trim())
    || ""
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{ textAlign: "center", fontSize: "9px", color: BLACK, margin: "3px 0", letterSpacing: "0.04em", fontFamily: FONT }}>
      {DIVIDER_DASH}
    </div>
  )
}

/** Fila dos columnas: ETIQUETA (izq, 900) ── valor (der, 700) */
function Row({ label, value, valSz = "11px" }: { label: string; value: string; valSz?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px", marginBottom: "1px" }}>
      <span style={LABEL_STYLE}>{label}</span>
      <span style={{ ...w700, fontSize: valSz, textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {value}
      </span>
    </div>
  )
}

/** Fila importes: etiqueta (izq) ── monto monospace (der) */
function MoneyRow({ label, value, labelW = 700, valSz = "11px" }: {
  label: string; value: string; labelW?: number; valSz?: string
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1px" }}>
      <span style={{ ...SHARP, fontFamily: FONT, fontWeight: labelW, fontSize: valSz }}>{label}</span>
      <span style={{ ...SHARP, fontFamily: MONO, fontWeight: 700, fontSize: valSz }}>{value}</span>
    </div>
  )
}

// ─── Template principal ───────────────────────────────────────────────────────

const TicketRecepcionTemplate = forwardRef<HTMLDivElement, TicketRecepcionTemplateProps>(
  ({ data, businessName = "Mi Taller", businessPhone = "", terminosGarantia, logoUrl, showHealthCheckFuncional = false, mensajeDespedida, mostrarLogo = true, mostrarTecnico = true, mostrarPrecios = true, mostrarRedesSociales = false, redesSociales, tecnicoNombre, servicios }, ref) => {

    const trackingUrl = useMemo(() => {
      const base = getPublicAppBaseUrl()
      const id   = data.repairId?.trim()
      if (!base) return id ? `/track/${id}` : "/"
      return id ? `${base}/track/${id}` : `${base}/`
    }, [data.repairId])

    const faultText = resolveReportedFault(data)
    const total  = data.estimatedPrice ? parseFloat(data.estimatedPrice) : 0
    const pagado = data.deposit        ? parseFloat(data.deposit)        : 0
    const resta  = Math.max(0, total - pagado)
    const fmtMXN = (n: number) =>
      "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const terminosArr: string[] = terminosGarantia
      ? terminosGarantia.split(/\n/).map(t => t.trim()).filter(Boolean)
      : [
          "No nos hacemos responsables por perdida de datos, SD o SIM.",
          "Equipos no reclamados despues de 90 dias seran desechados.",
          "Garantia cubre unicamente la reparacion realizada (30 dias).",
          "Al firmar este ticket acepta los terminos anteriores.",
        ]

    const obsEsteticas = data.checklistIngreso?.observacionesEsteticas?.trim() || ""

    return (
      <div
        ref={ref}
        id="ticket"
        className="receipt-ticket"
        style={{
          // ── Area segura 72mm - globals.css lo sobreescribe en @media print con !important ──
          width: "72mm",
          maxWidth: "72mm",
          margin: "0",
          padding: "0 3mm",
          boxSizing: "border-box",
          background: "#ffffff",
          color: BLACK,
          fontFamily: FONT,
          fontSize: "11px",
          lineHeight: "1.25",
          overflow: "hidden",
          // Nitidez extrema - matar suavizado del browser
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeSpeed",
          imageRendering: "pixelated",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        } as React.CSSProperties}
      >

        {/* ── ENCABEZADO ── */}
        {mostrarLogo && logoUrl && (
          <div style={{ textAlign: "center", marginBottom: "2px" }}>
            <img
              src={logoUrl}
              alt=""
              style={{ maxHeight: "30px", objectFit: "contain", display: "block", margin: "0 auto", imageRendering: "pixelated" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          </div>
        )}
        <div style={{ textAlign: "center" }}>
          <div style={{ ...w900, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {businessName}
          </div>
          {businessPhone && (
            <div style={{ ...w700, fontSize: "10px" }}>Tel: {businessPhone}</div>
          )}
        </div>

        <Divider />

        {/* ── FOLIO ── */}
        <div style={{ textAlign: "center" }}>
          <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            ORDEN DE SERVICIO
          </div>
          <div style={{ ...w900, fontSize: "20px", lineHeight: "1.05", letterSpacing: "0.04em" }}>
            #{data.folio}
          </div>
          <div style={{ ...w700, fontSize: "10px" }}>{data.date}</div>
        </div>

        <Divider />

        {/* ── CLIENTE ── */}
        <Row label="Cliente"  value={data.customerName || "-"} />
        {data.customerPhone && <Row label="Tel" value={data.customerPhone} valSz="10px" />}

        <Divider />

        {/* ── EQUIPO ── */}
        <Row label="Equipo" value={`${data.tipo_equipo ? data.tipo_equipo + " " : ""}${data.deviceBrand} ${data.deviceModel}`.trim() || "-"} />
        {data.imei  && <Row label="IMEI"  value={data.imei}  valSz="10px" />}
        {data.color && <Row label="Color" value={data.color} valSz="10px" />}

        <Divider />

        {/* ── FALLA ── */}
        <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1px" }}>
          Falla reportada:
        </div>
        <div style={{ ...w700, fontSize: "11px", textTransform: "uppercase", lineHeight: "1.2", wordBreak: "break-word" }}>
          {faultText || "Sin descripcion inicial"}
        </div>

        {/* ── REVISION RAPIDA (siempre que exista checklistIngreso) ── */}
        {data.checklistIngreso && (
          <>
            <Divider />
            <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
              Revision rapida:
            </div>
            <Row
              label="Enciende"
              value={encendidoRecepcionLabel(data.checklistIngreso.encendido)}
              valSz="10px"
            />

            {/* Health Check PRO - solo si el taller lo tiene activo */}
            {showHealthCheckFuncional && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 6px", marginTop: "2px" }}>
                {itemsForDeviceType(data.tipo_equipo || "Otro").map(({ key, label }) => {
                  const ok = data.checklistIngreso!.funcional[key] !== false
                  return (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", ...w700, fontSize: "9px" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {label}
                      </span>
                      <span style={{ ...w900, flexShrink: 0, marginLeft: "2px", textDecoration: ok ? "none" : "underline" }}>
                        {ok ? "OK" : "!!"}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── OBSERVACIONES ESTETICAS (solo si tiene contenido) ── */}
        {obsEsteticas && (
          <>
            <Divider />
            <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1px" }}>
              Observaciones esteticas:
            </div>
            <div style={{ ...w700, fontSize: "10px", lineHeight: "1.3", wordBreak: "break-word" }}>
              {obsEsteticas}
            </div>
          </>
        )}

        <Divider />

        {/* ── TECNICO ── */}
        {mostrarTecnico && tecnicoNombre && (
          <>
            <Row label="Tecnico" value={tecnicoNombre} valSz="10px" />
            <Divider />
          </>
        )}

        {/* ── SERVICIOS ── */}
        {mostrarPrecios && servicios && servicios.length > 0 && (
          <>
            <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
              Servicios:
            </div>
            {servicios.map((s, i) => (
              <MoneyRow
                key={i}
                label={`${s.nombre}${s.cantidad > 1 ? ` x${s.cantidad}` : ""}`}
                value={fmtMXN(s.precio * s.cantidad)}
                labelW={700}
                valSz="10px"
              />
            ))}
            <Divider />
          </>
        )}

        {/* ── TOTALES ── */}
        {mostrarPrecios && (
          <>
            <MoneyRow label="Presupuesto:" value={fmtMXN(total)}  labelW={900} />
            <MoneyRow label="Anticipo:"    value={fmtMXN(pagado)} labelW={700} />
            <div style={{ borderTop: `1.5px solid ${BLACK}`, margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ ...w900, fontSize: "11px" }}>Saldo pendiente:</span>
              <span style={{ ...SHARP, fontFamily: MONO, fontWeight: 900, fontSize: "20px", lineHeight: "1" }}>
                {fmtMXN(resta)}
              </span>
            </div>
            <div style={{ textAlign: "center", ...w700, fontSize: "9px", fontStyle: "italic", marginTop: "1px" }}>
              * Sujeto a cambios tras diagnostico
            </div>
            <Divider />
          </>
        )}

        {/* ── TERMINOS ── */}
        {terminosArr.length > 0 && (
          <>
            <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
              Terminos y condiciones:
            </div>
            <p style={{ ...w700, fontSize: "10px", lineHeight: "1.3", margin: 0, wordBreak: "break-word" }}>
              {terminosArr.join(" * ")}
            </p>
            <Divider />
          </>
        )}

        {/* ── FIRMA ── */}
        <div style={{ textAlign: "center" }}>
          <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>
            Firma del cliente
          </div>
          <div style={{ height: "1.4cm", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ width: "65%", borderBottom: `1px solid ${BLACK}` }} />
          </div>
          <div style={{ ...w700, fontSize: "9px" }}>Acepto los terminos y condiciones</div>
        </div>

        <Divider />

        {/* ── QR ── */}
        <div style={{ textAlign: "center" }}>
          <div style={{ ...w900, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>
            Rastrea tu equipo en linea
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <QRCodeSVG value={trackingUrl} size={66} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>
          <div style={{ ...w700, fontSize: "9px", marginTop: "2px" }}>
            Escanea para ver el estado de tu reparacion
          </div>
        </div>

        {/* ── REDES SOCIALES ── */}
        {mostrarRedesSociales && redesSociales && (
          <>
            <Divider />
            <div style={{ textAlign: "center", ...w700, fontSize: "9px", lineHeight: 1.4 }}>
              {redesSociales.facebook && <div>FB: {redesSociales.facebook}</div>}
              {redesSociales.instagram && <div>IG: {redesSociales.instagram}</div>}
              {redesSociales.tiktok && <div>TK: {redesSociales.tiktok}</div>}
              {redesSociales.whatsapp && <div>WA: {redesSociales.whatsapp}</div>}
            </div>
          </>
        )}

        {/* ── CIERRE - limite fisico inferior del documento ── */}
        <div style={{ textAlign: "center", ...w900, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>
          {mensajeDespedida || "¡ Gracias por su preferencia !"}
        </div>

      </div>
    )
  }
)

TicketRecepcionTemplate.displayName = "TicketRecepcionTemplate"
export { TicketRecepcionTemplate }
