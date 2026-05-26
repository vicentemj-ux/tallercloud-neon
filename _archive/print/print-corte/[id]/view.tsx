"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { TicketCorteTemplate } from "@/components/print-templates"
import type { CortePrintData } from "@/lib/actions/ventas"
import { getCajaConDetalle } from "@/lib/actions/ventas"
import { getTallerSettings } from "@/lib/actions/settings"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import { isTauriAvailable, printTicketRasterDirecto } from "@/lib/tauri/desktop-bridge"
import { toast } from "@/hooks/use-toast"

export default function PrintCorteDynamicPage() {
  const { id } = useParams<{ id: string }>()
  const [corte, setCorte] = useState<CortePrintData | null>(null)
  const [business, setBusiness] = useState<{ name: string; phone: string } | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      const [corteResult, settingsResult] = await Promise.all([
        getCajaConDetalle(decodeURIComponent(id)),
        getTallerSettings(),
      ])

      if (corteResult.error || !corteResult.data) {
        console.error("[print-corte/[id]]", corteResult.error)
        return
      }

      const cfg = settingsResult.settings
      setCorte(corteResult.data)
      setBusiness({
        name: cfg?.nombre_taller || "Mi Taller",
        phone: cfg?.telefono || "",
      })
    }

    void load()
  }, [id])

  useEffect(() => {
    if (!corte || !business) return

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
            toast({ title: "Corte enviado a impresora" })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Error al imprimir"
          toast({ title: "Error de impresion", description: msg, variant: "destructive" })
        }
        return
      }

      // Fallback web
      document.body.classList.add("print-ticket-mode")
      const style = document.createElement("style")
      style.id = "print-corte-page-style"
      style.textContent = `@page { size: 80mm auto; margin: 0; }`
      document.head.appendChild(style)
      window.setTimeout(() => window.print(), 500)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-corte-page-style")?.remove()
    }
  }, [corte, business])

  if (!corte || !business) return null

  // Misma lógica que CorteCajaSummary para garantizar valores idénticos en pantalla y papel.
  // efectivoEsperado = fondo inicial + PDV efectivo + abonos reparación - gastos.
  // efectivoContado  = lo que el cajero físicamente contó (monto_cierre); si no existe, saldo_final.
  const efectivoEsperado = corte.monto_inicial + corte.total_efectivo + corte.total_abonos_efectivo - corte.total_gastos
  const efectivoContado =
    corte.monto_cierre != null && Number.isFinite(corte.monto_cierre)
      ? corte.monto_cierre
      : corte.saldo_final
  const diferencia = efectivoContado - efectivoEsperado

  return (
    <div ref={ticketRef} className="print-ticket-only flex items-center justify-center bg-white p-4">
      <TicketCorteTemplate
        businessName={business.name}
        numeroCorte={corte.numero_corte}
        fechaApertura={corte.fecha_apertura}
        fechaCierre={corte.fecha_cierre}
        montoInicial={corte.monto_inicial}
        ventasRegistradas={corte.total_ventas}
        totalEfectivo={corte.total_efectivo}
        totalTarjeta={corte.total_tarjeta}
        totalTransferencia={corte.total_transferencia}
        totalAbonosEfectivo={corte.total_abonos_efectivo}
        totalAbonosTarjeta={corte.total_abonos_tarjeta}
        totalAbonosTransferencia={corte.total_abonos_transferencia}
        efectivoEsperado={efectivoEsperado}
        efectivoContado={efectivoContado}
        diferencia={diferencia}
        cobrosRep={corte.cobrosRep}
        totalCobrosRep={corte.total_abonos}
        gastos={corte.listaGastos}
        totalGastos={corte.total_gastos}
        ventas={corte.ventas}
        totalVentasPdv={corte.totalVentasPdv}
        notaCierre={corte.nota_cierre}
      />
    </div>
  )
}
