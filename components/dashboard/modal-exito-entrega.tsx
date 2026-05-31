"use client"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { useReactToPrint } from "react-to-print"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, MessageCircle, Printer } from "lucide-react"
import type { RepairDetail } from "@/lib/actions/repairs-prisma"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"
import { toast } from "@/hooks/use-toast"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { TicketCobroReparacionTemplate } from "@/components/print-templates"

export interface ModalExitoEntregaProps {
  open: boolean
  onClose: () => void
  repairId: string
  detail: RepairDetail | null
  folio: string
  clienteNombre: string
  clientePhone: string
  equipoLabel: string
  anticiposPrevios: number
  pagoFinal: number
  metodoPago: string
}

interface TallerConfig {
  nombre: string
  telefono: string
  logoUrl: string | null
  mensajeDespedida: string | null
}

const METODOS_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
}

function garantiaUrl(repairId: string) {
  const base = typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://tallercloud.net"
  return `${base}/garantia/${encodeURIComponent(repairId)}`
}

export function ModalExitoEntrega({
  open,
  onClose,
  repairId,
  folio,
  clienteNombre,
  clientePhone,
  equipoLabel,
  anticiposPrevios,
  pagoFinal,
  metodoPago,
}: ModalExitoEntregaProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [tallerConfig, setTallerConfig] = useState<TallerConfig | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  useEffect(() => {
    if (open) {
      getTallerSettings().then((res) => {
        if (res.settings) {
          setTallerConfig({
            nombre: res.settings.nombre_taller || "Mi Taller",
            telefono: res.settings.telefono || "",
            logoUrl: res.settings.logo_url || null,
            mensajeDespedida: res.settings.mensaje_despedida || null,
          })
        }
      })
    }
  }, [open])

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    bodyClass: "print-ticket-mode",
    pageStyle: `@page { size: 80mm auto; margin: 0 !important; } body { margin: 0 !important; padding: 0 !important; }`,
    documentTitle: () => `Ticket-${folio}`,
  })

  const handleImprimir = useCallback(() => {
    setLoadingPrint(true)
    setTimeout(() => {
      handlePrint()
      setLoadingPrint(false)
    }, 100)
  }, [handlePrint])

  const cobroData = useMemo(() => {
    if (!tallerConfig) return null
    return {
      tipoMov: "liquidacion" as const,
      cliente: clienteNombre,
      folio,
      fechaIso: new Date().toISOString(),
      conceptos: equipoLabel,
      monto: pagoFinal + anticiposPrevios,
      metodo_pago: METODOS_LABEL[metodoPago] || metodoPago,
    }
  }, [tallerConfig, clienteNombre, folio, equipoLabel, pagoFinal, anticiposPrevios, metodoPago])

  const waUrl = useMemo(() => {
    const digits = normalizePhoneForWhatsApp(clientePhone)
    if (!digits) return null
    const msg = `Hola ${clienteNombre}, tu ${equipoLabel} esta listo. Consulta tu garantia digital aqui: ${garantiaUrl(repairId)}`
    return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`
  }, [clienteNombre, clientePhone, equipoLabel, repairId])

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Equipo entregado</DialogTitle>
          <DialogDescription>Folio #{folio}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleImprimir}
            disabled={loadingPrint || !tallerConfig}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {loadingPrint ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            IMPRIMIR TICKET
          </Button>
          <Button
            variant="outline"
            onClick={() => waUrl && window.open(waUrl, "_blank", "noopener,noreferrer")}
            disabled={!waUrl}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            ENVIAR POR WHATSAPP
          </Button>
          <Button variant="secondary" onClick={onClose}>CERRAR</Button>
        </div>
      </DialogContent>

      {/* Hidden printable ticket */}
      {tallerConfig && cobroData && (
        <div ref={printRef} className="hidden-print-area" style={{ display: "none" }}>
          <TicketCobroReparacionTemplate
            data={cobroData}
            tallerNombre={tallerConfig.nombre}
            tallerTelefono={tallerConfig.telefono}
            logoUrl={tallerConfig.logoUrl}
            mensajeDespedida={tallerConfig.mensajeDespedida}
          />
        </div>
      )}
    </Dialog>
  )
}
