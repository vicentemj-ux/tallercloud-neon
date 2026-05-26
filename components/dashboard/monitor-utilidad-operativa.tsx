"use client"

import { useState, useCallback, useTransition } from "react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, Plus, Trash2, DollarSign, Wrench, Package, Cog, Hexagon, AlertTriangle, Lock, Calendar, User } from "lucide-react"
import { addGastoTicket, deleteGastoTicket, type ReparacionGasto } from "@/lib/actions/gastos"
import { formatDateTime } from "@/lib/utils/date"

// Tipos del frontend (valores UI)
// Match con constraint BD: mano_obra | refaccion | maquila | insumo | otro
type GastoTipo = "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"
// Tipos que acepta la BD (sanitizados)
type DbGastoTipo = "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"

/** Normaliza el tipo de gasto al formato que acepta la BD */
function sanitizeGastoTipo(tipo: GastoTipo): DbGastoTipo {
  return tipo // Ya coinciden exactamente con el constraint
}

interface GastoCategoria {
  value: GastoTipo
  label: string
  icon: React.ReactNode
}

const CATEGORIAS: GastoCategoria[] = [
  { value: "mano_obra", label: "Mano de Obra", icon: <Wrench className="h-3.5 w-3.5" /> },
  { value: "refaccion", label: "Refacción", icon: <Package className="h-3.5 w-3.5" /> },
  { value: "maquila", label: "Maquila/Externo", icon: <Cog className="h-3.5 w-3.5" /> },
  { value: "insumo", label: "Insumos", icon: <Hexagon className="h-3.5 w-3.5" /> },
  { value: "otro", label: "Otros", icon: <DollarSign className="h-3.5 w-3.5" /> },
]

type OptimisticGasto = { id: string; concepto: string; monto: number; tipo: GastoTipo; isOptimistic?: boolean }

interface GastoWithCreator extends ReparacionGasto {
  creador_nombre?: string
}

interface MonitorUtilidadOperativaProps {
  repairId: string
  folio: string
  presupuesto: number
  initialGastos: GastoWithCreator[]
}

export function MonitorUtilidadOperativa({
  repairId,
  folio,
  presupuesto,
  initialGastos,
}: MonitorUtilidadOperativaProps) {
  const [gastos, setGastos] = useState<GastoWithCreator[]>(initialGastos)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [addError, setAddError] = useState<string | null>(null)

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [gastoToDelete, setGastoToDelete] = useState<{ id: string; concepto: string; monto: number } | null>(null)

  // Form state
  const [categoria, setCategoria] = useState<GastoTipo>("mano_obra")
  const [concepto, setConcepto] = useState("")
  const [monto, setMonto] = useState("")

  const handleAddGasto = useCallback(async () => {
    const montoNum = parseFloat(monto)
    if (!concepto.trim() || isNaN(montoNum) || montoNum <= 0) {
      setAddError("Ingresa un concepto y monto válido.")
      return
    }

    setAddError(null)
    startTransition(async () => {
      try {
        // Sanitizar tipo para que coincida con el constraint de la BD
        const dbTipo = sanitizeGastoTipo(categoria)
        const result = await addGastoTicket({
          reparacion_id: repairId,
          concepto: concepto.trim(),
          monto: montoNum,
          tipo: dbTipo,
        })

        if (result.error) {
          setAddError(result.error)
          toast({
            variant: "destructive",
            title: "❌ Error al registrar gasto",
            description: result.error,
          })
          return
        }

        if (result.data) {
          // Replace optimistic with real
          setGastos((prev) => {
            const filtered = prev.filter((g) => !g.id.startsWith("optimistic-"))
            return [...filtered, result.data!] as GastoWithCreator[]
          })
          toast({
            title: "✅ Gasto registrado exitosamente",
            description: `${categoriaLabel(categoria)} - $${montoNum.toLocaleString("es-MX")} | Revisado en caja`,
          })
          // Reset form
          setConcepto("")
          setMonto("")
          setCategoria("mano_obra")
        }
      } catch (err) {
        setAddError(err instanceof Error ? err.message : "Error al registrar gasto")
      }
    })
  }, [repairId, concepto, monto, categoria])

  const handleDeleteClick = useCallback((id: string, concept: string, gastoMonto: number) => {
    setGastoToDelete({ id, concepto: concept, monto: gastoMonto })
    setConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!gastoToDelete) return

    startTransition(async () => {
      try {
        // Optimistic update
        setGastos((prev) => prev.filter((g) => g.id !== gastoToDelete.id))
        setConfirmOpen(false)
        setGastoToDelete(null)
        
        const result = await deleteGastoTicket(gastoToDelete.id)
        if (result.error) {
          toast({ variant: "destructive", title: "❌ No se pudo eliminar el gasto", description: result.error })
          void loadGastos()
        } else {
          toast({
            title: "✅ Gasto eliminado y caja revertida",
            description: `Se eliminó: ${gastoToDelete.concepto}`,
          })
        }
      } catch {
        toast({ variant: "destructive", title: "❌ No se pudo eliminar el gasto", description: "Error inesperado. Intenta de nuevo." })
      }
    })
  }, [gastoToDelete])

  const loadGastos = async () => {
    const { getGastosTicket } = await import("@/lib/actions/gastos")
    const result = await getGastosTicket(repairId)
    if (!result.error) {
      setGastos(result.data as GastoWithCreator[])
    }
  }

  const totalGastos = gastos.reduce((sum, g) => sum + g.monto, 0)
  const utilidad = presupuesto - totalGastos
  const margenUtilidad = presupuesto > 0 ? (utilidad / presupuesto) * 100 : 0
  const isLowMargin = presupuesto > 0 && margenUtilidad < 20
  const isNegative = utilidad < 0

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
        >
          <div className="flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-blue-600" aria-hidden />
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Monitor de Utilidad Operativa
                </span>
                <Badge variant="outline" className="border-blue-200/80 bg-blue-50/80 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                  Solo interno
                </Badge>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Folio #{folio} • Control financiero
              </p>
            </div>
          </div>
          {open
            ? <ChevronUp className="h-4 w-4 text-slate-500" />
            : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>

        {open && (
          <div className="p-4 space-y-4 bg-white">
            {/* Balance Widget */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {/* Presupuesto */}
                <div className="text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Presupuesto</p>
                  <p className="text-lg font-bold text-blue-600 tabular-nums">
                    ${presupuesto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {/* Inversión */}
                <div className="text-center">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Inversión</p>
                  <p className="text-lg font-bold text-red-500 tabular-nums">
                    -${totalGastos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {/* Utilidad */}
                <div className={cn(
                  "text-center rounded-lg p-2",
                  isNegative ? "bg-red-50" : isLowMargin ? "bg-amber-50" : "bg-emerald-50"
                )}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Utilidad</p>
                    {(isNegative || isLowMargin) && (
                      <AlertTriangle className={cn("h-3 w-3", isNegative ? "text-red-500" : "text-amber-500")} aria-hidden />
                    )}
                  </div>
                  <p className={cn(
                    "text-lg font-bold tabular-nums",
                    isNegative ? "text-red-600" : "text-emerald-600"
                  )}>
                    ${utilidad.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                  {presupuesto > 0 && (
                    <p className={cn(
                      "text-[9px] font-semibold mt-0.5",
                      isNegative ? "text-red-500" : isLowMargin ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {margenUtilidad.toFixed(1)}% margen
                    </p>
                  )}
                </div>
              </div>

              {/* Indicador visual de margen */}
              <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn(
                    "absolute left-0 top-0 h-full rounded-full transition-all",
                    isNegative ? "bg-red-400" : isLowMargin ? "bg-amber-400" : "bg-emerald-400"
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, margenUtilidad))}%` }}
                />
              </div>
              {isLowMargin && !isNegative && (
                <p className="mt-1.5 text-[9px] text-center text-amber-600 font-medium">
                  ⚠️ La utilidad está por debajo del 20%
                </p>
              )}
            </div>

            {/* Formulario de Gasto - NEW LAYOUT */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Registrar Gasto
              </p>
              
              {/* Row 1: Categoría + Concepto */}
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3 flex flex-col gap-1">
                  <Label className="text-[10px] text-slate-500">Categoría</Label>
                  <Select value={categoria} onValueChange={(v) => setCategoria(v as GastoTipo)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <span className="flex items-center gap-1.5">
                            {cat.icon}
                            {cat.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-9 flex flex-col gap-1">
                  <Label className="text-[10px] text-slate-500">Concepto detallado</Label>
                  <Input
                    placeholder="Ej: Pantalla OLED Samsung A54"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Row 2: Monto + Botón */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 flex flex-col gap-1">
                  <Label className="text-[10px] text-slate-500">Monto ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-8 flex items-center gap-2">
                  {addError && (
                    <p className="text-[10px] text-red-500 font-medium flex-1">{addError}</p>
                  )}
                  <Button
                    onClick={handleAddGasto}
                    disabled={isPending || !concepto.trim() || !monto}
                    className="h-8 bg-blue-600 hover:bg-blue-700 text-xs font-semibold flex-1"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Registrar Gasto
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Listado de Gastos - ENRICHED */}
            {gastos.length > 0 ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Gastos registrados ({gastos.length})
                  </p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {gastos.map((g) => (
                    <li key={g.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-2">
                        {/* Badge de categoría */}
                        <span className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase mt-0.5",
                          g.tipo === "mano_obra" ? "bg-purple-100 text-purple-700" :
                          g.tipo === "refaccion" ? "bg-blue-100 text-blue-700" :
                          "bg-slate-100 text-slate-700"
                        )}>
                          {categoriaLabel(g.tipo)}
                        </span>
                        
                        {/* Concepto + Meta info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 truncate">{g.concepto}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {/* Fecha/Hora */}
                            <span className="flex items-center gap-1 text-[9px] text-slate-400">
                              <Calendar className="h-2.5 w-2.5" aria-hidden />
                              {formatDateTime(g.created_at)}
                            </span>
                            {/* Creador - Dynamic Name */}
                            <span className="flex items-center gap-1 text-[9px] text-slate-400">
                              <User className="h-2.5 w-2.5" aria-hidden />
                              {g.creador_nombre || "Sistema"}
                            </span>
                          </div>
                        </div>

                        {/* Monto */}
                        <span className="shrink-0 text-xs font-semibold text-red-600 tabular-nums mt-0.5">
                          -${g.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </span>

                        {/* Botón eliminar con confirmación */}
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(g.id, g.concepto, g.monto)}
                          disabled={isPending}
                          className="shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          aria-label={`Eliminar gasto: ${g.concepto}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/30 py-6 text-center">
                <p className="text-xs text-slate-400">Sin gastos registrados</p>
                <p className="text-[10px] text-slate-400 mt-1">Los costos aparecerán aquí conforme se registren</p>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
              <p className="text-[9px] leading-relaxed text-slate-500">
                Esta información es de uso interno del taller. No se incluye en el ticket del cliente ni en la vista de seguimiento.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-xl border-slate-200 bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base text-slate-900">
              ¿Eliminar este gasto?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-800">"{gastoToDelete?.concepto}"</p>
              <p className="text-slate-500">
                Monto: <span className="font-semibold text-red-600">-${gastoToDelete?.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </p>
              <p className="text-xs text-slate-400 italic">
                Esta acción se revertirá automáticamente en el Corte de Caja.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <AlertDialogCancel className="w-full sm:w-auto border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleConfirmDelete() }}
              className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ChevronUp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function categoriaLabel(tipo: string): string {
  switch (tipo) {
    case "mano_obra": return "MO"
    case "refaccion": return "REF"
    case "maquila": return "EXT"
    case "insumo": return "INS"
    default: return "OTR"
  }
}


