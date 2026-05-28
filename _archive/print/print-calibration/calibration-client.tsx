"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ReceiptTicket, type ReceiptData } from "@/components/dashboard/receipt-ticket"
import { LabelRepairTemplate, type LabelRepairTemplateData } from "@/components/print-templates/LabelRepairTemplate"
import { DocumentoPro } from "@/components/dashboard/documento-pro"
import type { RepairPrintData } from "@/lib/actions/repairs"
import { getTallerSettings } from "@/lib/actions/settings"
import { TALLER_CLOUD_CALIBRATION_LOGO } from "@/lib/print-calibration-brand"
import {
  isTauriAvailable,
  printTicketRasterDirecto,
  printLabelRasterDirecto,
} from "@/lib/tauri/desktop-bridge"
import { toast } from "@/hooks/use-toast"

const MOCK_RECEIPT: ReceiptData = {
  folio: "TC-CAL-001",
  customerName: "Ing. Alejandro Valenzuela",
  customerPhone: "6681234567",
  deviceBrand: "Apple",
  deviceModel: "iPhone 15 Pro Max Titanium",
  tipo_equipo: "Smartphone",
  imei: "359876543210987",
  color: "Titanio natural",
  reportedFault: "Display OLED: lineas verticales tras impacto. Bateria 87% salud.",
  estimatedPrice: "4500",
  deposit: "500",
  date: new Date().toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  repairId: "00000000-0000-4000-8000-0000000000c1",
}

const MOCK_LABEL: LabelRepairTemplateData = {
  folio: "TC-CAL-001",
  deviceName: "iPhone 15 Pro Max Titanium",
  customerName: "Ing. Alejandro Valenzuela",
  customerPhone: "6681234567",
  reportedFault: "Display OLED: lineas verticales tras impacto.",
  estimatedPrice: "4500",
  accessCode: "PIN: 1234",
}

const MOCK_DOCUMENT_REPAIR: RepairPrintData = {
  id: "00000000-0000-4000-8000-0000000000c1",
  folio: "TC-CAL-001",
  estado: "Diagnostico",
  fecha_creacion: new Date().toISOString(),
  cliente_nombre: "Ing. Alejandro Valenzuela",
  cliente_telefono: "6681234567",
  tecnico: "Calibracion TC",
  dispositivo_marca: "Apple",
  dispositivo_modelo: "iPhone 15 Pro Max Titanium",
  tipo_equipo: "Smartphone",
  imei_serie: "359876543210987",
  color: "Titanio natural",
  falla_reportada:
    "Display OLED: lineas verticales tras impacto. Cliente solicita cambio de modulo y revision de bateria.",
  precio_estimado: 4500,
  anticipo: 500,
  costo_total: 4200,
  restante: 4000,
  gastos: [
    { descripcion: "Modulo OLED OEM", costo: 2800 },
    { descripcion: "Mano de obra diagnostico", costo: 350 },
  ],
}

export default function CalibrationClient() {
  const searchParams = useSearchParams()
  const job = searchParams.get("job") as "ticket" | "label" | "carta" | null
  const ticketSize = "80mm"
  const [shopName, setShopName] = useState("TallerCloud")
  const [shopPhone, setShopPhone] = useState("")
  const [terminos, setTerminos] = useState("")
  const [mensajeDespedida, setMensajeDespedida] = useState("")
  const ticketRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void getTallerSettings()
      .then(({ settings }) => {
        if (settings?.nombre_taller) setShopName(settings.nombre_taller)
        if (settings?.telefono) setShopPhone(settings.telefono)
        if (settings?.terminos_garantia) setTerminos(settings.terminos_garantia)
        if (settings?.mensaje_despedida) setMensajeDespedida(settings.mensaje_despedida)
      })
      .catch(() => {})
  }, [])

  const trackingUrl = useMemo(() => {
    const base =
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")) ||
      "https://tallercloud.net"
    return `${base}/track/${MOCK_RECEIPT.repairId}`
  }, [])

  useEffect(() => {
    if (job !== "ticket") return

    const runPrint = async () => {
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
            toast({ title: "Ticket de calibracion enviado" })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al imprimir"
          toast({ title: "Error de impresion", description: msg, variant: "destructive" })
        }
        return
      }

      // Fallback web
      document.body.classList.add("print-ticket-mode")
      const pageStyle = document.createElement("style")
      pageStyle.id = "print-calibration-ticket"
      pageStyle.textContent = `@page { size: ${ticketSize} auto; margin: 0; }`
      document.head.appendChild(pageStyle)
      window.setTimeout(() => window.print(), 450)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-calibration-ticket")?.remove()
    }
  }, [job, ticketSize])

  useEffect(() => {
    if (job !== "label") return

    const runPrint = async () => {
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
            toast({ title: "Etiqueta de calibracion enviada" })
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
      style.id = "print-calibration-label"
      style.textContent = `
        @media print {
          @page { size: 50mm 25mm !important; margin: 0 !important; }
          body { margin: 0 !important; padding: 0 !important; }
        }
      `
      document.head.appendChild(style)
      window.setTimeout(() => window.print(), 450)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-label-mode")
      document.getElementById("print-calibration-label")?.remove()
    }
  }, [job])

  useEffect(() => {
    if (job !== "carta") return
    const style = document.createElement("style")
    style.id = "print-calibration-carta"
    style.textContent = `@page { size: Letter; margin: 0; } body { margin: 0; }`
    document.head.appendChild(style)
    const t = window.setTimeout(() => window.print(), 450)
    return () => {
      window.clearTimeout(t)
      document.getElementById("print-calibration-carta")?.remove()
    }
  }, [job])

  if (!job || !["ticket", "label", "carta"].includes(job)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white p-8 text-center text-sm text-slate-600">
        <p>Esta vista es solo para calibracion de impresoras.</p>
        <p className="text-xs text-slate-400">
          Usa los botones en Configuracion → Impresoras y hardware → Calibracion de impresion.
        </p>
      </div>
    )
  }

  if (job === "ticket") {
    return (
      <div ref={ticketRef} className="print-ticket-only flex items-center justify-center bg-white p-4">
        <ReceiptTicket
          data={MOCK_RECEIPT}
          businessName={shopName}
          businessPhone={shopPhone}
          terminosGarantia={terminos}
          mensajeDespedida={mensajeDespedida}
          ticketSize={ticketSize}
          logoUrl={TALLER_CLOUD_CALIBRATION_LOGO}
        />
      </div>
    )
  }

  if (job === "label") {
    return (
      <div ref={labelRef} className="print-label-only flex min-h-screen items-center justify-center bg-white p-4 text-black">
        <LabelRepairTemplate data={MOCK_LABEL} />
      </div>
    )
  }

  return (
    <div className="bg-white">
      <DocumentoPro
        repair={MOCK_DOCUMENT_REPAIR}
        businessName="TallerCloud"
        businessPhone={shopPhone || "668 000 0000"}
        businessEmail="contacto@tallercloud.net"
        businessAddress="Calibracion de impresion · Mexico"
        logoUrl={TALLER_CLOUD_CALIBRATION_LOGO}
        trackingUrl={trackingUrl}
        terminosGarantia={terminos || "Poliza de demostracion — no valida como servicio real."}
      />
    </div>
  )
}
