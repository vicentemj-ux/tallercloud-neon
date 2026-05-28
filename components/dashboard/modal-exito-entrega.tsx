"use client"

import { useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MessageCircle, Printer } from "lucide-react"
import type { RepairDetail } from "@/lib/actions/repairs"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"
import { toast } from "@/hooks/use-toast"

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
}: ModalExitoEntregaProps) {
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
          <Button onClick={() => toast({ title: "Impresion directa (PRO)", description: "Proximamente." })} className="bg-slate-900 text-white hover:bg-slate-800">
            <Printer className="mr-2 h-4 w-4" />
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
    </Dialog>
  )
}
