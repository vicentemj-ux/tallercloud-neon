"use client"

import { forwardRef } from "react"

export interface AbonoReceiptData {
  folio: string
  customerName: string
  customerPhone: string
  deviceName: string
  metodoPago: string
  monto: number
  totalPagado: number
  presupuesto: number
  saldoRestante: number
  date: string
  cambio?: number
}

interface AbonoReceiptProps {
  data: AbonoReceiptData
  businessName?: string
  businessPhone?: string
  logoUrl?: string
  ticketSize?: string
  mensajeDespedida?: string
}

const BLACK = "#000000"
const FONT = "'Arial Black', 'Helvetica Neue', Arial, sans-serif"
const SHARP: React.CSSProperties = {
  WebkitFontSmoothing: "none",
  MozOsxFontSmoothing: "unset",
  textRendering: "optimizeSpeed",
  imageRendering: "pixelated",
  color: BLACK,
}

const METODO_LABEL: Record<string, string> = {
  efectivo: "EFECTIVO",
  tarjeta: "TARJETA",
  transferencia: "TRANSFERENCIA",
  mixto: "MIXTO",
}

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function Divider() {
  return (
    <div
      style={{ borderTop: "1px dashed black", margin: "6px 0", ...SHARP }}
      aria-hidden
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        ...SHARP,
        fontFamily: FONT,
        fontSize: "10px",
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: "3px",
      }}
    >
      {children}
    </div>
  )
}

function Row({ label, value, valueSize = "12px", valueWeight = 700 }: {
  label: string
  value: string
  valueSize?: string
  valueWeight?: number
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "6px",
      }}
    >
      <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>
        {label}
      </span>
      <span
        style={{
          ...SHARP,
          fontFamily: FONT,
          fontSize: valueSize,
          fontWeight: valueWeight,
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  )
}

const AbonoReceipt = forwardRef<HTMLDivElement, AbonoReceiptProps>(
  ({ data, businessName = "Mi Taller", businessPhone = "", logoUrl, mensajeDespedida }, ref) => {
    const metodoStr = METODO_LABEL[data.metodoPago] ?? data.metodoPago.toUpperCase()
    const tieneCambio = typeof data.cambio === "number" && data.cambio > 0
    const liquidado = data.saldoRestante <= 0

    return (
      <div
        ref={ref}
        id="abono-ticket"
        className="receipt-ticket"
        style={{
          width: "72mm",
          maxWidth: "72mm",
          margin: "0 auto",
          background: "#ffffff",
          color: BLACK,
          fontFamily: FONT,
          fontSize: "11px",
          lineHeight: 1.25,
          padding: "8px 6px",
          boxSizing: "border-box",
          overflow: "hidden",
          ...SHARP,
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ textAlign: "center", marginBottom: "4px" }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{
                maxHeight: "36px",
                objectFit: "contain",
                display: "block",
                margin: "0 auto 4px",
                imageRendering: "pixelated",
              }}
            />
          ) : (
            <div
              style={{
                ...SHARP,
                fontFamily: FONT,
                fontSize: "14px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                lineHeight: 1.1,
              }}
            >
              {businessName}
            </div>
          )}
          {businessPhone ? (
            <div
              style={{
                ...SHARP,
                fontFamily: FONT,
                fontSize: "10px",
                fontWeight: 700,
                marginTop: "3px",
                letterSpacing: "0.04em",
              }}
            >
              {businessPhone}
            </div>
          ) : null}
        </div>

        <Divider />

        {/* ── TiTULO ── */}
        <div style={{ textAlign: "center", margin: "4px 0" }}>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "12px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            COMPROBANTE DE ABONO
          </div>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "18px",
              fontWeight: 900,
              letterSpacing: "0.04em",
              marginTop: "3px",
            }}
          >
            #{data.folio}
          </div>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "10px",
              fontWeight: 700,
              marginTop: "3px",
              letterSpacing: "0.02em",
            }}
          >
            {data.date}
          </div>
        </div>

        <Divider />

        {/* ── CLIENTE ── */}
        <div style={{ margin: "4px 0" }}>
          <SectionLabel>CLIENTE</SectionLabel>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "13px",
              fontWeight: 900,
              lineHeight: 1.2,
              wordBreak: "break-word",
            }}
          >
            {data.customerName}
          </div>
          {data.customerPhone ? (
            <div
              style={{
                ...SHARP,
                fontFamily: FONT,
                fontSize: "10px",
                fontWeight: 700,
                marginTop: "2px",
                letterSpacing: "0.02em",
              }}
            >
              {data.customerPhone}
            </div>
          ) : null}
        </div>

        <Divider />

        {/* ── EQUIPO ── */}
        <div style={{ margin: "4px 0" }}>
          <SectionLabel>EQUIPO</SectionLabel>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "12px",
              fontWeight: 900,
              lineHeight: 1.2,
              wordBreak: "break-word",
            }}
          >
            {data.deviceName}
          </div>
        </div>

        <Divider />

        {/* ── DETALLE DEL PAGO ── */}
        <div style={{ margin: "4px 0" }}>
          <SectionLabel>DETALLE DEL PAGO</SectionLabel>
          <Row label="Metodo:" value={metodoStr} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "6px",
              marginTop: "6px",
            }}
          >
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>
              Abono:
            </span>
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "20px", fontWeight: 900 }}>
              ${fmt(data.monto)}
            </span>
          </div>
          {tieneCambio ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "6px",
                marginTop: "3px",
              }}
            >
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>
                Cambio:
              </span>
              <span style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900 }}>
                ${fmt(data.cambio!)}
              </span>
            </div>
          ) : null}
        </div>

        <Divider />

        {/* ── RESUMEN DE CUENTA ── */}
        <div
          style={{
            margin: "4px 0",
            border: "1px solid black",
            padding: "6px 5px",
          }}
        >
          <SectionLabel>RESUMEN DE CUENTA</SectionLabel>
          <Row label="Presupuesto:" value={`$${fmt(data.presupuesto)}`} />
          <Row label="Total pagado:" value={`$${fmt(data.totalPagado)}`} />
          <div
            style={{
              borderTop: "1px solid black",
              margin: "5px 0",
            }}
            aria-hidden
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "6px",
            }}
          >
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
              {liquidado ? "ESTADO:" : "SALDO:"}
            </span>
            <span style={{ ...SHARP, fontFamily: FONT, fontSize: liquidado ? "14px" : "18px", fontWeight: 900 }}>
              {liquidado ? "LIQUIDADO ✓" : `$${fmt(data.saldoRestante)}`}
            </span>
          </div>
        </div>

        <Divider />

        {/* ── FOOTER ── */}
        <div style={{ textAlign: "center", marginTop: "4px" }}>
          <div
            style={{
              ...SHARP,
              fontFamily: FONT,
              fontSize: "10px",
              fontWeight: 900,
              lineHeight: 1.3,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {mensajeDespedida || "GRACIAS POR SU PAGO"}
          </div>
        </div>
      </div>
    )
  }
)

AbonoReceipt.displayName = "AbonoReceipt"
export { AbonoReceipt }
