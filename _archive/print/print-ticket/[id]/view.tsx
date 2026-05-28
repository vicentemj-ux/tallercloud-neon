"use client"

import { useEffect, useState, useRef } from "react"
import { LabelRepairTemplate, type LabelRepairTemplateData } from "@/components/print-templates/LabelRepairTemplate"
import { ProductSaleLabelTemplate, type ProductSaleLabelTemplateData } from "@/components/print-templates/ProductSaleLabelTemplate"
import { VentaLabel, type VentaLabelData } from "@/components/dashboard/venta-label"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"

type AnyLabelData = LabelRepairTemplateData | ProductSaleLabelTemplateData | VentaLabelData

/**
 * Impresion de etiquetas (localStorage) sin layout del dashboard.
 * Ruta: /print-label
 *
 * Dispatch por campo "kind":
 *   "venta-label"        → VentaLabel (50mm×25mm)
 *   "product-sale-label" → ProductSaleLabelTemplate (80mm auto)
 *   undefined/otro       → LabelRepairTemplate (50mm×25mm landscape) ← fuente unica para tickets de reparacion
 */
export default function PrintLabelStandalonePage() {
  const [data, setData] = useState<AnyLabelData | null>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    const stored = window.localStorage.getItem("printLabel")
    if (!stored) {
      window.close()
      return
    }

    const parsed = JSON.parse(stored) as AnyLabelData
    setData(parsed)
    document.body.classList.add("print-label-mode")

    const kind = (parsed as VentaLabelData | ProductSaleLabelTemplateData).kind

    // Etiqueta estandar 2×1" (50.8mm × 25.4mm) para todos los tipos
    const style = document.createElement("style")
    style.id = "label-page-style"
    style.textContent = `
      @page { size: 50.8mm 25.4mm; margin: 0; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; }
      }
    `
    document.head.appendChild(style)

    const id = window.setTimeout(() => {
      window.print()
    }, 500)

    return () => {
      window.clearTimeout(id)
      document.body.classList.remove("print-label-mode")
      document.getElementById("label-page-style")?.remove()
    }
  }, [])

  if (!data) return null

  const kind = (data as VentaLabelData | ProductSaleLabelTemplateData).kind

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 text-black print:min-h-0 print:bg-white print:p-0">
      {kind === "venta-label" ? (
        <VentaLabel ref={labelRef} data={data as VentaLabelData} />
      ) : kind === "product-sale-label" ? (
        <ProductSaleLabelTemplate ref={labelRef} data={data as ProductSaleLabelTemplateData} />
      ) : (
        <LabelRepairTemplate ref={labelRef} data={data as LabelRepairTemplateData} />
      )}
    </div>
  )
}
