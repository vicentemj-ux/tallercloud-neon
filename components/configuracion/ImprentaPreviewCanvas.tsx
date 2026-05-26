"use client"

import { useMemo } from "react"
import type { DocumentType } from "@/lib/print/demo-data"
import { getDemoData } from "@/lib/print/demo-data"
import type { DocConfig } from "./imprenta-types"
import type { TallerSettings } from "@/lib/actions/settings-prisma"
import { TicketRecepcionTemplate } from "@/components/print-templates/TicketRecepcionTemplate"
import { TicketVentaTemplate } from "@/components/print-templates/TicketVentaTemplate"
import { LabelRepairTemplate } from "@/components/print-templates/LabelRepairTemplate"
import { ProductSaleLabelTemplate } from "@/components/print-templates/ProductSaleLabelTemplate"
import { TicketCompraTemplate } from "@/components/print-templates/TicketCompraTemplate"

interface ImprentaPreviewCanvasProps {
  docType: DocumentType
  config: DocConfig
  settings: TallerSettings | null
}

export function ImprentaPreviewCanvas({ docType, config, settings }: ImprentaPreviewCanvasProps) {
  const demo = useMemo(() => getDemoData(docType), [docType])

  const isLabel = docType === "etiqueta" || docType === "barras"
  const isA4 = config.formato === "A4"

  const paperWidth = isA4 ? "210mm" : isLabel ? "auto" : "72mm"
  const paperMinHeight = isA4 ? "297mm" : "auto"
  const scale = isLabel ? "scale(2.8)" : !isA4 ? "scale(1.35)" : "scale(0.85)"

  const businessName = settings?.nombre_taller || "Mi Taller"
  const businessPhone = settings?.telefono || ""
  const businessAddress = settings?.direccion || ""
  const logoUrl = settings?.logo_url || null

  const redesSociales = useMemo(
    () => ({
      facebook: settings?.facebook || null,
      instagram: settings?.instagram || null,
      tiktok: settings?.tiktok || null,
      whatsapp: settings?.whatsapp || null,
    }),
    [settings]
  )

  return (
    <div className="relative h-full min-h-[560px] rounded-xl overflow-hidden bg-slate-900 flex flex-col">
      {/* Dot pattern background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, #ffffff 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Vista previa en tiempo real
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          Live Canvas
        </span>
      </div>

      {/* Canvas content */}
      <div className="relative z-10 flex-1 overflow-auto p-6 flex items-start justify-center">
        <div
          className="bg-white shadow-2xl"
          style={{
            width: paperWidth,
            minHeight: paperMinHeight,
            maxWidth: "100%",
            transform: scale,
            transformOrigin: "top center",
          }}
        >
          <PreviewContent
            docType={docType}
            config={config}
            demo={demo}
            businessName={businessName}
            businessPhone={businessPhone}
            businessAddress={businessAddress}
            logoUrl={logoUrl}
            redesSociales={redesSociales}
          />
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className="relative z-10 px-4 py-2 border-t border-slate-700/60">
        <p className="text-[10px] text-slate-500 text-center">
          La vista previa refleja exactamente el template con los datos de tu taller.
          El resultado impreso puede variar según la impresora y el navegador.
        </p>
      </div>
    </div>
  )
}

function PreviewContent({
  docType,
  config,
  demo,
  businessName,
  businessPhone,
  businessAddress,
  logoUrl,
  redesSociales,
}: {
  docType: DocumentType
  config: DocConfig
  demo: unknown
  businessName: string
  businessPhone: string
  businessAddress: string
  logoUrl: string | null
  redesSociales: {
    facebook: string | null
    instagram: string | null
    tiktok: string | null
    whatsapp: string | null
  }
}) {
  if (docType === "reparacion") {
    const d = demo as Parameters<typeof TicketRecepcionTemplate>[0]["data"]
    return (
      <TicketRecepcionTemplate
        data={d}
        businessName={businessName}
        businessPhone={businessPhone}
        terminosGarantia={config.terminos}
        mensajeDespedida={config.despedida}
        mostrarLogo={config.mostrarLogo}
        mostrarTecnico={config.mostrarTecnico}
        mostrarPrecios={config.mostrarPrecios}
        mostrarRedesSociales={config.mostrarRedesSociales}
        logoUrl={logoUrl ?? undefined}
        tecnicoNombre="Ing. Roberto Díaz"
        redesSociales={redesSociales}
      />
    )
  }

  if (docType === "venta") {
    const v = demo as Parameters<typeof TicketVentaTemplate>[0]["venta"]
    return (
      <TicketVentaTemplate
        venta={v}
        tallerNombre={businessName}
        tallerTelefono={businessPhone}
        terminosGarantia={config.terminos}
        mensajeDespedida={config.despedida}
        mostrarLogo={config.mostrarLogo}
        mostrarPrecios={config.mostrarPrecios}
        mostrarRedesSociales={config.mostrarRedesSociales}
        logoUrl={logoUrl}
        redesSociales={redesSociales}
      />
    )
  }

  if (docType === "compra") {
    const c = demo as Parameters<typeof TicketCompraTemplate>[0]["data"]
    return (
      <TicketCompraTemplate
        data={c}
        businessName={businessName}
        businessPhone={businessPhone}
        businessAddress={businessAddress}
        logoUrl={logoUrl}
        declaracionJurat={config.declaracionJurat}
        mensajeDespedida={config.despedida}
        mostrarLogo={config.mostrarLogo}
      />
    )
  }

  if (docType === "etiqueta") {
    const l = demo as Parameters<typeof LabelRepairTemplate>[0]["data"]
    return (
      <LabelRepairTemplate
        data={{ ...l, tallerName: businessName }}
        mostrarPrecios={config.mostrarPrecios}
      />
    )
  }

  if (docType === "barras") {
    const b = demo as Parameters<typeof ProductSaleLabelTemplate>[0]["data"]
    return (
      <ProductSaleLabelTemplate
        data={{ ...b, shopName: businessName }}
        mostrarPrecios={config.mostrarPrecios}
      />
    )
  }

  return null
}
