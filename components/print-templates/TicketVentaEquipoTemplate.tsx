"use client"

import type { TicketVentaTemplateProps } from "./TicketVentaTemplate"

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

function buildSpecs(item: {
  procesador?: string
  ram?: string
  almacenamiento?: string
}): string | null {
  const parts = [
    item.procesador,
    item.ram ? `${item.ram} RAM` : null,
    item.almacenamiento,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
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

/**
 * Template especializado para ventas que incluyen hardware (equipos).
 * Muestra una seccion de DATOS DEL DISPOSITIVO estructurada por cada articulo equipo.
 * Articulos sin datos de hardware se muestran como linea estandar.
 */
export function TicketVentaEquipoTemplate({
  venta,
  tallerNombre,
  tallerTelefono,
  logoUrl,
  terminosGarantia,
  mensajeDespedida,
}: TicketVentaTemplateProps) {
  const pagoConTotal = venta.total + (venta.cambio ?? 0)
  const tieneCambio = (venta.cambio ?? 0) > 0

  return (
    <div
      className="receipt-ticket equipo-ticket-root"
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
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {venta.items.map((item, i) => {
          const esEquipo = !!(item.marca || item.modelo || item.imei_serie)
          const specs = buildSpecs(item)

          return (
            <div key={i}>
              {/* Linea principal del articulo */}
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "flex-start" }}>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700, textAlign: "left", flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                  {item.cantidad}× {(item.categoria ? item.categoria + " " : "") + item.descripcion}
                </span>
                <span style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 900, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>
                  ${fmt(item.precio_unitario * item.cantidad)}
                </span>
              </div>

              {/* Seccion de dispositivo — solo si el articulo es equipo */}
              {esEquipo && (
                <div style={{ marginTop: "2px", marginLeft: "6px", paddingLeft: "6px", borderLeft: "1.5px solid black" }}>
                  {(item.marca || item.modelo) && (
                    <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                      {[item.marca, item.modelo].filter(Boolean).join(" ")}
                    </div>
                  )}
                  {item.imei_serie && (
                    <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                      <span style={{ fontWeight: 900 }}>IMEI/Serie:</span> {item.imei_serie}
                    </div>
                  )}
                  {item.color && (
                    <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                      <span style={{ fontWeight: 900 }}>Color:</span> {item.color}
                    </div>
                  )}
                  {item.condicion && (
                    <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                      <span style={{ fontWeight: 900 }}>Condicion:</span> {item.condicion}
                    </div>
                  )}
                  {specs && (
                    <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700 }}>
                      <span style={{ fontWeight: 900 }}>Specs:</span> {specs}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Divider />

      {/* ── Totales ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
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

      <Divider />

      {/* ── Pie ── */}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "11px", fontWeight: 700 }}>Gracias por tu confianza.</div>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 900, lineHeight: 1.2, marginTop: "2px" }}>
          {mensajeDespedida || "¡Gracias por tu confianza!"}
        </div>
        <div style={{ ...SHARP, fontFamily: FONT, fontSize: "10px", fontWeight: 700, lineHeight: 1.2, marginTop: "2px" }}>
          {terminosGarantia || "Garantia valida unicamente con este comprobante."}
        </div>
      </div>
    </div>
  )
}
