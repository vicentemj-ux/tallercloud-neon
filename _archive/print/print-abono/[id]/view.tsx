"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AbonoReceipt, type AbonoReceiptData } from "@/components/dashboard/abono-receipt"
import { getAbonoById } from "@/lib/actions/ventas-prisma"
import { getTallerSettings } from "@/lib/actions/settings"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import {
  isTauriAvailable,
  printTicketDirecto,
  printTicketRasterDirecto,
  buildTicketDataFromAbono,
} from "@/lib/tauri/desktop-bridge"
import { toast } from "@/hooks/use-toast"

interface BusinessSettings {
  name: string
  phone: string
  logoUrl: string | null
  direccion?: string
}

export default function PrintAbonoDynamicPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<AbonoReceiptData | null>(null)
  const [business, setBusiness] = useState<BusinessSettings | null>(null)
  const [mensajeDespedida, setMensajeDespedida] = useState<string>("")
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      const [abonoResult, settingsResult] = await Promise.all([
        getAbonoById(decodeURIComponent(id)),
        getTallerSettings(),
      ])

      if (abonoResult.error || !abonoResult.data) {
        console.error("[print-abono/[id]]", abonoResult.error)
        return
      }

      const abono = abonoResult.data
      const cfg = settingsResult.settings
      // Map AbonoPrintData → AbonoReceiptData
      setData({
        folio: abono.folio,
        customerName: abono.clienteNombre,
        customerPhone: abono.clienteTelefono,
        deviceName: abono.dispositivo,
        metodoPago: abono.metodoPago,
        monto: abono.monto,
        totalPagado: abono.totalAbonado,
        presupuesto: abono.presupuesto,
        saldoRestante: abono.saldoRestante,
        date: abono.fecha,
      })

      setBusiness({
        name: cfg?.nombre_taller || "Mi Taller",
        phone: cfg?.telefono || "",
        logoUrl: cfg?.logo_url ?? null,
        direccion: cfg?.direccion?.trim() || undefined,
      })
      setMensajeDespedida(cfg?.mensaje_despedida?.trim() || "")
    }

    void load()
  }, [id])

  useEffect(() => {
    if (!data || !business) return

    const runPrint = async () => {
      // Desktop direct print (Tauri) — raster de alta calidad
      if (await isTauriAvailable()) {
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
            await printTicketRasterDirecto(printerName, ticketRef.current)
          } else {
            const ticketData = buildTicketDataFromAbono(
              {
                folio: data.folio,
                customerName: data.customerName,
                deviceBrand: data.deviceName,
                monto: data.monto,
                metodoPago: data.metodoPago,
                nuevoAnticipo: data.totalPagado,
                presupuesto: data.presupuesto,
                date: data.date,
                direccion: business.direccion,
              },
              business.name,
              business.phone,
              mensajeDespedida || undefined
            )
            await printTicketDirecto(printerName, ticketData)
          }
          toast({ title: "Ticket enviado a impresora" })
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al imprimir"
          toast({ title: "Error de impresion", description: msg, variant: "destructive" })
        }
        return
      }

      // Fallback web
      document.body.classList.add("print-ticket-mode")
      const style = document.createElement("style")
      style.id = "print-abono-page-style"
      style.textContent = `@page { size: 80mm auto; margin: 0; }`
      document.head.appendChild(style)
      window.setTimeout(() => window.print(), 500)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-abono-page-style")?.remove()
    }
  }, [data, business])

  if (!data || !business) return null

  return (
    <div className="print-ticket-only flex items-center justify-center bg-white p-4">
      <AbonoReceipt
        data={data}
        businessName={business.name}
        businessPhone={business.phone}
        logoUrl={business.logoUrl || undefined}
        mensajeDespedida={mensajeDespedida || undefined}
      />
    </div>
  )
}
