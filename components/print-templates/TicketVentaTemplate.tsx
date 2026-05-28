"use client"

import type { VentaCreada } from "@/lib/actions/ventas-prisma"

const METODOS_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mixto: "Pago Mixto",
}

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length <= 2) return raw
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export interface TicketVentaTemplateProps {
  venta: VentaCreada
  tallerNombre: string
  tallerTelefono: string
  logoUrl?: string | null
  tamanoPapel?: string
  terminosGarantia?: string
  mensajeDespedida?: string
  /** Fase 2 — visibilidad controlada desde Imprenta */
  mostrarLogo?: boolean
  mostrarPrecios?: boolean
  mostrarRedesSociales?: boolean
  redesSociales?: {
    facebook?: string | null
    instagram?: string | null
    tiktok?: string | null
    whatsapp?: string | null
  }
}

const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif"
const BLACK = "#000000"
const SHARP: React.CSSProperties = {
  WebkitFontSmoothing: "none",
  MozOsxFontSmoothing: "unset",
  textRendering: "optimizeSpeed",
  imageRendering: "pixelated",
  color: BLACK,
}

function Divider() {
  return (
    <div
      style={{ ...SHARP, fontSize: "10px", textAlign: "center", margin: "3px 0", letterSpacing: "0.04em", fontFamily: FONT }}
      aria-hidden
    >
      {"--------------------------------"}
    </div>
  )
}

export function TicketVentaTemplate({
  venta,
  tallerNombre,
  tallerTelefono,
  logoUrl,
  terminosGarantia,
  mensajeDespedida,
  mostrarLogo = true,
  mostrarPrecios = true,
  mostrarRedesSociales = false,
  redesSociales,
}: TicketVentaTemplateProps) {
  const pagoConTotal = venta.total + (venta.cambio ?? 0)
  const tieneCambio = (venta.cambio ?? 0) > 0

  return (
    <div
      className="receipt-ticket pos-sale-ticket-root"
      style={{
        width: "72mm",
        maxWidth: "72mm",
        margin: "0 auto",
        background: "#ffffff",
        color: BLACK,
        fontFamily: FONT,
        fontSize: "11px",
        lineHeight: 1.25,
        overflow: "hidden",
        ...SHARP,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ── Encabezado ── */}
      <div style={{ textAlign: "center", marginBottom: "4px" }}>
        {mostrarLogo && logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{ maxHeight: "30px", objectFit: "contain", display: "block", margin: "0 auto 2px", imageRendering: "pixelated" }}
          />
        ) : (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "16px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            {tallerNombre}
          </div>
        )}
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Comprobante de Venta
        </div>
        {tallerTelefono ? (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, marginTop: "2px" }}>
            {fmtPhone(tallerTelefono)}
          </div>
        ) : null}
      </div>

      <Divider />

      {/* ── Datos del cliente ── */}
      <div style={{ fontFamily: FONT, fontSize: "11px", lineHeight: 1.3 }}>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Cliente:</span> {venta.cliente_nombre || "Venta General"}
        </div>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Folio:</span> {venta.folio}
        </div>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Fecha:</span> {fmtDate(venta.created_at)}
        </div>
      </div>

      <Divider />

      {/* ── Articulos ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {venta.items.map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "flex-start" }}>
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700, textAlign: "left", flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ fontWeight: 900 }}>{item.cantidad}×</span> {(item.categoria ? item.categoria + " " : "") + item.descripcion}
            </span>
            {mostrarPrecios && (
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 900, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                ${fmt(item.precio_unitario * item.cantidad)}
              </span>
            )}
          </div>
        ))}
      </div>

      <Divider />

      {/* ── Totales ── */}
      {mostrarPrecios && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          {(venta.descuento ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Descuento</span>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>-$ {fmt(venta.descuento)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "baseline" }}>
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900 }}>TOTAL</span>
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900 }}>${fmt(venta.total)}</span>
          </div>
          {venta.metodo_pago === "mixto" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Efectivo</span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>${fmt(venta.monto_efectivo)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Tarjeta</span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>${fmt(venta.monto_tarjeta)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Transferencia</span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>${fmt(venta.monto_transferencia)}</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Metodo de pago</span>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>{METODOS_LABEL[venta.metodo_pago] ?? venta.metodo_pago}</span>
            </div>
          )}
          {tieneCambio && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Pago con</span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>${fmt(pagoConTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 900 }}>Cambio</span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 900 }}>${fmt(venta.cambio)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <Divider />

      {/* ── Pie ── */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Gracias por tu confianza.</div>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, lineHeight: 1.2, marginTop: "2px" }}>
          {mensajeDespedida || "¡Gracias por tu confianza!"}
        </div>
        {terminosGarantia && (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, lineHeight: 1.2, marginTop: "2px" }}>
            {terminosGarantia}
          </div>
        )}
        {mostrarRedesSociales && redesSociales && (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 700, lineHeight: 1.4, marginTop: "4px" }}>
            {redesSociales.facebook && <div>FB: {redesSociales.facebook}</div>}
            {redesSociales.instagram && <div>IG: {redesSociales.instagram}</div>}
            {redesSociales.tiktok && <div>TK: {redesSociales.tiktok}</div>}
            {redesSociales.whatsapp && <div>WA: {redesSociales.whatsapp}</div>}
          </div>
        )}
      </div>
    </div>
  )
}


