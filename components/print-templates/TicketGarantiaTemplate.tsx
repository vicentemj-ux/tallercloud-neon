"use client"

import { forwardRef } from "react"
import type { RepairPrintData } from "@/lib/actions/repairs"

interface TicketGarantiaTemplateProps {
  repair: RepairPrintData
  businessName: string
  businessPhone?: string
  businessEmail?: string
  businessAddress?: string
  logoUrl?: string | null
  fechaVencimiento: string
  clausulas?: string[]
}

const DEFAULT_CLAUSULAS = [
  "La garantia cubre exclusivamente las partes y mano de obra descritas en este documento.",
  "La garantia queda sin efecto si el equipo presenta dano por liquidos, golpes o manipulacion no autorizada posterior a la reparacion.",
  "No se cubre desgaste natural ni danos ocasionados por uso inadecuado del equipo.",
  "El cliente debe presentar este documento para hacer valida la garantia.",
  "La garantia no es transferible y aplica unicamente al equipo registrado.",
  "En caso de reclamacion, el tiempo de diagnostico puede ser de hasta 3 dias habiles.",
  "El establecimiento se reserva el derecho de reparar, reemplazar o reembolsar el importe pagado.",
  "Esta poliza no cubre perdida de datos almacenados en el dispositivo.",
]

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })

const TicketGarantiaTemplate = forwardRef<HTMLDivElement, TicketGarantiaTemplateProps>(
  ({ repair, businessName, businessPhone, businessEmail, businessAddress, logoUrl, fechaVencimiento, clausulas = DEFAULT_CLAUSULAS }, ref) => {
    return (
      <div
        ref={ref}
        className="bg-white text-slate-900"
        style={{
          width: "216mm",
          minHeight: "279mm",
          padding: "16mm 18mm",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          fontSize: "10pt",
          lineHeight: 1.5,
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "8mm" }}>
          {logoUrl ? <img src={logoUrl} alt={businessName} style={{ height: "40px", objectFit: "contain", marginBottom: "6px" }} /> : null}
          <div style={{ fontSize: "18pt", fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a", textTransform: "uppercase" }}>{businessName}</div>
          {businessAddress ? <div style={{ fontSize: "8pt", color: "#64748b", marginTop: "2px" }}>{businessAddress}</div> : null}
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", fontSize: "8pt", color: "#64748b", marginTop: "2px" }}>
            {businessPhone ? <span>{businessPhone}</span> : null}
            {businessEmail ? <span>{businessEmail}</span> : null}
          </div>
          <div style={{ fontSize: "13pt", fontWeight: 700, letterSpacing: "0.08em", color: "#475569", marginTop: "8px", textTransform: "uppercase" }}>
            Poliza de Garantia de Servicio
          </div>
          <div style={{ height: "3px", background: "linear-gradient(90deg, #2563eb, #3b82f6)", borderRadius: "2px", margin: "6px auto 0", width: "80px" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "7mm" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: "999px", padding: "5px 16px", fontSize: "9.5pt", fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.02em" }}>
            <span style={{ fontSize: "11pt" }}>✓</span>
            VaLIDA HASTA: {fmtDate(fechaVencimiento)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm", marginBottom: "6mm" }}>
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "7pt", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>Datos del Servicio</div>
            <InfoRow label="Folio" value={repair.folio} />
            <InfoRow label="Entrega" value={fmtDate(repair.fecha_entrega ?? repair.fecha_creacion)} />
            <InfoRow label="Tecnico" value={repair.tecnico ?? "—"} />
            <InfoRow label="Servicio" value={repair.falla_reportada} />
          </div>
          <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "7pt", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px" }}>Cliente / Equipo</div>
            <InfoRow label="Cliente" value={repair.cliente_nombre} />
            <InfoRow label="Telefono" value={repair.cliente_telefono} />
            <InfoRow label="Equipo" value={`${repair.tipo_equipo ? repair.tipo_equipo + " " : ""}${repair.dispositivo_marca} ${repair.dispositivo_modelo}`} />
            {repair.imei_serie ? <InfoRow label="IMEI/Serie" value={repair.imei_serie} /> : null}
            {repair.color ? <InfoRow label="Color" value={repair.color} /> : null}
          </div>
        </div>
        <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 14px", border: "1px solid #e2e8f0", marginBottom: "6mm" }}>
          <div style={{ fontSize: "7pt", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
            Terminos y Condiciones de Garantia
          </div>
          <ol style={{ paddingLeft: "16px", margin: 0 }}>
            {clausulas.map((c, i) => (
              <li key={i} style={{ fontSize: "8pt", color: "#475569", marginBottom: "3px", lineHeight: 1.4 }}>
                {c}
              </li>
            ))}
          </ol>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16mm", marginTop: "auto" }}>
          <SignatureBlock label="Sello y firma del establecimiento" />
          <SignatureBlock label="Firma del cliente / Conformidad" />
        </div>
      </div>
    )
  }
)

TicketGarantiaTemplate.displayName = "TicketGarantiaTemplate"
export { TicketGarantiaTemplate }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "2px", fontSize: "8.5pt" }}>
      <span style={{ color: "#64748b", minWidth: "60px", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "#0f172a", fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div style={{ borderBottom: "1.5px solid #94a3b8", marginBottom: "5px", height: "28px" }} />
      <div style={{ fontSize: "7.5pt", color: "#64748b", textAlign: "center" }}>{label}</div>
    </div>
  )
}
