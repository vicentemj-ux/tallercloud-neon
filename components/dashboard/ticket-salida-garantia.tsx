"use client"

import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import packageJson from "@/package.json"

const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => m.QRCodeSVG), { ssr: false })

export interface TicketSalidaGarantiaProps {
  paperSize?: string
  nombreTaller: string
  logoUrl: string | null
  direccion?: string
  telefono?: string
  folio: string
  fechaEntrega: string
  /** Nombre del cliente (quien trajo el equipo) */
  clienteNombre: string
  /** Tipo de dispositivo (Celular, Laptop, Consola, etc.) */
  tipo_equipo?: string
  /** Marca del dispositivo (Apple, Lenovo, Nintendo, etc.) */
  deviceBrand?: string
  /** Modelo del dispositivo (iPhone 14 Pro, Thinkpad T470, Switch OLED, etc.) */
  deviceModel?: string
  solucionRealizada: string
  costoTotal: number
  /** Abonos acumulados antes del pago final de entrega */
  anticiposPrevios: number
  /** Cobro en esta entrega (liquidacion) */
  pagoFinal: number
  fechaVencimientoGarantia: string
  /** Texto legal breve (p. ej. de configuracion) */
  terminosGarantiaCortos: string
  /** Mensaje de despedida personalizado (publicidad) */
  mensajeDespedida?: string
  /** repairId para el QR de garantia digital */
  repairId?: string
  className?: string
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

function fmt(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 30 o 60 dias segun texto de configuracion (sin columna dedicada en BD). */
export function warrantyDaysFromTerminos(terminos: string): 30 | 60 {
  const t = terminos.toLowerCase()
  if (/\b60\b/.test(t) || t.includes("sesenta") || t.includes("60 dia")) return 60
  return 30
}

function Divider({ thick = false }: { thick?: boolean }) {
  return (
    <div
      style={{ borderTop: `${thick ? 1.5 : 1}px solid ${BLACK}`, margin: "3px 0", ...SHARP }}
      aria-hidden
    />
  )
}

/** Construye etiqueta completa del equipo: "TIPO MARCA MODELO" */
function buildEquipoLabel(
  tipo_equipo?: string,
  deviceBrand?: string,
  deviceModel?: string
): string {
  const parts = [tipo_equipo, deviceBrand, deviceModel].filter(Boolean)
  return parts.join(" ") || "-"
}

export function TicketSalidaGarantia({
  paperSize,
  nombreTaller,
  logoUrl,
  direccion,
  telefono,
  folio,
  fechaEntrega,
  clienteNombre,
  tipo_equipo,
  deviceBrand,
  deviceModel,
  solucionRealizada,
  costoTotal,
  anticiposPrevios,
  pagoFinal,
  fechaVencimientoGarantia,
  terminosGarantiaCortos,
  mensajeDespedida,
  repairId,
  className,
}: TicketSalidaGarantiaProps) {
  const wPx = 302
  const saldo = Math.max(0, costoTotal - anticiposPrevios - pagoFinal)

  const qrUrl = repairId
    ? `${typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://tallercloud.net"}/garantia/${encodeURIComponent(repairId)}`
    : ""

  return (
    <div
      className={cn(
        "ticket-salida-garantia mx-auto bg-white text-black",
        "print:w-[80mm] print:max-w-[80mm]",
        "print:p-[3mm] print:shadow-none",
        className
      )}
      style={{
        width: wPx,
        maxWidth: "100%",
        fontFamily: FONT,
        fontSize: "11px",
        lineHeight: 1.25,
        color: BLACK,
        background: "#ffffff",
        overflow: "hidden",
        ...SHARP,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ── ENCABEZADO ── */}
      <div style={{ textAlign: "center", marginBottom: "4px" }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            style={{ maxHeight: "30px", objectFit: "contain", display: "block", margin: "0 auto 2px", imageRendering: "pixelated" }}
          />
        ) : (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "14px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {nombreTaller}
          </div>
        )}
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Comprobante de Entrega
        </div>
        {telefono ? (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, marginTop: "1px" }}>
            Tel: {telefono}
          </div>
        ) : null}
        {direccion ? (
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 700, marginTop: "1px" }}>
            {direccion}
          </div>
        ) : null}
      </div>

      <Divider thick />

      {/* ── FOLIO + FECHA ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 900 }}>
          FOLIO: {folio}
        </span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
          {fechaEntrega}
        </span>
      </div>

      <Divider />

      {/* ── CLIENTE ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1px" }}>
        CLIENTE
      </div>
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700, wordBreak: "break-word" }}>
        {clienteNombre || "-"}
      </div>

      <Divider />

      {/* ── EQUIPO ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1px" }}>
        EQUIPO
      </div>
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700, wordBreak: "break-word" }}>
        {buildEquipoLabel(tipo_equipo, deviceBrand, deviceModel)}
      </div>

      <Divider />

      {/* ── DIAGNOSTICO INICIAL ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1px" }}>
        DIAGNOSTICO INICIAL
      </div>
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, lineHeight: 1.2, wordBreak: "break-word" }}>
        {solucionRealizada}
      </div>

      <Divider />

      {/* ── RESUMEN DE CUENTA ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px", textAlign: "center" }}>
        RESUMEN DE CUENTA
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Total servicio</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>{fmt(costoTotal)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Anticipos</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>− {fmt(anticiposPrevios)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Pago final</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>− {fmt(pagoFinal)}</span>
      </div>

      <Divider />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "6px" }}>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "12px", fontWeight: 900 }}>SALDO</span>
        <span style={{ ...SHARP, fontFamily: FONT, fontSize: "16px", fontWeight: 900 }}>{fmt(saldo)}</span>
      </div>

      <Divider thick />

      {/* ── GARANTIA (recuadro destacado) ── */}
      <div
        style={{
          border: `1.5px solid ${BLACK}`,
          padding: "3px 4px",
          margin: "3px 0",
        }}
      >
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", marginBottom: "2px" }}>
          GARANTIA
        </div>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, textAlign: "center" }}>
          Valida hasta: <span style={{ fontWeight: 900 }}>{fechaVencimientoGarantia}</span>
        </div>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 700, lineHeight: 1.2, marginTop: "2px", textAlign: "center" }}>
          {terminosGarantiaCortos}
        </div>
      </div>

      <Divider />

      {/* ── TERMINOS ── */}
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
        TERMINOS
      </div>
      <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>
        {terminosGarantiaCortos.split(" * ").map((t, i) => (
          <div key={i} style={{ marginBottom: "1px" }}>* {t}</div>
        ))}
      </div>

      <Divider />

      {/* ── QR GARANTIA DIGITAL ── */}
      {repairId && qrUrl && (
        <div style={{ textAlign: "center", margin: "4px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "2px" }}>
            <QRCodeSVG value={qrUrl} size={56} level="M" bgColor="#ffffff" fgColor="#000000" />
          </div>
          <div style={{ ...SHARP, fontFamily: FONT, fontSize: "9px", fontWeight: 700, lineHeight: 1.2 }}>
            Escanea para ver tu garantia digital
          </div>
        </div>
      )}

      <Divider thick />

      {/* ── MENSAJE DE DESPEDIDA ── */}
      <div style={{ textAlign: "center", marginTop: "2px" }}>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, lineHeight: 1.2 }}>
          {mensajeDespedida || "¡Gracias por confiar en nosotros!"}
        </div>
      </div>

      {/* ── MARCA SAAS ── */}
      <div style={{ textAlign: "center", marginTop: "4px" }}>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "8px", fontWeight: 900, fontStyle: "italic" }}>
          Impulsado por TallerCloud v{packageJson.version}
        </div>
      </div>
    </div>
  )
}
