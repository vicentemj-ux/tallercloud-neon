"use client"

import { forwardRef } from "react"

export interface VentaLabelData {
  kind: "venta-label"
  id?: string
  folio?: string
  clienteNombre?: string | null
  items?: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>
  total?: number
  fecha?: string
}

interface VentaLabelProps {
  data: VentaLabelData
}

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const VentaLabel = forwardRef<HTMLDivElement, VentaLabelProps>(({ data }, ref) => {
  const folio = data.folio ?? data.id ?? "—"
  const cliente = (data.clienteNombre ?? null) || "VENTA GENERAL"
  const items = data.items ?? []
  const total = data.total ?? 0
  const fecha = data.fecha
    ? new Date(data.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : ""

  // Show at most 3 items to fit label height
  const visibleItems = items.slice(0, 3)
  const extraCount = items.length - visibleItems.length

  return (
    <div
      ref={ref}
      className="venta-label mx-auto font-mono text-black"
      style={{
        width: "50mm",
        height: "25mm",
        boxSizing: "border-box",
        padding: "2mm",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* Header: folio + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "11pt", fontWeight: 900, letterSpacing: "0.06em", lineHeight: 1 }}>
          {folio}
        </span>
        <span style={{ fontSize: "6pt", color: "#555" }}>{fecha}</span>
      </div>

      {/* Cliente */}
      <div
        style={{
          fontSize: "7pt",
          fontWeight: 600,
          lineHeight: 1.1,
          borderTop: "0.5pt solid #ccc",
          paddingTop: "1mm",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {cliente}
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {visibleItems.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "6.5pt",
              lineHeight: 1.15,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                paddingRight: "2mm",
              }}
            >
              {item.cantidad}x {item.descripcion}
            </span>
            <span style={{ flexShrink: 0, fontWeight: 600 }}>
              ${fmt(item.precio_unitario * item.cantidad)}
            </span>
          </div>
        ))}
        {extraCount > 0 && (
          <div style={{ fontSize: "6pt", color: "#666" }}>+{extraCount} más</div>
        )}
      </div>

      {/* Total */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderTop: "0.5pt solid #000",
          paddingTop: "1mm",
        }}
      >
        <span style={{ fontSize: "7pt", fontWeight: 700, letterSpacing: "0.1em" }}>TOTAL</span>
        <span style={{ fontSize: "12pt", fontWeight: 900, lineHeight: 1 }}>${fmt(total)}</span>
      </div>
    </div>
  )
})

VentaLabel.displayName = "VentaLabel"

export { VentaLabel }
