"use client"

import type { CobroReparacionTicketData } from "@/lib/actions/ventas"

const METODOS_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mixto: "Pago mixto",
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

export interface TicketCobroReparacionTemplateProps {
  data: CobroReparacionTicketData
  tallerNombre: string
  tallerTelefono: string
  logoUrl?: string | null
  tamanoPapel?: string
  mensajeDespedida?: string
  servicios?: { nombre: string; precio: number; cantidad: number }[]
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
      style={{ borderTop: "1px dashed black", margin: "4px 0", ...SHARP }}
      aria-hidden
    />
  )
}

export function TicketCobroReparacionTemplate({
  data,
  tallerNombre,
  tallerTelefono,
  logoUrl,
  mensajeDespedida,
  servicios,
}: TicketCobroReparacionTemplateProps) {
  const titulo = data.tipoMov === "liquidacion" ? "Liquidación de reparación" : "Anticipo de reparación"
  const metodo = (data.metodo_pago || "").toLowerCase()

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
        {logoUrl ? (
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
          {titulo}
        </div>
        {tallerTelefono ? (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, marginTop: "2px" }}>
            {tallerTelefono}
          </div>
        ) : null}
      </div>

      <Divider />

      {/* ── Datos ── */}
      <div style={{ fontFamily: FONT, fontSize: "11px", lineHeight: 1.3 }}>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Cliente:</span> {data.cliente}
        </div>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Folio orden:</span> {data.folio}
        </div>
        <div style={{ ...SHARP, fontWeight: 700 }}>
          <span style={{ fontWeight: 900 }}>Fecha:</span> {fmtDate(data.fechaIso)}
        </div>
      </div>

      <Divider />

      {/* ── Conceptos ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700, lineHeight: 1.3, wordBreak: "break-word" }}>
        {data.conceptos}
      </div>

      {/* ── Servicios ── */}
      {servicios && servicios.length > 0 && (
        <>
          <Divider />
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
            Servicios aplicados:
          </div>
          {servicios.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "6px", marginBottom: "1px" }}>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                {s.nombre}{s.cantidad > 1 ? ` ×${s.cantidad}` : ""}
              </span>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                ${fmt(s.precio * s.cantidad)}
              </span>
            </div>
          ))}
        </>
      )}

      <Divider />

      {/* ── Total ── */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "baseline" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900 }}>TOTAL</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900 }}>${fmt(data.monto)}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", marginTop: "2px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Método</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>{METODOS_LABEL[metodo] ?? data.metodo_pago}</span>
      </div>

      <Divider />

      {/* ── Pie ── */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, lineHeight: 1.2 }}>
          {mensajeDespedida || "Gracias por su preferencia"}
        </div>
      </div>
    </div>
  )
}
