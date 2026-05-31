"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PrintMenuDropdown } from "@/components/dashboard/print-menu-dropdown"
import {
  getRepairDetailPageData,
  deleteRepair,
  applyRepairStatusChange,
  updateRepairChecklistPro,
  updateRepairQuickNotes,
  getCancelacionSummary,
  cancelarReparacion,
  type BitacoraRepair,
  type RepairDetail,
  type HistorialReparacionAuditRow,
} from "@/lib/actions/repairs-prisma"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { StatusChangeConfirmDialog } from "@/components/dashboard/status-change-confirm-dialog"
import { buildRepairStatusWhatsAppUrl } from "@/lib/whatsapp-repair-status"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"
import { getRepairStatusDisplayLabel } from "@/lib/repair-status"
import { UnlockPatternGrid } from "@/components/dashboard/unlock-pattern-grid"
import { toast } from "@/hooks/use-toast"
import {
  Loader2,
  MessageCircle,
  Trash2,
  RotateCcw,
  Calendar,
  Clock,
  User,
  Smartphone,
  Laptop,
  Gamepad2,
  Tablet,
  Printer,
  Watch,
  Monitor,
  Projector,
  Wrench,
  AlertTriangle,
  Camera,
  Eye,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { AbonoModal } from "./abono-modal"
import { PresupuestoEditModal } from "./presupuesto-edit-modal"
import { ModalEntregaReparacion } from "./modal-entrega-reparacion"
import { ModalExitoEntrega } from "./modal-exito-entrega"
import { ReparacionNoExitosaModal } from "./reparacion-no-exitosa-modal"
import type { ReparacionGasto } from "@/lib/actions/gastos-prisma"
import { HealthCheckSheet } from "@/components/dashboard/health-check-sheet"
import { DiagnosisProSummaryCard } from "@/components/dashboard/diagnosis-pro-summary-card"
import { RepairPhotoGallery } from "@/components/dashboard/repair-photo-gallery"
import type { ChecklistProData } from "@/lib/reparaciones/checklist-pro"
import { safeNormalizeChecklistPro } from "@/lib/reparaciones/checklist-pro"

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ])
}

function getDeviceIcon(tipo: string | null | undefined) {
  const t = (tipo || "").toLowerCase()
  if (t.includes("laptop") || t.includes("notebook") || t.includes("mac")) return Laptop
  if (t.includes("videojuego") || t.includes("consola") || t.includes("playstation") || t.includes("xbox") || t.includes("nintendo")) return Gamepad2
  if (t.includes("tablet") || t.includes("ipad")) return Tablet
  if (t.includes("celular") || t.includes("smartphone") || t.includes("iphone") || t.includes("android") || t.includes("movil") || t.includes("movil")) return Smartphone
  if (t.includes("impresora") || t.includes("printer")) return Printer
  if (t.includes("reloj") || t.includes("watch") || t.includes("smartwatch")) return Watch
  if (t.includes("computadora") || t.includes("desktop") || t.includes("pc") || t.includes("all-in-one")) return Monitor
  if (t.includes("proyector") || t.includes("projector")) return Projector
  return Wrench
}

export interface RepairDetailViewProps {
  repair: BitacoraRepair | null
  onBack: () => void
  onRepairUpdated: (updated: BitacoraRepair) => void
  onDelete?: (repairId: string) => void
  onEditTicket?: (repair: BitacoraRepair) => void
  onReactivarReingreso?: () => void
}

const PROCESS_OPTIONS = [
  { value: "Recibido", label: "RECIBIDO" },
  { value: "Diagnostico", label: "DIAGNÓSTICO" },
  { value: "En Reparacion", label: "EN REPARACIÓN" },
  { value: "Listo", label: "LISTO" },
]
const PROCESS_LABEL_MAP: Record<string, string> = {
  Recibido: "RECIBIDO",
  Diagnostico: "DIAGNÓSTICO",
  "En Reparacion": "EN REPARACIÓN",
  Listo: "LISTO",
}

export function RepairDetailView({
  repair,
  onBack,
  onRepairUpdated,
  onDelete,
  onEditTicket,
  onReactivarReingreso,
}: RepairDetailViewProps) {
  const [detail, setDetail] = useState<RepairDetail | null>(null)
  const [presupuesto, setPresupuesto] = useState("")
  const [estado, setEstado] = useState<string>("")
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [abonoModalOpen, setAbonoModalOpen] = useState(false)
  const [presupuestoModalOpen, setPresupuestoModalOpen] = useState(false)
  const [history, setHistory] = useState<{ id: string; tipo_cambio: string; descripcion: string; created_at: string; valor_anterior?: string | null; valor_nuevo?: string | null; usuario?: string | null }[]>([])
  const [historialAudit, setHistorialAudit] = useState<HistorialReparacionAuditRow[]>([])

  const [entregaModalOpen, setEntregaModalOpen] = useState(false)
  const anticipoAntesEntregaRef = useRef(0)
  const [exitoEntregaOpen, setExitoEntregaOpen] = useState(false)
  const [exitoEntregaSnapshot, setExitoEntregaSnapshot] = useState<{
    pagoFinal: number
    anticiposPrevios: number
    detail: RepairDetail | null
  } | null>(null)

  /** Confirmacion de cambio de estado (no guardar directo) */
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [pendingEstado, setPendingEstado] = useState<string | null>(null)
  const [statusNota, setStatusNota] = useState("")
  const [statusPendingKind, setStatusPendingKind] = useState<"historial" | "whatsapp" | null>(null)
  const [nombreTallerSetting, setNombreTallerSetting] = useState("Mi Taller")
  const [warrantyHint, setWarrantyHint] = useState("30 dias")

  // Gastos del ticket — solo lectura (para mostrar utilidad estimada)
  const [gastos, setGastos] = useState<ReparacionGasto[]>([])
  const [servicios, setServicios] = useState<import("@/lib/actions/servicios-prisma").ReparacionServicio[]>([])
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelSummary, setCancelSummary] = useState<{ total: number; movements: Array<{ id: string; tipo: string; monto: number; metodo_pago: string; caja_id: string | null }> } | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [healthSheetOpen, setHealthSheetOpen] = useState(false)

  // â”€â”€ Inline quick-edit state â”€â”€
  const [editingObservaciones, setEditingObservaciones] = useState(false)
  const [observacionesDraft, setObservacionesDraft] = useState("")
  const [editingNotas, setEditingNotas] = useState(false)
  const [notasDraft, setNotasDraft] = useState("")
  const [savingQuickNotes, setSavingQuickNotes] = useState(false)

  // â”€â”€ Modal reparacion no exitosa â”€â”€
  const [noExitosaOpen, setNoExitosaOpen] = useState(false)
  const [noExitosaTipo, setNoExitosaTipo] = useState<"sin_reparar" | "cancelar">("sin_reparar")

  // â”€â”€ Modal decision LISTO (exitosa / no exitosa) â”€â”€
  const [listoDecisionOpen, setListoDecisionOpen] = useState(false)

  const [checklistProDraft, setChecklistProDraft] = useState<ChecklistProData>({
    funcional: {},
    expressOmitReason: null,
  })

  useEffect(() => {
    if (!detail) return
    setChecklistProDraft(safeNormalizeChecklistPro(detail?.checklistPro))
  }, [detail])

  const openHealthDetails = useCallback(() => {
    setChecklistProDraft(safeNormalizeChecklistPro(detail?.checklistPro))
    setHealthSheetOpen(true)
  }, [detail?.checklistPro])

  const handleCancelClick = async () => {
    if (!repair) return
    const summary = await getCancelacionSummary(repair.id)
    if (summary.error) {
      toast({ title: "Error", description: summary.error, variant: "destructive" })
      return
    }
    setCancelSummary(summary)
    setCancelDialogOpen(true)
  }

  const handleCancelConfirm = async () => {
    if (!repair) return
    setIsCancelling(true)
    try {
      const result = await cancelarReparacion(repair.id)
      if (result.success) {
        setCancelDialogOpen(false)
        onRepairUpdated({ ...repair, status: "Cancelado" as BitacoraRepair["status"] })
        setEstado("Cancelado")
      } else {
        toast({ title: "Error", description: result.error ?? "No se pudo cancelar la reparacion.", variant: "destructive" })
        setCancelDialogOpen(false)
      }
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!repair) return
    setIsDeleting(true)
    try {
      const result = await deleteRepair(repair.id)
      if (result.success) {
        onDelete?.(repair.id)
        onBack()
        setDeleteDialogOpen(false)
      } else {
        toast({ title: "Error", description: result.error ?? "No se pudo eliminar.", variant: "destructive" })
      }
    } finally {
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    if (!repair) {
      setDetail(null)
      setHistory([])
      setHistorialAudit([])
      setGastos([])
      setServicios([])
      setEstado("")
      setEntregaModalOpen(false)
      setStatusDialogOpen(false)
      setPendingEstado(null)
      setStatusNota("")
      setChecklistProDraft({ funcional: {}, expressOmitReason: null })
      return
    }
    setPresupuesto(repair.estimatedPrice?.toString() ?? "")
    setEstado(repair.status ?? "")
    const load = async () => {
      setIsLoadingDetail(true)
      try {
        const [page, settingsRes] = await Promise.all([
          withTimeout(getRepairDetailPageData(repair.id), 15000, "getRepairDetailPageData"),
          withTimeout(getTallerSettings(), 15000, "getTallerSettings"),
        ])
        if (settingsRes.settings?.nombre_taller) setNombreTallerSetting(settingsRes.settings.nombre_taller)
        if (settingsRes.settings?.terminos_garantia?.trim()) {
          const t = settingsRes.settings.terminos_garantia.trim()
          setWarrantyHint(t.length > 48 ? `${t.slice(0, 45)}â€¦` : t)
        }
        const data = page.detail
        setDetail(data ?? null)
        if (data) {
          setPresupuesto(data.estimatedPrice?.toString() ?? "")
          setEstado(data.status ?? repair.status ?? "")
        }
        setHistory(page.changes ?? [])
        setHistorialAudit(page.historialAudit ?? [])
        setGastos(page.gastos ?? [])
        setServicios(page.servicios ?? [])
      } catch (error) {
        console.error("[repair-detail-view] load:", error)
        toast({
          title: "No se pudo cargar el detalle",
          description: "Intenta recargar el folio.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingDetail(false)
      }
    }
    load()
  }, [repair?.id])

  const refreshDetail = async () => {
    if (!repair) return
    const page = await getRepairDetailPageData(repair.id)
    setHistory(page.changes ?? [])
    setHistorialAudit(page.historialAudit ?? [])
    setGastos(page.gastos ?? [])
    setServicios(page.servicios ?? [])
    if (page.detail) {
      setDetail(page.detail)
      setPresupuesto(page.detail.estimatedPrice?.toString() ?? "")
      setEstado(page.detail.status ?? repair.status ?? "")
    }
  }

  // â”€â”€ Inline quick-edit handlers â”€â”€
  const startEditObservaciones = useCallback(() => {
    setObservacionesDraft(detail?.checklistIngreso?.observacionesEsteticas ?? "")
    setEditingObservaciones(true)
  }, [detail?.checklistIngreso?.observacionesEsteticas])

  const cancelEditObservaciones = useCallback(() => {
    setEditingObservaciones(false)
    setObservacionesDraft("")
  }, [])

  const startEditNotas = useCallback(() => {
    setNotasDraft(detail?.notasInternas ?? "")
    setEditingNotas(true)
  }, [detail?.notasInternas])

  const cancelEditNotas = useCallback(() => {
    setEditingNotas(false)
    setNotasDraft("")
  }, [])

  const saveQuickNotes = useCallback(
    async (field: "observaciones" | "notas") => {
      if (!repair) return
      setSavingQuickNotes(true)
      try {
        const payload: { observacionesEsteticas?: string; notasInternas?: string } = {}
        if (field === "observaciones") payload.observacionesEsteticas = observacionesDraft
        if (field === "notas") payload.notasInternas = notasDraft

        const result = await updateRepairQuickNotes(repair.id, payload)
        if (!result.success) {
          toast({ title: "Error", description: result.error ?? "No se pudo guardar.", variant: "destructive" })
          return
        }
        if (field === "observaciones") setEditingObservaciones(false)
        if (field === "notas") setEditingNotas(false)
        await refreshDetail()
        toast({ title: "Guardado", description: "Cambios actualizados correctamente." })
      } finally {
        setSavingQuickNotes(false)
      }
    },
    [repair, observacionesDraft, notasDraft],
  )

  const handleStatusOptionClick = (value: string) => {
    if (value === estado) return
    if (value === "Listo") {
      setListoDecisionOpen(true)
      return
    }
    // Process options: direct change with confirmation dialog
    if (["Recibido", "Diagnostico", "En Reparacion"].includes(value)) {
      setPendingEstado(value)
      setStatusNota("")
      setStatusDialogOpen(true)
      return
    }
  }

  const handleListoDecision = (exitosa: boolean) => {
    setListoDecisionOpen(false)
    if (exitosa) {
      setPendingEstado("Listo")
      setStatusNota("")
      setStatusDialogOpen(true)
    } else {
      setNoExitosaTipo("sin_reparar")
      setNoExitosaOpen(true)
    }
  }

  const handleEntregarClick = () => {
    anticipoAntesEntregaRef.current = anticipoNum
    setEntregaModalOpen(true)
  }

  const handleNoExitosaClick = (tipo: "sin_reparar" | "cancelar") => {
    setNoExitosaTipo(tipo)
    setNoExitosaOpen(true)
  }

  const confirmarNoExitosa = async (data: { razon: string; nota: string }) => {
    if (!repair) return
    const nuevoEstado = noExitosaTipo === "sin_reparar" ? "Sin Reparacion" : "Cancelado"
    const notaCompleta = [data.razon, data.nota].filter(Boolean).join(" — ")
    try {
      const res = await applyRepairStatusChange({
        repairId: repair.id,
        estadoAnterior: estado,
        estadoNuevo: nuevoEstado,
        notaTecnica: notaCompleta,
      })
      if (!res.success) {
        toast({ title: "Error", description: res.error ?? "No se pudo actualizar.", variant: "destructive" })
        return
      }
      setEstado(nuevoEstado)
      setNoExitosaOpen(false)
      const page = await getRepairDetailPageData(repair.id)
      setHistory(page.changes ?? [])
      setHistorialAudit(page.historialAudit ?? [])
      if (page.detail) setDetail(page.detail)
      onRepairUpdated({ ...repair, status: nuevoEstado as BitacoraRepair["status"] })
      toast({
        title: nuevoEstado === "Sin Reparacion" ? "Marcado sin reparar" : "Cancelado",
        description: "Razon registrada para metricas.",
      })
    } catch {
      toast({ title: "Error", description: "Error de red al guardar.", variant: "destructive" })
    }
  }

  const confirmStatusChange = async (mode: "historial" | "whatsapp") => {
    if (!repair || pendingEstado == null) return
    const nuevoEstado = pendingEstado
    const notaCaptured = statusNota
    setStatusPendingKind(mode)
    try {
      const res = await applyRepairStatusChange({
        repairId: repair.id,
        estadoAnterior: estado,
        estadoNuevo: nuevoEstado,
        notaTecnica: notaCaptured,
      })
      if (!res.success) {
        toast({ title: "Error", description: res.error ?? "No se pudo actualizar.", variant: "destructive" })
        return
      }
      setEstado(nuevoEstado)
      setStatusDialogOpen(false)
      setPendingEstado(null)
      setStatusNota("")
      const page = await getRepairDetailPageData(repair.id)
      setHistory(page.changes ?? [])
      setHistorialAudit(page.historialAudit ?? [])
      if (page.detail) setDetail(page.detail)
      onRepairUpdated({ ...repair, status: nuevoEstado as BitacoraRepair["status"] })
      toast({ title: "Estado actualizado", description: "Cambio registrado en historial." })

      if (mode === "whatsapp") {
        try {
          const d = page.detail
          const total = d?.costoTotal ?? d?.estimatedPrice ?? presupuestoNum
          const rest =
            d?.restante ??
            Math.max(0, (d?.estimatedPrice ?? presupuestoNum) - (d?.anticipo ?? anticipoNum))
          const costoRevision = d?.estimatedPrice ?? presupuestoNum
          const baseUrl =
            typeof window !== "undefined"
              ? window.location.origin
              : (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") || ""
          const url = buildRepairStatusWhatsAppUrl({
            phoneRaw: d?.clientePhone ?? repair?.clientePhone,
            nombreTaller: nombreTallerSetting,
            cliente: d?.clienteName ?? repair?.clienteName,
            equipo: `${d?.deviceBrand ?? repair?.deviceBrand ?? ""} ${d?.deviceModel ?? repair?.deviceModel ?? ""}`.trim(),
            folio: d?.folio ?? repair?.folio,
            repairId: repair.id,
            estadoNuevo: nuevoEstado,
            notaTecnica: notaCaptured,
            total,
            restante: rest,
            costoRevision,
            baseUrl,
          })
          if (url) window.open(url)
          else
            toast({
              title: "Sin telefono",
              description: "No hay numero de cliente para abrir WhatsApp.",
              variant: "destructive",
            })
        } catch (waErr) {
          console.error("[confirmStatusChange] WhatsApp:", waErr)
          toast({
            title: "WhatsApp",
            description: "El estado se guardo; no se pudo abrir el mensaje.",
            variant: "destructive",
          })
        }
      }
    } finally {
      setStatusPendingKind(null)
    }
  }

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0)
  const presupuestoNum = presupuesto ? parseFloat(presupuesto) : 0
  const anticipoNum = detail?.anticipo ?? repair?.anticipo ?? 0
  const saldoPendiente = useMemo(() => {
    if (detail?.restante != null && !Number.isNaN(Number(detail.restante))) {
      return Math.max(0, Number(detail.restante))
    }
    const ct = detail?.costoTotal ?? presupuestoNum
    return Math.max(0, ct - anticipoNum)
  }, [detail?.restante, detail?.costoTotal, presupuestoNum, anticipoNum])

  const badgeLabel = getRepairStatusDisplayLabel(estado)
  const registradoText = detail?.createdAtRaw
    ? new Date(detail.createdAtRaw).toLocaleDateString("es-MX", { day: "numeric", month: "numeric", year: "numeric" })
    : detail?.createdAt ?? "—"
  const formatTimestamp = (iso: string) =>
    new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })

  const gastosManoObra = useMemo(
    () => gastos.filter((g) => g.tipo === "mano_obra").reduce((s, g) => s + g.monto, 0),
    [gastos]
  )
  const gastosRefaccion = useMemo(
    () => gastos.filter((g) => g.tipo === "refaccion").reduce((s, g) => s + g.monto, 0),
    [gastos]
  )

  const formatLogTipo = (tipo: string) => {
    const m: Record<string, string> = {
      presupuesto: "Presupuesto",
      abono: "Abono / pago",
      tecnico: "Tecnico asignado",
      estado: "Cambio de estado",
    }
    return m[tipo] ?? tipo
  }

  const auditFeedItems = useMemo(() => {
    const estadoRows = historialAudit.map((h) => ({
      key: `h-${h.id}`,
      kind: "estado" as const,
      fecha: h.fecha,
      usuario: h.usuario_nombre,
      anterior: h.estado_anterior,
      nuevo: h.estado_nuevo,
      nota: h.nota_tecnica,
    }))
    const logRows = history
      .filter((c) => c.tipo_cambio !== "estado")
      .map((c) => ({
        key: `c-${c.id}`,
        kind: "log" as const,
        fecha: c.created_at,
        usuario: c.usuario ?? "Sistema",
        tipo: c.tipo_cambio,
        descripcion: c.descripcion,
        valorAnterior: c.valor_anterior ?? null,
        valorNuevo: c.valor_nuevo ?? null,
      }))
    /* Cronologico: el ingreso basal (Recibido) primero, lo mas reciente al final */
    const merged = [...estadoRows, ...logRows].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
    )
    if (merged.length > 0) return merged
    if (detail?.createdAtRaw && detail.creadoPorNombre) {
      return [
        {
          key: "creacion-sin-historial",
          kind: "estado" as const,
          fecha: detail.createdAtRaw,
          usuario: detail.creadoPorNombre,
          anterior: null,
          nuevo: estado || "Recibido",
          nota: `EQUIPO RECIBIDO${detail.creadoPorNombre ? ` — Recibido por ${detail.creadoPorNombre}` : ""}`,
        },
      ]
    }
    return merged
  }, [historialAudit, history, detail?.createdAtRaw, detail?.creadoPorNombre, estado])

  const lastEstadoTimelineIndex = useMemo(() => {
    for (let i = auditFeedItems.length - 1; i >= 0; i--) {
      if (auditFeedItems[i].kind === "estado") return i
    }
    return -1
  }, [auditFeedItems])

  return (
    <>
      <div className="relative z-0 min-h-0 w-full bg-white text-slate-900">
        {/* Encabezado: folio, estado, acciones */}
        <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Folio */}
            <span className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {repair?.folio ?? detail?.folio ?? "—"}
            </span>
            {/* Estado */}
            <span className="inline-flex rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-bold uppercase text-blue-800">
              {badgeLabel}
            </span>
            {/* Tecnico */}
            {detail?.tecnico && detail.tecnico !== "No asignado" && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-slate-700">
                <Wrench className="h-4 w-4" aria-hidden />
                {detail.tecnico}
              </span>
            )}
            {/* Reingreso */}
            {repair?.status === "Entregado" && onReactivarReingreso && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 font-semibold text-xs"
                onClick={onReactivarReingreso}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reingreso
              </Button>
            )}
            {/* Fecha */}
            <span className="inline-flex items-center gap-1 text-sm text-slate-600">
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {registradoText}
                {detail?.creadoPorNombre ? (
                  <span className="text-slate-500"> · {detail.creadoPorNombre}</span>
                ) : null}
              </span>
            </span>
            {/* Entregar (cuando esta Listo, Sin Reparacion o Cancelado) */}
            {(estado === "Listo" || estado === "Sin Reparacion" || estado === "Cancelado") && (
              <Button
                type="button"
                size="sm"
                onClick={handleEntregarClick}
                className="gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-700"
              >
                <PackageCheck className="h-4 w-4" aria-hidden />
                Entregar equipo
              </Button>
            )}
            {/* Spacer */}
            <span className="hidden lg:inline-flex flex-1" aria-hidden />
            {/* Acciones */}
            <div className="flex flex-wrap items-center gap-2">
              {onEditTicket && repair && (
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="gap-2 border-[#2563eb] font-semibold text-[#2563eb] hover:bg-[#2563eb]/5"
                  onClick={() => onEditTicket(repair)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
              {repair && (
                <PrintMenuDropdown
                  repair={repair}
                  detail={detail as any}
                  trigger="headerIcon"
                  shopName={nombreTallerSetting}
                  warrantyText={warrantyHint}
                  estado={estado}
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteDialogOpen(true)}
                aria-label="Eliminar"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="max-w-md border-red-200 bg-red-50">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center text-xl font-bold text-red-800">
                ATENCIÃ“N
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-base text-red-800">
                Estas a punto de borrar permanentemente este folio. Esta accion no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col-reverse gap-2 pt-4 sm:flex-row">
              <AlertDialogCancel className="border-red-300 text-red-800 hover:bg-red-100">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeleteConfirm()
                }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-wide w-full sm:w-auto"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "CONFIRMAR BORRADO PERMANENTE"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-center text-xl font-bold text-slate-900">
                Â¿Cancelar esta reparacion?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-center text-base text-slate-700">
                <span className="block">Esta accion cancelara el folio y generara devoluciones automaticas.</span>
                {cancelSummary && cancelSummary.total > 0 ? (
                  <span className="block font-semibold text-red-600">
                    Total a devolver:{" "}
                    {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cancelSummary.total)}
                  </span>
                ) : (
                  <span className="block text-slate-500">Sin pagos registrados — no se generaran devoluciones.</span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col-reverse gap-2 pt-4 sm:flex-row">
              <AlertDialogCancel disabled={isCancelling} className="border-slate-300 text-slate-700">
                Volver
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isCancelling}
                onClick={(e) => {
                  e.preventDefault()
                  handleCancelConfirm()
                }}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {isCancelling ? "Cancelando..." : "Confirmar cancelacion"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isLoadingDetail && !detail ? (
          <div className="flex min-h-[40vh] flex-1 items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando detalle...
          </div>
        ) : (
          <div className="w-full overflow-x-hidden pb-6 sm:pb-8">
            <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 md:grid-cols-3 md:gap-6 lg:p-8">
              {/* Columna izquierda: proceso, falla, finanzas, historial */}
              <div className="min-w-0 space-y-6 md:col-span-2">
                <section className="space-y-3">
                  {/* Flujo de proceso */}
                  <div className="flex flex-wrap gap-2">
                    {PROCESS_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={estado === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusOptionClick(opt.value)}
                        className={`shrink-0 rounded-lg text-xs font-bold uppercase tracking-wide ${
                          estado === opt.value
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>

                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
                    <div className="flex min-h-0 flex-col gap-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Falla reportada
                      </Label>
                      <div className="flex min-h-[72px] flex-1 items-center rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-gray-900">
                        <p className="text-base font-semibold leading-relaxed text-gray-900">
                          {detail?.falla ? (
                            <>
                              <span className="text-gray-400">&ldquo;</span>
                              {detail.falla}
                              <span className="text-gray-400">&rdquo;</span>
                            </>
                          ) : (
                            <span className="italic text-gray-500">Sin descripcion de falla</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-col gap-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Diagnostico rapido
                      </Label>
                      <DiagnosisProSummaryCard
                        encendido={detail?.checklistIngreso?.encendido ?? null}
                        onOpenDetails={openHealthDetails}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Presupuesto</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                        ${presupuestoNum.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3 w-full gap-1.5 bg-[#2563eb] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                        onClick={() => setPresupuestoModalOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        EDITAR
                      </Button>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Abonos / pagos</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums text-orange-600">
                          ${anticipoNum.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                            anticipoNum > 0 ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {anticipoNum > 0 ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3 w-full gap-1.5 bg-[#2563eb] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                        onClick={() => setAbonoModalOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Registrar abono
                      </Button>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">Saldo pendiente</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-red-600">
                        ${saldoPendiente.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Servicios aplicados */}
                  {servicios.length > 0 && (
                    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Servicios aplicados
                        </p>
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-700">
                          PRO
                        </span>
                      </div>
                      <div className="space-y-2">
                        {servicios.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Wrench className="h-3.5 w-3.5 text-blue-600" />
                              <span className="font-semibold text-slate-800">{s.nombre_snapshot}</span>
                              {s.cantidad > 1 && (
                                <span className="text-xs text-slate-500">Ã—{s.cantidad}</span>
                              )}
                            </div>
                            <span className="font-bold text-slate-900">
                              ${(s.precio_snapshot * s.cantidad).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          Total servicios
                        </span>
                        <span className="text-lg font-black text-slate-900">
                          ${servicios.reduce((sum, s) => sum + s.precio_snapshot * s.cantidad, 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}

                  {gastos.length > 0 ? (
                    (() => {
                      const util = presupuestoNum - totalGastos
                      const isPos = util >= 0
                      return (
                        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">
                              Inversion (interno)
                            </p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-900">
                              ${totalGastos.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </p>
                            <p className="mt-2 text-xs text-sky-800/90">
                              Mano de obra ${gastosManoObra.toFixed(2)} · Refacciones ${gastosRefaccion.toFixed(2)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-[#2563eb]" />
                              <p className="text-[11px] font-bold uppercase tracking-wide text-[#2563eb]">
                                Utilidad estimada
                              </p>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              {isPos ? (
                                <TrendingUp className="h-5 w-5 text-emerald-600" />
                              ) : (
                                <TrendingDown className="h-5 w-5 text-red-600" />
                              )}
                              <p
                                className={`text-2xl font-bold tabular-nums ${isPos ? "text-emerald-700" : "text-red-700"}`}
                              >
                                ${util.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })()
                  ) : null}

                  {/* â”€â”€ Observaciones esteticas â”€â”€ */}
                  <div className="mt-6">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-slate-400" aria-hidden />
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          OBSERVACIONES Y ACCESORIOS al ingreso
                        </Label>
                      </div>
                      <button
                        type="button"
                        onClick={editingObservaciones ? cancelEditObservaciones : startEditObservaciones}
                        disabled={savingQuickNotes}
                        className="inline-flex items-center gap-1 rounded-md p-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        {editingObservaciones ? "Cancelar" : "Editar"}
                      </button>
                    </div>
                    {editingObservaciones ? (
                      <div className="space-y-2">
                        <Textarea
                          value={observacionesDraft}
                          onChange={(e) => setObservacionesDraft(e.target.value)}
                          placeholder="Golpes, rayones o accesorios"
                          className="min-h-[72px] resize-y rounded-lg border-slate-200 bg-white text-sm"
                          disabled={savingQuickNotes}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-[#2563eb] text-xs font-semibold text-white hover:bg-[#1d4ed8]"
                            disabled={savingQuickNotes}
                            onClick={() => void saveQuickNotes("observaciones")}
                          >
                            {savingQuickNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs font-semibold text-slate-600"
                            disabled={savingQuickNotes}
                            onClick={cancelEditObservaciones}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
                        {detail?.checklistIngreso?.observacionesEsteticas?.trim() ? (
                          <p className="text-sm font-medium leading-relaxed text-gray-800">
                            {detail.checklistIngreso.observacionesEsteticas.trim()}
                          </p>
                        ) : (
                          <p className="text-sm italic text-gray-400">Sin observaciones esteticas registradas</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* â”€â”€ Notas internas â”€â”€ */}
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-amber-500" aria-hidden />
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          Notas internas
                        </Label>
                      </div>
                      <button
                        type="button"
                        onClick={editingNotas ? cancelEditNotas : startEditNotas}
                        disabled={savingQuickNotes}
                        className="inline-flex items-center gap-1 rounded-md p-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                        {editingNotas ? "Cancelar" : detail?.notasInternas ? "Editar" : "Agregar"}
                      </button>
                    </div>
                    {editingNotas ? (
                      <div className="space-y-2">
                        <Textarea
                          value={notasDraft}
                          onChange={(e) => setNotasDraft(e.target.value)}
                          placeholder="Notas solo para el tallerâ€¦"
                          className="min-h-[72px] resize-y rounded-lg border-amber-200 bg-white text-sm"
                          disabled={savingQuickNotes}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700"
                            disabled={savingQuickNotes}
                            onClick={() => void saveQuickNotes("notas")}
                          >
                            {savingQuickNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs font-semibold text-slate-600"
                            disabled={savingQuickNotes}
                            onClick={cancelEditNotas}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : detail?.notasInternas?.trim() ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                        <p className="text-sm font-medium leading-relaxed text-amber-900">
                          {detail.notasInternas.trim()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
                    <Clock className="h-5 w-5 text-[#2563eb]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                      Historial de actividad
                    </h3>
                  </div>
                  <div className="max-h-[min(50vh,480px)] overflow-y-auto pr-1 sm:max-h-none">
                    {auditFeedItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-gray-500">Sin movimientos registrados aun.</p>
                    ) : (
                      <ul className="relative space-y-0 border-l-2 border-gray-200 pl-5">
                        {auditFeedItems.map((item, idx) => {
                          const showEstadoActualBadge =
                            item.kind === "estado" && idx === lastEstadoTimelineIndex
                          return (
                            <li key={item.key} className="relative pb-8 last:pb-0">
                              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#2563eb] ring-2 ring-[#2563eb]/20" />
                              {item.kind === "estado" ? (
                                <div>
                                  {showEstadoActualBadge ? (
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                                      Estado actual
                                    </p>
                                  ) : null}
                                  {item.anterior != null && item.anterior !== "" ? (
                                    <p className="text-xs font-bold uppercase leading-snug text-gray-900">
                                      <span className="text-emerald-700">
                                        {getRepairStatusDisplayLabel(item.anterior)}
                                      </span>
                                      <span className="mx-1.5 text-gray-300">â†’</span>
                                      <span className="text-[#2563eb]">{getRepairStatusDisplayLabel(item.nuevo)}</span>
                                    </p>
                                  ) : (
                                    <p className="text-xs font-bold uppercase text-[#2563eb]">
                                      {getRepairStatusDisplayLabel(item.nuevo)}
                                    </p>
                                  )}
                                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                                    {formatTimestamp(item.fecha)} — {item.usuario}
                                    {item.nota?.trim() ? ` — ${item.nota.trim()}` : ""}
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-xs font-bold uppercase text-gray-900">{formatLogTipo(item.tipo)}</p>
                                  {item.tipo === "presupuesto" && (item.valorAnterior != null || item.valorNuevo != null) ? (
                                    <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
                                      ${Number(item.valorAnterior || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} <span className="text-gray-400">â†’</span> ${Number(item.valorNuevo || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 text-sm italic text-gray-600">&ldquo;{item.descripcion}&rdquo;</p>
                                  <p className="mt-2 text-[11px] text-gray-500">
                                    {formatTimestamp(item.fecha)} · {item.usuario}
                                  </p>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              </div>

              {/* Columna derecha: cliente, equipo, fotos */}
              <div className="flex min-w-0 flex-col gap-5 md:col-span-1">
                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-[#2563eb]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Cliente</h3>
                  </div>
                  <p className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">
                    {(detail?.clienteName ?? repair?.clienteName) || "—"}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-gray-800">
                    {(detail?.clientePhone ?? repair?.clientePhone) || "—"}
                  </p>
                  {detail?.clientePhone ? (
                    <button
                      type="button"
                      onClick={() => {
                        const digits = normalizePhoneForWhatsApp(detail.clientePhone)
                        if (!digits) return
                        const msg = `Buenas ${(detail?.clienteName ?? repair?.clienteName ?? "cliente").trim()}, lo contactamos de parte de ${nombreTallerSetting} por el ${(detail?.deviceBrand ?? repair?.deviceBrand ?? "").trim()} ${(detail?.deviceModel ?? repair?.deviceModel ?? "").trim()} que nos llevo a revision a la tienda.`
                        window.open(`https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`)
                      }}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      Contactar por WhatsApp
                    </button>
                  ) : null}
                </section>

                <section className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    {(() => {
                      const Icon = getDeviceIcon(detail?.tipo_equipo ?? repair?.tipo_equipo)
                      return <Icon className="h-5 w-5 text-[#2563eb]" />
                    })()}
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">Equipo</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-2xl font-bold uppercase tracking-tight text-gray-900">
                        {(detail?.tipo_equipo ?? repair?.tipo_equipo ?? "").trim() || "—"} · {(detail?.deviceBrand ?? repair?.deviceBrand ?? "").trim() || "—"}
                      </p>
                      <p className="text-xl font-bold text-[#2563eb] sm:text-2xl">
                        {(detail?.deviceModel ?? repair?.deviceModel ?? "").trim() || "—"}
                      </p>
                    </div>
                    <dl className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase text-gray-500">IMEI / SN</dt>
                        <dd className="mt-0.5 font-mono text-gray-900">{detail?.imei ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase text-gray-500">Color</dt>
                        <dd className="mt-0.5 text-gray-900">{detail?.color ?? "—"}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] font-semibold uppercase text-gray-500">Seguridad del equipo</dt>
                        <dd className="mt-2 space-y-3">
                          {detail?.securityType === "none" || !detail?.securityType ? (
                            <p className="text-sm text-gray-500">Sin bloqueo registrado.</p>
                          ) : detail.securityType === "pattern" ? (
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                                Patron
                              </p>
                              <UnlockPatternGrid
                                pattern={detail.securityValue ?? detail.patronDesbloqueo ?? undefined}
                                size={100}
                              />
                              {detail.securityValue ? (
                                <p className="mt-2 font-mono text-xs text-gray-600">
                                  Secuencia: {detail.securityValue.replace(/-/g, " â†’ ")}
                                </p>
                              ) : null}
                            </div>
                          ) : detail.securityType === "pin" ? (
                            <div>
                              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">PIN</p>
                              <p className="font-mono text-base font-semibold text-gray-900">
                                {detail.securityValue ?? detail.pinContrasena ?? "—"}
                              </p>
                            </div>
                          ) : detail.securityType === "password" ? (
                            <div>
                              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                                Contrasena
                              </p>
                              <p className="font-mono text-base font-semibold text-gray-900 break-all">
                                {detail.securityValue ?? detail.pinContrasena ?? "—"}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">—</p>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-amber-800">
                    Solo personal autorizado. No compartir con terceros.
                  </p>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-[#2563eb]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                      Fotos del dispositivo
                    </h3>
                  </div>
                  <RepairPhotoGallery
                    photos={(detail?.fotosSignedUrls ?? []).slice(0, 9).map((url, index) => ({
                      id: `${detail?.id ?? "repair"}-photo-${index}`,
                      url,
                      alt: `Foto ${index + 1}`,
                    }))}
                  />
                </section>
              </div>
            </div>
          </div>
        )}

      </div>

      <AbonoModal
        isOpen={abonoModalOpen}
        repairId={repair?.id ?? null}
        repairFolio={repair?.folio ?? ""}
        estimatedPrice={repair?.estimatedPrice}
        onClose={() => setAbonoModalOpen(false)}
        onSuccess={async (nuevoAnticipo) => {
          setAbonoModalOpen(false)
          setDetail((prev) => (prev ? { ...prev, anticipo: nuevoAnticipo } : prev))
          await refreshDetail()
          if (repair) {
            onRepairUpdated({ ...repair, anticipo: nuevoAnticipo })
          }
        }}
      />

      <PresupuestoEditModal
        isOpen={presupuestoModalOpen}
        repairId={repair?.id ?? null}
        presupuestoActual={presupuestoNum}
        onClose={() => setPresupuestoModalOpen(false)}
        onSuccess={async (nuevoPresupuesto) => {
          setPresupuestoModalOpen(false)
          setPresupuesto(nuevoPresupuesto.toString())
          setDetail((prev) => (prev ? { ...prev, estimatedPrice: nuevoPresupuesto } : prev))
          await refreshDetail()
          if (repair) {
            onRepairUpdated({ ...repair, estimatedPrice: nuevoPresupuesto })
          }
        }}
      />

      {repair ? (
        <ModalEntregaReparacion
          open={entregaModalOpen}
          onOpenChange={setEntregaModalOpen}
          repairId={repair.id}
          folio={repair.folio}
          saldoPendiente={saldoPendiente}
          anticipoActual={anticipoNum}
          estado={estado}
          onCompleted={async (payload) => {
            const page = await getRepairDetailPageData(repair.id)
            if (page.detail) {
              setDetail(page.detail)
              setPresupuesto(page.detail.estimatedPrice?.toString() ?? "")
              setEstado("Entregado")
            }
            setHistory(page.changes ?? [])
            setHistorialAudit(page.historialAudit ?? [])
            setGastos(page.gastos ?? [])
            onRepairUpdated({ ...repair, status: "Entregado" })

            // Solo mostrar ticket de salida para entregas exitosas (no para Sin Reparacion/Cancelado)
            const fueSinReparacion = estado === "Sin Reparacion" || estado === "Cancelado"
            if (!fueSinReparacion) {
              setExitoEntregaSnapshot({
                pagoFinal: payload.pagoFinal,
                anticiposPrevios: anticipoAntesEntregaRef.current,
                detail: page.detail ?? null,
              })
              setExitoEntregaOpen(true)
            }
          }}
        />
      ) : null}

      <ReparacionNoExitosaModal
        open={noExitosaOpen}
        onOpenChange={setNoExitosaOpen}
        tipo={noExitosaTipo}
        onConfirm={confirmarNoExitosa}
      />

      {/* Modal decision LISTO */}
      <Dialog open={listoDecisionOpen} onOpenChange={setListoDecisionOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-lg">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5 text-left">
            <DialogTitle className="text-base font-bold text-slate-900">Â¿Reparacion exitosa?</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Define el resultado antes de marcar como finalizado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-5 py-5">
            <Button
              type="button"
              onClick={() => handleListoDecision(true)}
              className="w-full gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-700"
            >
              <PackageCheck className="h-5 w-5" aria-hidden />
              Si, reparacion exitosa
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleListoDecision(false)}
              className="w-full gap-2 rounded-xl border-slate-200 py-3 text-sm font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
            >
              <AlertTriangle className="h-5 w-5" aria-hidden />
              No, no se pudo reparar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {repair && exitoEntregaSnapshot ? (
        <ModalExitoEntrega
          open={exitoEntregaOpen}
          onClose={() => {
            setExitoEntregaOpen(false)
            setExitoEntregaSnapshot(null)
            onBack()
          }}
          repairId={repair.id}
          detail={exitoEntregaSnapshot.detail as any}
          folio={repair.folio}
          clienteNombre={exitoEntregaSnapshot.detail?.clienteName ?? repair.clienteName}
          clientePhone={exitoEntregaSnapshot.detail?.clientePhone ?? repair.clientePhone}
          equipoLabel={
            `${exitoEntregaSnapshot.detail?.deviceBrand ?? repair.deviceBrand ?? ""} ${exitoEntregaSnapshot.detail?.deviceModel ?? repair.deviceModel ?? ""}`.trim() ||
            "—"
          }
          anticiposPrevios={exitoEntregaSnapshot.anticiposPrevios}
          pagoFinal={exitoEntregaSnapshot.pagoFinal}
        />
      ) : null}

    {repair && detail ? (
      <HealthCheckSheet
        open={healthSheetOpen}
        onOpenChange={setHealthSheetOpen}
        tipo_equipo={detail.tipo_equipo ?? "Otro"}
        value={checklistProDraft}
        onChange={setChecklistProDraft}
        persistRepair={{
          repairId: repair.id,
          save: (d) => updateRepairChecklistPro(repair.id, d),
          onSaved: () => void refreshDetail(),
        }}
      />
    ) : null}

    <StatusChangeConfirmDialog
      open={statusDialogOpen && !!repair}
      onOpenChange={(open) => {
        if (!open && statusPendingKind !== null) return
        setStatusDialogOpen(open)
        if (!open) {
          setPendingEstado(null)
          setStatusNota("")
        }
      }}
      estadoAnteriorLabel={getRepairStatusDisplayLabel(estado)}
      estadoNuevoLabel={pendingEstado ? getRepairStatusDisplayLabel(pendingEstado) : "—"}
      notaTecnica={statusNota}
      onNotaTecnicaChange={setStatusNota}
      onSoloHistorial={() => void confirmStatusChange("historial")}
      onActualizarYWhatsApp={() => void confirmStatusChange("whatsapp")}
      pendingKind={statusPendingKind}
    />
    </>
  )
}



