"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { ReceiptTicket, type ReceiptData } from "@/components/dashboard/receipt-ticket"
import { getRepairTicketPrintData } from "@/lib/actions/print-formatter-prisma"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import { toast } from "@/hooks/use-toast"

const isTauriDesktop = async () => false
const printEscposImage = async (..._args: unknown[]) => {}
const domToPngBase64 = async (..._args: unknown[]) => ""

export default function PrintTicketDynamicPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ReceiptData | null>(null)
  const [business, setBusiness] = useState<{
    name: string
    phone: string
    logoUrl: string | null
    terminosGarantia: string
    mensajeDespedida: string
  } | null>(null)
  const [servicios, setServicios] = useState<{ nombre: string; precio: number; cantidad: number }[]>([])
  const [showHealthCheckFuncional, setShowHealthCheckFuncional] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      try {
        const result = await getRepairTicketPrintData(decodeURIComponent(id))

        if (result.error || !result.data) {
          setLoadError(result.error ?? "Reparacion no encontrada.")
          return
        }

        const { repair, business: biz, servicios: svcs, showHealthCheckFuncional: showHc } = result.data

        setData({
          folio: repair.folio,
          customerName: repair.customerName,
          customerPhone: repair.customerPhone,
          deviceModel: repair.deviceModel ?? "N/A",
          deviceBrand: repair.deviceBrand ?? "N/A",
          tipo_equipo: repair.tipoEquipo ?? undefined,
          imei: repair.imei ?? undefined,
          color: repair.color ?? undefined,
          reportedFault: repair.reportedFault ?? "",
          estimatedPrice: repair.estimatedPrice != null ? String(repair.estimatedPrice) : undefined,
          deposit: repair.deposit != null ? String(repair.deposit) : undefined,
          date: repair.createdAt ?? "",
          repairId: repair.id,
          checklistIngreso: repair.checklistIngreso,
        })

        setServicios(svcs)
        setShowHealthCheckFuncional(showHc)
        setBusiness({
          name: biz.name,
          phone: biz.phone,
          logoUrl: biz.logoUrl,
          terminosGarantia: biz.terminosGarantia,
          mensajeDespedida: biz.mensajeDespedida,
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
          const prnt = await import("@/lib/actions/print-formatter-prisma")
          const result = await prnt.getRepairTicketPrintData(decodeURIComponent(id!))
          if (!result.data) {
            toast({
              title: "Error",
              description: "No se pudieron cargar los datos del ticket.",
              variant: "destructive",
            })
            return
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 300))
          if (ticketRef.current) {
            const base64 = await domToPngBase64(ticketRef.current, { pixelRatio: 2 })
            await printEscposImage(result.data.business.name, base64)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div ref={ticketRef} className="print-ticket-only bg-white">
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
