"use client"

import dynamic from "next/dynamic"
import { forwardRef } from "react"
const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => m.QRCodeSVG), { ssr: false })
import type { RepairPrintData } from "@/lib/actions/repairs"

interface TicketDocumentoTemplateProps {
  repair: RepairPrintData
  businessName: string
  businessPhone?: string
  businessEmail?: string
  businessAddress?: string
  logoUrl?: string | null
  trackingUrl: string
  terminosGarantia?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" })

const TicketDocumentoTemplate = forwardRef<HTMLDivElement, TicketDocumentoTemplateProps>(
  ({ repair, businessName, businessPhone, businessEmail, businessAddress, logoUrl, trackingUrl, terminosGarantia }, ref) => {
    const presupuesto = repair.precio_estimado ?? 0
    const anticipo = repair.anticipo ?? 0
    const saldo = Math.max(0, presupuesto - anticipo)
    const totalGastos = repair.gastos.reduce((s, g) => s + g.costo, 0)

    return (
      <div
        ref={ref}
        className="bg-white text-slate-900"
        style={{
          width: "216mm",
          minHeight: "279mm",
          padding: "14mm 18mm",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          fontSize: "9.5pt",
          lineHeight: 1.5,
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "5mm" }}>
          <div>
            {logoUrl ? <img src={logoUrl} alt={businessName} style={{ height: "36px", objectFit: "contain", marginBottom: "4px" }} /> : null}
            <div style={{ fontSize: "16pt", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a" }}>{businessName}</div>
            {businessAddress ? <div style={{ fontSize: "8pt", color: "#64748b" }}>{businessAddress}</div> : null}
            <div style={{ display: "flex", gap: "10px", fontSize: "8pt", color: "#64748b" }}>
              {businessPhone ? <span>{businessPhone}</span> : null}
              {businessEmail ? <span>{businessEmail}</span> : null}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "8pt", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>Orden de Servicio</div>
            <div style={{ fontSize: "18pt", fontWeight: 800, color: "#2563eb", letterSpacing: "-0.02em" }}>#{repair.folio}</div>
            <div style={{ fontSize: "8pt", color: "#64748b" }}>{fmtDateShort(repair.fecha_creacion)}</div>
          </div>
        </div>
        <div style={{ height: "2px", background: "#2563eb", borderRadius: "1px", marginBottom: "5mm" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm", marginBottom: "5mm" }}>
          <Card title="Datos del Cliente">
            <InfoLine label="Nombre" value={repair.cliente_nombre} />
            <InfoLine label="Teléfono" value={repair.cliente_telefono} />
            <InfoLine label="Fecha" value={fmtDateShort(repair.fecha_creacion)} />
            {repair.tecnico ? <InfoLine label="Técnico" value={repair.tecnico} /> : null}
          </Card>
          <Card title="Información del Equipo">
            <InfoLine label="Equipo" value={`${repair.dispositivo_marca} ${repair.dispositivo_modelo}`} />
            {repair.tipo_equipo ? <InfoLine label="Tipo" value={repair.tipo_equipo} /> : null}
            {repair.imei_serie ? <InfoLine label="IMEI/Serie" value={repair.imei_serie} /> : null}
            {repair.color ? <InfoLine label="Color" value={repair.color} /> : null}
            <InfoLine label="Estado" value={repair.estado} />
          </Card>
        </div>

        <Card title="Descripción del Servicio" style={{ marginBottom: "5mm" }}>
          <div style={{ fontSize: "9.5pt", color: "#0f172a" }}>{repair.falla_reportada}</div>
          {repair.notas_internas ? (
            <div style={{ marginTop: "4px", fontSize: "8.5pt", color: "#64748b" }}>
              <span style={{ fontWeight: 600 }}>Nota: </span>
              {repair.notas_internas}
            </div>
          ) : null}
        </Card>

        {repair.gastos.length > 0 ? (
          <div style={{ marginBottom: "5mm" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", background: "#f1f5f9", borderRadius: "8px 8px 0 0", padding: "6px 10px", fontSize: "7.5pt", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              <span>Descripción</span>
              <span>Importe</span>
            </div>
            {repair.gastos.map((g, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "5px 10px", borderBottom: "1px solid #f1f5f9", fontSize: "9pt", color: "#0f172a", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <span>{g.descripcion}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(g.costo)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "5mm" }}>
          <div style={{ minWidth: "180px" }}>
            <FinRow label="Presupuesto" value={fmt(presupuesto)} />
            {anticipo > 0 ? <FinRow label="Anticipo pagado" value={fmt(anticipo)} /> : null}
            {totalGastos > 0 ? <FinRow label="Refacciones / M.O." value={fmt(totalGastos)} /> : null}
            <div style={{ borderTop: "1.5px solid #e2e8f0", marginTop: "3px", paddingTop: "3px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5pt", fontWeight: 700, color: "#2563eb", fontStyle: "italic" }}>
                <span>Saldo pendiente</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(saldo)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <QRCodeSVG value={trackingUrl} size={100} />
            <div style={{ fontSize: "7pt", color: "#94a3b8" }}>Rastrear estado</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16mm" }}>
            <SigBlock label="Firma técnico responsable" />
            <SigBlock label="Firma cliente / Conformidad" />
          </div>
        </div>

        {terminosGarantia ? (
          <div style={{ marginTop: "5mm", padding: "6px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "7pt", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "3px" }}>
              Términos de Garantía
            </div>
            <div style={{ fontSize: "7.5pt", color: "#64748b" }}>{terminosGarantia}</div>
          </div>
        ) : null}
      </div>
    )
  }
)

TicketDocumentoTemplate.displayName = "TicketDocumentoTemplate"
export { TicketDocumentoTemplate }

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "10px 12px", border: "1px solid #e2e8f0", ...style }}>
      <div style={{ fontSize: "7pt", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "2px", fontSize: "8.5pt" }}>
      <span style={{ color: "#64748b", minWidth: "64px", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "#0f172a", fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "8.5pt", color: "#475569", marginBottom: "2px" }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}

function SigBlock({ label }: { label: string }) {
  return (
    <div>
      <div style={{ borderBottom: "1.5px solid #94a3b8", height: "28px", marginBottom: "4px" }} />
      <div style={{ fontSize: "7.5pt", color: "#64748b", textAlign: "center" }}>{label}</div>
    </div>
  )
}
