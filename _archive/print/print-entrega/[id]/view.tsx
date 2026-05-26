"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { TicketSalidaGarantia, warrantyDaysFromTerminos } from "@/components/dashboard/ticket-salida-garantia"
import { getRepairByFolio, getRepairChangeHistory } from "@/lib/actions/repairs"
import { getTallerSettings } from "@/lib/actions/settings"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"
import {
  isTauriAvailable,
  printTicketDirecto,
  printTicketRasterDirecto,
  buildTicketDataFromEntrega,
} from "@/lib/tauri/desktop-bridge"
import { toast } from "@/hooks/use-toast"

interface BusinessSettings {
  name: string
  phone: string
  logoUrl: string | null
  direccion?: string
  terminosGarantia: string
  mensajeDespedida: string
}

export default function PrintEntregaDynamicPage() {
  const { id } = useParams<{ id: string }>()
  const [repair, setRepair] = useState<Awaited<ReturnType<typeof getRepairByFolio>>["data"]>(null)
  const [business, setBusiness] = useState<BusinessSettings | null>(null)
  const [solucion, setSolucion] = useState<string>("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  usePrintWindowClose()

  useEffect(() => {
    if (!id) return

    const load = async () => {
      try {
        const [repResult, settingsResult, historyResult] = await Promise.all([
          getRepairByFolio(decodeURIComponent(id)),
          getTallerSettings(),
          getRepairChangeHistory(decodeURIComponent(id)),
        ])

        if (repResult.error || !repResult.data) {
          setLoadError(repResult.error ?? "Reparación no encontrada.")
          return
        }

        const rep = repResult.data
        const cfg = settingsResult.settings

        const impConfig = cfg?.impresion_config as any
        const terminosRep = impConfig?.reparacion?.terminos ?? cfg?.terminos_garantia ?? ""

        setRepair(rep)

        // Buscar solución en historial: nota técnica del cambio a "Entregado"
        const entregaEntry = historyResult.changes?.find(
          (c) => c.tipo_cambio === "estado" && c.descripcion?.includes("Entregado")
        )
        setSolucion(
          entregaEntry?.descripcion?.replace(/^.*Entregado\s*—?\s*/i, "").trim() ||
          "Reparación completada según estándares del taller. Equipo entregado en condiciones de uso."
        )

        setBusiness({
          name: cfg?.nombre_taller || "Mi Taller",
          phone: cfg?.telefono || "",
          logoUrl: cfg?.logo_url ?? null,
          direccion: cfg?.direccion || undefined,
          terminosGarantia: terminosRep,
          mensajeDespedida: cfg?.mensaje_despedida || "",
        })
      } catch (err) {
        console.error("[print-entrega/[id]] error:", err)
        setLoadError("Error al cargar el comprobante. Cierra esta ventana e intenta de nuevo.")
      }
    }

    void load()
  }, [id])

  // Disparar impresión cuando todo esté listo
  useEffect(() => {
    if (!repair || !business) return

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
            const diasGarantia = warrantyDaysFromTerminos(business.terminosGarantia)
            const fechaEntregaRaw = repair.fecha_entrega ?? new Date().toISOString()
            const fechaVencimiento = new Date(new Date(fechaEntregaRaw).getTime() + diasGarantia * 86_400_000)
              .toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
            const costoTotalLocal = repair.costo_total ?? repair.precio_estimado ?? 0
            const anticiposPreviosLocal = repair.anticipo ?? 0
            const pagoFinalLocal = repair.restante ?? Math.max(0, costoTotalLocal - anticiposPreviosLocal)
            const ticketData = buildTicketDataFromEntrega(
              {
                folio: repair.folio,
                clienteNombre: repair.cliente_nombre,
                tipo_equipo: repair.tipo_equipo ?? undefined,
                deviceBrand: repair.dispositivo_marca,
                deviceModel: repair.dispositivo_modelo,
                solucionRealizada: solucion,
                costoTotal: costoTotalLocal,
                anticiposPrevios: anticiposPreviosLocal,
                pagoFinal: pagoFinalLocal,
                fechaVencimientoGarantia: fechaVencimiento,
                terminosGarantia: business.terminosGarantia || undefined,
                direccion: business.direccion || undefined,
                imei: repair.imei_serie || undefined,
                color: repair.color || undefined,
              },
              business.name,
              business.phone,
              business.mensajeDespedida || undefined
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
      style.id = "print-entrega-page-style"
      style.textContent = `@page { size: 80mm auto; margin: 0; } @media print { body { margin: 0 !important; padding: 0 !important; } }`
      document.head.appendChild(style)
      document.documentElement.style.setProperty("--ticket-width", "80mm")
      window.setTimeout(() => window.print(), 500)
    }

    runPrint()

    return () => {
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-entrega-page-style")?.remove()
    }
  }, [repair, business])

  if (loadError) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#c00000", fontSize: "14px" }}>
        <strong>Error:</strong> {loadError}
      </div>
    )
  }

  if (!repair || !business) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#555", fontSize: "13px" }}>
        Cargando comprobante…
      </div>
    )
  }

  const fechaEntrega = repair.fecha_entrega ?? new Date().toISOString()
  const diasGarantia = warrantyDaysFromTerminos(business.terminosGarantia)
  const fechaVencimiento = new Date(new Date(fechaEntrega).getTime() + diasGarantia * 86_400_000)
    .toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })

  const costoTotal = repair.costo_total ?? repair.precio_estimado ?? 0
  const anticiposPrevios = repair.anticipo ?? 0
  const pagoFinal = repair.restante ?? Math.max(0, costoTotal - anticiposPrevios)

  return (
    <div ref={ticketRef} className="print-ticket-only flex items-center justify-center bg-white p-4">
      <TicketSalidaGarantia
        nombreTaller={business.name}
        logoUrl={business.logoUrl}
        direccion={business.direccion}
        telefono={business.phone}
        folio={repair.folio}
        fechaEntrega={new Date(fechaEntrega).toLocaleDateString("es-MX", {
          year: "numeric", month: "long", day: "numeric",
        })}
        clienteNombre={repair.cliente_nombre}
        tipo_equipo={repair.tipo_equipo ?? undefined}
        deviceBrand={repair.dispositivo_marca}
        deviceModel={repair.dispositivo_modelo}
        solucionRealizada={solucion}
        costoTotal={costoTotal}
        anticiposPrevios={anticiposPrevios}
        pagoFinal={pagoFinal}
        fechaVencimientoGarantia={fechaVencimiento}
        terminosGarantiaCortos={business.terminosGarantia}
        mensajeDespedida={business.mensajeDespedida || undefined}
        repairId={repair.id}
      />
    </div>
  )
}
