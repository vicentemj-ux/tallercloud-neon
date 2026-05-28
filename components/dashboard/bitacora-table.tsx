"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { AbonoModal } from "./abono-modal"
import { PrintMenuDropdown } from "@/components/dashboard/print-menu-dropdown"
import { type BitacoraRepair } from "@/lib/actions/repairs-prisma"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"
import {
  Inbox,
  DollarSign,
  MessageSquare,
  ExternalLink,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface BitacoraTableProps {
  repairs: BitacoraRepair[]
  onRepairUpdated: (updated: BitacoraRepair) => void
  onRepairDeleted?: (repairId: string) => void
  /** Abre el formulario de ticket para modificar este folio (solo en pagina Reparaciones). */
  onEditTicket?: (repair: BitacoraRepair) => void
}

const statusConfig: Record<BitacoraRepair["status"], { className: string; label: string }> = {
  Recibido: {
    className: "bg-blue-100/20 text-blue-700 border-blue-200",
    label: "RECIBIDO",
  },
  Diagnostico: {
    className: "bg-amber-100/20 text-amber-700 border-amber-200",
    label: "DIAGNOSTICO",
  },
  "En Reparacion": {
    className: "bg-orange-100/20 text-orange-700 border-orange-200",
    label: "EN REPARACION",
  },
  Listo: {
    className: "bg-green-100/20 text-green-700 border-green-200",
    label: "LISTO",
  },
  Entregado: {
    className: "bg-purple-100/20 text-purple-700 border-purple-200",
    label: "ENTREGADO",
  },
  Cancelado: {
    className: "bg-red-100/20 text-red-700 border-red-200",
    label: "CANCELADO",
  },
  "Sin Reparacion": {
    className: "bg-slate-100/40 text-slate-700 border-slate-300",
    label: "SIN REPARACION",
  },
  Reingreso: {
    className: "bg-orange-100 text-orange-700 border-orange-300 font-bold",
    label: "REINGRESO",
  },
}

export function BitacoraTable({ repairs, onRepairUpdated, onRepairDeleted, onEditTicket }: BitacoraTableProps) {
  const router = useRouter()
  const [abonoRepair, setAbonoRepair] = useState<BitacoraRepair | null>(null)
  const [abonoModalOpen, setAbonoModalOpen] = useState(false)

  const goToDetail = (repair: BitacoraRepair) => {
    router.push(`/dashboard/reparaciones/${repair.id}`)
  }

  const openAbono = (repair: BitacoraRepair) => {
    setAbonoRepair(repair)
    setAbonoModalOpen(true)
  }

  const closeAbono = () => {
    setAbonoModalOpen(false)
    setAbonoRepair(null)
  }

  const formatCurrency = (amount: number | null | undefined) => {
    return (amount || 0).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "-"
    const d = new Date(date)
    if (isNaN(d.getTime())) return "-"
    return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" })
  }

  const getDebt = (repair: BitacoraRepair) => {
    const estimated = repair.estimatedPrice || 0
    return Math.max(0, estimated - repair.anticipo)
  }

  const handleWhatsAppClick = (repair: BitacoraRepair, estadoLabel: string) => {
    const digits = normalizePhoneForWhatsApp(repair.clientePhone)
    if (!digits) return

    const cliente = repair.clienteName || "cliente"
    const marca = repair.deviceBrand || ""
    const modelo = repair.deviceModel || ""
    const trackingUrl = `${window.location.origin}/track/${encodeURIComponent(repair.id)}`

    const message = `Hola ${cliente}, te informamos que tu equipo ${marca} ${modelo} (Ticket #${repair.folio}) se encuentra en estado: ${estadoLabel}. Puedes consultar el avance aqui: ${trackingUrl}`
    const encodedMessage = encodeURIComponent(message)

    const url = `https://api.whatsapp.com/send?phone=${digits}&text=${encodedMessage}`
    window.open(url, "_blank")
  }

  if (repairs.length === 0) {
    return (
      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Inbox className="h-6 w-6 text-slate-400" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-slate-700">Sin reparaciones</p>
            <p className="text-xs text-slate-500">
              No hay reparaciones que coincidan con los filtros.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <TooltipProvider>
        <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <CardContent className="p-0">

            {/* ── Mobile cards ── */}
            <div className="md:hidden divide-y divide-border">
              {repairs.map((repair) => {
                const config = statusConfig[repair.status]
                const debt = getDebt(repair)
                const createdDate = formatDate(repair.createdAt)
                return (
                  <div
                    key={repair.id}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer flex-col gap-3 p-4 text-left"
                    onClick={() => goToDetail(repair)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        goToDetail(repair)
                      }
                    }}
                  >
                    {/* Header: folio + status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center px-3 py-1 bg-blue-500 rounded-full text-white text-sm font-bold">
                        {repair.folio}
                      </span>
                      <Badge
                        variant="outline"
                        className={`${config.className} font-bold text-xs border px-2 py-1 rounded-md`}
                      >
                        {config.label}
                      </Badge>
                    </div>

                    {/* Cliente + equipo */}
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{repair.clienteName || "Cliente"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-sm text-slate-600">
                          {repair.deviceBrand} {repair.deviceModel}
                        </p>
                        {repair.tecnico && repair.tecnico !== "Sin asignar" && (
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 font-semibold">
                            {repair.tecnico}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Financiero: presupuesto + deuda + fecha */}
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Presupuesto</p>
                        <p className="font-bold text-green-600">{formatCurrency(repair.estimatedPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Deuda</p>
                        {debt <= 0 ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            LIQUIDADO
                          </span>
                        ) : (
                          <p className="font-bold text-red-600">{formatCurrency(debt)}</p>
                        )}
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Entrega</p>
                        {repair.status === "Entregado" ? (
                          <div
                            style={{
                              background: "#1a1a2e",
                              color: "white",
                              borderRadius: "20px",
                              padding: "3px 10px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              marginTop: "2px",
                            }}
                          >
                            <span style={{ fontSize: "10px" }}>✓</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "11px", lineHeight: 1.2 }}>CONCLUIDO</div>
                              <div style={{ fontSize: "9px", opacity: 0.7, lineHeight: 1 }}>FASE FINAL</div>
                            </div>
                          </div>
                        ) : (
                          <p className="font-bold text-orange-600">EN PROCESO</p>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div
                      className="flex items-center gap-2 border-t border-slate-100 pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 flex-1 gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
                        onClick={() => openAbono(repair)}
                      >
                        <DollarSign className="h-4 w-4" />
                        Abono
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 flex-1 gap-1.5 border-green-200 text-green-500 hover:bg-green-50"
                        onClick={() => handleWhatsAppClick(repair, config.label)}
                      >
                        <MessageSquare className="h-4 w-4" />
                        WhatsApp
                      </Button>
                      <PrintMenuDropdown repair={repair} trigger="icon" />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-10 border-blue-200 p-0 text-blue-600 hover:bg-blue-50"
                        onClick={() => goToDetail(repair)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop table ── */}
            <div className="hidden md:block max-w-full overflow-x-auto custom-scrollbar pb-4">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border bg-slate-50/50">
                    <TableHead className="pl-6 font-bold text-slate-900 sticky left-0 z-10 bg-slate-50">
                      TICKET
                    </TableHead>
                    <TableHead className="font-bold text-slate-900">CLIENTE / EQUIPO</TableHead>
                    <TableHead className="font-bold text-slate-900">ESTADO</TableHead>
                    <TableHead className="font-bold text-slate-900 text-right">VENTA</TableHead>
                    <TableHead className="font-bold text-slate-900 text-right">DEUDA</TableHead>
                    <TableHead className="font-bold text-slate-900 text-right">ENTREGA</TableHead>
                    <TableHead className="pr-6 font-bold text-slate-900 text-right">ACCIONES</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repairs.map((repair) => {
                    const config = statusConfig[repair.status]
                    const debt = getDebt(repair)
                    const createdDate = formatDate(repair.createdAt)

                    return (
                      <TableRow
                        key={repair.id}
                        role="link"
                        tabIndex={0}
                        className="cursor-pointer border-b border-slate-200 hover:bg-slate-50/50 transition-colors"
                        onClick={() => goToDetail(repair)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            goToDetail(repair)
                          }
                        }}
                      >
                        {/* Ticket Pill */}
                        <TableCell className="pl-6 sticky left-0 z-0 bg-white">
                          <div className="flex flex-col items-start gap-1">
                            <div className="px-3 py-1.5 bg-blue-500 rounded-full">
                              <span className="font-bold text-white text-sm">{repair.folio}</span>
                            </div>
                            <span className="text-xs text-slate-500">{createdDate}</span>
                          </div>
                        </TableCell>

                        {/* Cliente / Equipo */}
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-slate-900">
                              {repair.clienteName || "Cliente"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-600">
                                {repair.deviceBrand} {repair.deviceModel}
                              </span>
                              {repair.tecnico && repair.tecnico !== "Sin asignar" && (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs bg-blue-500/10 text-blue-700 border-blue-200 font-semibold"
                                >
                                  {repair.tecnico}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Estado Badge */}
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`${config.className} font-bold text-xs border px-2 py-1 rounded-md`}
                          >
                            {config.label}
                          </Badge>
                        </TableCell>

                        {/* Venta (Presupuesto) */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-bold text-green-600 text-sm">
                              {formatCurrency(repair.estimatedPrice)}
                            </span>
                            <span className="text-xs text-slate-500">PRESUPUESTO</span>
                          </div>
                        </TableCell>

                        {/* Deuda */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            {debt <= 0 ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                                LIQUIDADO
                              </span>
                            ) : (
                              <>
                                <span className="font-bold text-sm text-red-600">
                                  {formatCurrency(debt)}
                                </span>
                                <span className="text-xs text-slate-500">PENDIENTE</span>
                              </>
                            )}
                          </div>
                        </TableCell>

                        {/* Entrega */}
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            {repair.status === "Entregado" ? (
                              <div
                                style={{
                                  background: "#1a1a2e",
                                  color: "white",
                                  borderRadius: "20px",
                                  padding: "4px 12px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span style={{ fontSize: "11px" }}>✓</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: "12px", lineHeight: 1.2 }}>CONCLUIDO</div>
                                  <div style={{ fontSize: "9px", opacity: 0.7, lineHeight: 1 }}>FASE FINAL</div>
                                </div>
                              </div>
                            ) : (
                              <span className="font-bold text-sm text-orange-600">EN PROCESO</span>
                            )}
                          </div>
                        </TableCell>

                        {/* Acciones */}
                        <TableCell className="pr-6">
                          <div className="flex items-center justify-end gap-2">
                            {/* Registrar Abono */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-slate-600 hover:text-green-600 hover:bg-green-50 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openAbono(repair)
                                  }}
                                >
                                  <DollarSign className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Registrar abono</TooltipContent>
                            </Tooltip>

                            {/* WhatsApp */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-slate-600 hover:text-green-500 hover:bg-green-50 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleWhatsAppClick(repair, config.label)
                                  }}
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>WhatsApp</TooltipContent>
                            </Tooltip>

                            {/* Imprimir - menu unificado (Ticket / Carta / Garantia / Etiqueta) */}
                            <div onClick={(e) => e.stopPropagation()} className="inline-flex">
                              <PrintMenuDropdown repair={repair} trigger="icon" />
                            </div>

                            {/* Detalles */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    goToDetail(repair)
                                  }}
                                  className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalles</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>

      <AbonoModal
        isOpen={abonoModalOpen}
        repairId={abonoRepair?.id ?? null}
        repairFolio={abonoRepair?.folio ?? ""}
        estimatedPrice={abonoRepair?.estimatedPrice}
        onClose={closeAbono}
        onSuccess={(nuevoAnticipo) => {
          if (abonoRepair) onRepairUpdated({ ...abonoRepair })
          closeAbono()
        }}
      />
    </>
  )
}
