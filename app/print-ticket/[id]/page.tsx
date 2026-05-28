"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { ReceiptTicket, type ReceiptData } from "@/components/dashboard/receipt-ticket"
import { getRepairByFolio } from "@/lib/actions/repairs-prisma"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { getServiciosReparacion } from "@/lib/actions/servicios-prisma"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import { toast } from "@/hooks/use-toast"

const isTauriDesktop = async () => false
const printEscposImage = async (..._args: unknown[]) => {}
const domToPngBase64 = async (..._args: unknown[]) => ""

interface BusinessSettings {
  name: string
  phone: string
  logoUrl: string | null
  terminosGarantia: string
  mensajeDespedida: string
}

export default function PrintTicketDynamicPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ReceiptData | null>(null)
  const [business, setBusiness] = useState<BusinessSettings | null>(null)
  const [servicios, setServicios] = useState<{ nombre: string; precio: number; cantidad: number }[]>([])
  const [showHealthCheckFuncional, setShowHealthCheckFuncional] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      try {
        const [repResult, settingsResult] = await Promise.all([
          getRepairByFolio(decodeURIComponent(id)),
          getTallerSettings(),
        ])

        const svcResult = repResult.data?.id
          ? await getServiciosReparacion(repResult.data.id)
          : { data: [], error: null }

        if (repResult.error || !repResult.data) {
          setLoadError(repResult.error ?? "Reparacion no encontrada.")
          return
        }

        const rep = repResult.data
        const cfg = settingsResult.settings

        const terminosRep = cfg?.terminos_garantia ?? ""

        setData({
          folio: rep.folio,
          customerName: rep.clienteName,
          customerPhone: rep.clientePhone,
          deviceModel: rep.deviceModel,
          deviceBrand: rep.deviceBrand,
          tipo_equipo: rep.tipo_equipo ?? undefined,
          imei: rep.imei ?? undefined,
          color: rep.color ?? undefined,
          reportedFault: rep.falla ?? "",
          estimatedPrice: rep.estimatedPrice != null ? String(rep.estimatedPrice) : undefined,
          deposit: rep.anticipo != null ? String(rep.anticipo) : undefined,
          date: rep.createdAtRaw ?? "",
          repairId: rep.id,
          checklistIngreso: rep.checklistIngreso ?? undefined,
        })

        setServicios(
          (svcResult.data ?? []).map((s) => ({
            nombre: s.nombre_snapshot,
            precio: s.precio_snapshot,
            cantidad: s.cantidad,
          }))
        )

        setShowHealthCheckFuncional(rep.checklistIngreso != null)

        setBusiness({
          name: cfg?.nombre_taller || "Mi Taller",
          phone: cfg?.telefono || "",
          logoUrl: cfg?.logo_url ?? null,
          terminosGarantia: terminosRep,
          mensajeDespedida: cfg?.mensaje_despedida || "",
        })
      } catch (err) {
        console.error("[print-ticket/[id]] error:", err)
        setLoadError("Error al cargar el ticket. Cierra esta ventana e intenta de nuevo.")
      }
    }

    void load()
  }, [id])

  useEffect(() => {
    if (!data || !business) return

    const runPrint = async () => {
      if (await isTauriDesktop()) {
        try {
          const { settings } = await getTallerSettings()
          const printerName = settings?.impresora_ticket?.trim()
          if (!printerName) {
            toast({
              title: "Impresora no configurada",
              description: "Ve a Configuracion > Hardware y selecciona la impresora de tickets.",
              variant: "destructive",
            })
            return
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 300))
          if (ticketRef.current) {
            const base64 = await domToPngBase64(ticketRef.current, { pixelRatio: 2 })
            await printEscposImage(printerName, base64)
            toast({ title: "Ticket enviado a impresora" })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al imprimir"
          toast({ title: "Error de impresion", description: msg, variant: "destructive" })
        }
        return
      }

      document.body.classList.add("print-ticket-mode")
      const style = document.createElement("style")
      style.id = "print-ticket-page-style"
      style.textContent = `@page { size: 80mm auto; margin: 0; } @media print { body { margin: 0 !important; padding: 0 !important; } }`
      document.head.appendChild(style)
      document.documentElement.style.setProperty("--ticket-width", "80mm")
      window.setTimeout(() => window.print(), 500)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-ticket-page-style")?.remove()
    }
  }, [data, business])

  if (loadError) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#c00000", fontSize: "14px" }}>
        <strong>Error:</strong> {loadError}
      </div>
    )
  }

  if (!data || !business) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#555", fontSize: "13px" }}>
        Cargando ticket...
      </div>
    )
  }

  return (
    <div ref={ticketRef} className="print-ticket-only flex items-center justify-center bg-white p-4">
      <ReceiptTicket
        data={data}
        businessName={business.name}
        businessPhone={business.phone}
        terminosGarantia={business.terminosGarantia}
        mensajeDespedida={business.mensajeDespedida}
        logoUrl={business.logoUrl || undefined}
        showHealthCheckFuncional={showHealthCheckFuncional}
        servicios={servicios}
      />
    </div>
  )
}
