"use client"

import { useEffect, useState, useRef } from "react"
import { ReceiptTicket, type ReceiptData } from "@/components/dashboard/receipt-ticket"
import { getTallerSettings } from "@/lib/actions/settings"
import { getAjustesTallerFlujoPro } from "@/lib/actions/flujo-pro"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"

interface BusinessPrintSettings {
  name: string
  phone: string
  logoUrl: string | null
  terminosGarantia: string
  mensajeDespedida: string
}

export default function PrintTicketPage() {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [business, setBusiness] = useState<BusinessPrintSettings | null>(null)
  const [showHealthCheckFuncional, setShowHealthCheckFuncional] = useState(false)
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    const stored = window.localStorage.getItem("printTicket")
    if (!stored) {
      window.close()
      return
    }

    setData(JSON.parse(stored))

    const loadSettings = async () => {
      try {
        const [{ settings: cfg }, { ajustes }] = await Promise.all([
          getTallerSettings(),
          getAjustesTallerFlujoPro(),
        ])

        const impConfig = cfg?.impresion_config as any
        const terminosRep = impConfig?.reparacion?.terminos ?? cfg?.terminos_garantia ?? ""

        setBusiness({
          name: cfg?.nombre_taller || "Mi Taller",
          phone: cfg?.telefono || "",
          logoUrl: cfg?.logo_url ?? null,
          terminosGarantia: terminosRep,
          mensajeDespedida: cfg?.mensaje_despedida || "",
        })
        // Health Check PRO solo si el taller tiene el procedimiento habilitado
        setShowHealthCheckFuncional(
          ajustes.health_check_required && (JSON.parse(stored) as ReceiptData).checklistIngreso != null
        )
        document.documentElement.style.setProperty("--ticket-width", "80mm")
      } catch {
        setBusiness({ name: "Mi Taller", phone: "", logoUrl: null, terminosGarantia: "", mensajeDespedida: "" })
        document.documentElement.style.setProperty("--ticket-width", "80mm")
      }
    }

    loadSettings()
  }, [])

  useEffect(() => {
    if (!data || !business) return

    document.body.classList.add("print-ticket-mode")

    const pageStyle = document.createElement("style")
    pageStyle.id = "print-ticket-page-style"
    pageStyle.textContent = `@page { size: 80mm auto; margin: 0; } @media print { body { margin: 0 !important; padding: 0 !important; } }`
    document.head.appendChild(pageStyle)

    const id = window.setTimeout(() => {
      window.print()
    }, 500)

    return () => {
      window.clearTimeout(id)
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-ticket-page-style")?.remove()
    }
  }, [data, business])

  if (!data || !business) return null

  return (
    <div className="print-ticket-only flex items-center justify-center bg-white p-4">
      <ReceiptTicket
        ref={ticketRef}
        data={data}
        businessName={business.name}
        businessPhone={business.phone}
        terminosGarantia={business.terminosGarantia}
        mensajeDespedida={business.mensajeDespedida}
        logoUrl={business.logoUrl || undefined}
        showHealthCheckFuncional={showHealthCheckFuncional}
      />
    </div>
  )
}
