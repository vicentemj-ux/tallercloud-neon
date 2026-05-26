"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { VentaLabel, type VentaLabelData } from "@/components/dashboard/venta-label"
import { LabelRepairTemplate, type LabelRepairTemplateData } from "@/components/print-templates/LabelRepairTemplate"
import { getTallerSettings } from "@/lib/actions/settings"
import { getRepairLabelData } from "@/lib/actions/repairs"
import { getVentaLabelData } from "@/lib/actions/ventas"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import { isTauriAvailable, printLabelRasterDirecto } from "@/lib/tauri/desktop-bridge"
import { toast } from "@/hooks/use-toast"

type AnyLabelData = LabelRepairTemplateData | VentaLabelData

export default function PrintLabelDynamicPage() {
  const { id }          = useParams<{ id: string }>()
  const searchParams    = useSearchParams()
  const kind            = searchParams.get("kind") ?? "service-label"
  const [data, setData] = useState<AnyLabelData | null>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      if (kind === "venta-label") {
        const result = await getVentaLabelData(decodeURIComponent(id))
        if (result.data) {
          const v = result.data
          setData({
            kind: "venta-label",
            id: v.id,
            folio: v.folio ?? undefined,
            clienteNombre: v.cliente_nombre,
            items: v.items,
            total: v.total,
            fecha: v.created_at,
          } as VentaLabelData)
        }
      } else {
        // repair-label y service-label → ambos usan LabelRepairTemplate (80mm)
        const result = await getRepairLabelData(decodeURIComponent(id))
        if (result.data) {
          const rep = result.data

          // Nombre del taller desde settings
          const { settings } = await getTallerSettings()
          if (settings?.nombre_taller) {
            try {
              document.cookie = `tallerName=${encodeURIComponent(settings.nombre_taller)}; path=/`
            } catch {}
          }

          // Acceso / seguridad
          const st = (rep.security_type ?? "").toLowerCase()
          const sv = (rep.security_value ?? rep.pin_contrasena ?? "").trim()
          let accessCode: string | null = null
          if (sv && st && st !== "none") {
            if (st === "pattern")  accessCode = `PATRON: ${sv}`
            else if (st === "pin") accessCode = `PIN: ${sv}`
            else                   accessCode = `PASS: ${sv}`
          }

          // Extras / accesorios
          let extras: string | null = null
          const ci = rep.checklist_ingreso as Record<string, unknown> | null
          const obs = (ci?.observacionesEsteticas as string | null)?.trim()
          if (obs) extras = obs

          setData({
            folio: rep.folio,
            deviceName: `${rep.dispositivo_marca} ${rep.dispositivo_modelo}`.trim() || undefined,
            customerName: rep.cliente_nombre,
            customerPhone: rep.cliente_telefono,
            reportedFault: rep.falla_reportada,
            estimatedPrice: rep.precio_estimado != null ? String(rep.precio_estimado) : undefined,
            accessCode,
            extras,
            tallerName: settings?.nombre_taller,
          } as LabelRepairTemplateData)
        }
      }
    }

    void load()
  }, [id, kind])

  useEffect(() => {
    if (!data) return

    const runPrint = async () => {
      // Desktop direct print (Tauri) — raster de alta calidad en impresora de etiquetas
      if (await isTauriAvailable()) {
        try {
          const { settings } = await getTallerSettings()
          const printerName = settings?.impresora_etiqueta?.trim()
          if (!printerName) {
            toast({
              title: "Impresora de etiquetas no configurada",
              description: "Ve a Configuracion > Hardware y selecciona la impresora de etiquetas.",
              variant: "destructive",
            })
            return
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 300))
          if (labelRef.current) {
            await printLabelRasterDirecto(printerName, labelRef.current)
            toast({ title: "Etiqueta enviada a impresora" })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al imprimir"
          toast({ title: "Error de impresion", description: msg, variant: "destructive" })
        }
        return
      }

      // Fallback web
      document.body.classList.add("print-label-mode")
      const style = document.createElement("style")
      style.id = "label-page-style"
      style.textContent = `@page { size: 50.8mm 25.4mm; margin: 0; } @media print { @page { size: 50.8mm 25.4mm; margin: 0; } body { margin: 0 !important; padding: 0 !important; } }`
      document.head.appendChild(style)
      setTimeout(() => window.print(), 300)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-label-mode")
      document.getElementById("label-page-style")?.remove()
    }
  }, [data, kind])

  if (!data) return null

  const dataKind = (data as VentaLabelData).kind

  return (
    <div ref={labelRef} className="print-label-only flex min-h-screen items-center justify-center bg-white p-4 text-black">
      {dataKind === "venta-label" ? (
        <VentaLabel data={data as VentaLabelData} />
      ) : (
        <LabelRepairTemplate data={data as LabelRepairTemplateData} />
      )}
    </div>
  )
}
