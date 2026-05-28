"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Phone, Mail, Plus, ExternalLink, Inbox, Copy, Receipt } from "lucide-react"
import { WhatsAppButton } from "./whatsapp-button"
import type { ClientDetail } from "@/lib/actions/clients-prisma"
import type { BitacoraRepair } from "@/lib/actions/repairs"

interface ClientDetailModalProps {
  client: ClientDetail | null
  isOpen: boolean
  onClose: () => void
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  Recibido:       { label: "RECIBIDO",            className: "bg-blue-50 text-blue-700 border-blue-200" },
  Diagnostico:    { label: "DIAGNOSTICO",         className: "bg-amber-50 text-amber-700 border-amber-200" },
  "En Reparacion":{ label: "EN REPARACION",       className: "bg-orange-50 text-orange-700 border-orange-200" },
  Listo:          { label: "LISTO",               className: "bg-green-50 text-green-700 border-green-200" },
  Entregado:      { label: "ENTREGADO",           className: "bg-purple-50 text-purple-700 border-purple-200" },
  Cancelado:      { label: "CANCELADO",           className: "bg-red-50 text-red-700 border-red-200" },
  "Sin Reparacion":{ label: "SIN REPARACION",     className: "bg-slate-50 text-slate-700 border-slate-200" },
  Reingreso:      { label: "REINGRESO",           className: "bg-orange-50 text-orange-700 border-orange-200" },
}

function getStatusConfig(estatus: string) {
  return STATUS_CONFIG[estatus] ?? { label: estatus, className: "bg-slate-50 text-slate-600 border-slate-200" }
}

function toRepairSummary(order: ClientDetail["ordenes"][0], client: ClientDetail): BitacoraRepair {
  return {
    id: order.id,
    folio: order.folio,
    clienteName: client.nombre,
    clientePhone: client.telefono,
    deviceBrand: order.marca,
    deviceModel: order.modelo,
    estimatedPrice: order.precio_estimado,
    status: order.estatus as BitacoraRepair["status"],
    createdAt: new Date(order.created_at).toLocaleDateString("es-MX", {
      day: "numeric", month: "short", year: "numeric",
    }),
    anticipo: 0,
    tecnico: "—",
  }
}

export function ClientDetailModal({ client, isOpen, onClose }: ClientDetailModalProps) {
  const router = useRouter()
  const [selectedRepair, setSelectedRepair] = useState<BitacoraRepair | null>(null)
  const [rfcCopied, setRfcCopied] = useState(false)

  if (!client) return null

  const copyRfc = () => {
    if (!client.rfc) return
    void navigator.clipboard.writeText(client.rfc).then(() => {
      setRfcCopied(true)
      setTimeout(() => setRfcCopied(false), 2000)
    })
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })

  const formatCurrency = (amount: number | null) =>
    amount != null
      ? amount.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 })
      : "—"

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-3xl border-slate-200 bg-white p-0 gap-0 shadow-sm">
          {/* Header */}
          <DialogHeader className="px-6 py-5 border-b border-slate-100 shrink-0">
            <DialogDescription className="sr-only">Informacion detallada del cliente</DialogDescription>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl font-bold text-slate-900 truncate">
                  {client.nombre}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-sm text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono">{client.telefono}</span>
                    <WhatsAppButton phone={client.telefono} customerName={client.nombre} size="sm" />
                  </div>
                  {client.correo && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      <span>{client.correo}</span>
                    </div>
                  )}
                  {client.rfc && (
                    <button
                      type="button"
                      onClick={copyRfc}
                      title="Copiar RFC"
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700"
                    >
                      <Receipt className="h-3 w-3" />
                      {client.rfc}
                      <Copy className="h-3 w-3" />
                      {rfcCopied && <span className="text-green-600 not-italic font-sans">¡Copiado!</span>}
                    </button>
                  )}
                  <Badge variant="outline" className={
                    client.ordenes.length > 0
                      ? "border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold"
                      : "border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold"
                  }>
                    {client.ordenes.length} {client.ordenes.length === 1 ? "orden" : "ordenes"}
                  </Badge>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Orders list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {client.ordenes.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <Inbox className="h-7 w-7 text-slate-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Sin ordenes de reparacion</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Este cliente aun no tiene ordenes registradas.
                  </p>
                </div>
                <Button
                  className="mt-2 h-10 bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-2xl tracking-tight"
                  onClick={() => {
                    onClose()
                    router.push("/dashboard/reparaciones?openNewTicket=1")
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Nueva Reparacion
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Historial de Ordenes
                </p>
                {client.ordenes.map((order) => {
                  const sc = getStatusConfig(order.estatus)
                  return (
                    <div
                      key={order.id}
                      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      {/* Folio + Estado */}
                      <div className="shrink-0 flex flex-col gap-1 min-w-[80px]">
                        <span className="font-bold text-sm text-slate-900 font-mono">{order.folio}</span>
                        <span className="text-[10px] text-slate-400">{formatDate(order.created_at)}</span>
                      </div>

                      {/* Equipo + Falla */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {order.marca} {order.modelo}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {order.falla?.slice(0, 48)}{order.falla && order.falla.length > 48 ? "…" : ""}
                        </p>
                      </div>

                      {/* Estado + Precio */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 ${sc.className}`}>
                          {sc.label}
                        </Badge>
                        <span className="text-xs font-semibold text-slate-700">
                          {formatCurrency(order.precio_estimado)}
                        </span>
                      </div>

                      {/* Ver detalle */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        title="Ver detalle"
                        onClick={() => {
                          onClose()
                          router.push(`/dashboard/reparaciones/${order.id}`)
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex justify-end">
            <Button variant="outline" onClick={onClose} className="rounded-2xl border-slate-200">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
