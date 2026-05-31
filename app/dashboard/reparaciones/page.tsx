"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getRepairsByTallerId, type BitacoraRepair } from "@/lib/actions/repairs-prisma"
import { useDataFetchPerf } from "@/hooks/use-data-fetch-perf"
import { BitacoraTable } from "@/components/dashboard/bitacora-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2,
  Plus,
  Wrench,
  ClipboardList,
  CircleAlert,
  Clock,
  BadgeCheck,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { ReparacionEditDialog } from "@/components/dashboard/reparacion-edit-dialog"
import { cn } from "@/lib/utils"

const OPEN_NEW_TICKET_PARAM = "openNewTicket"
const EDIT_TICKET_PARAM     = "editTicket"
const FILTER_PARAM          = "filter"
const SEVEN_DAYS_MS         = 7 * 24 * 60 * 60 * 1000

// ── KPI cards config ──────────────────────────────────────────────────────────
const STATUS_CARDS = [
  {
    id:         "all",
    label:      "Total",
    sublabel:   "Todas las ordenes",
    values:     [] as string[],
    Icon:       ClipboardList,
    iconBg:     "bg-slate-100",
    iconColor:  "text-slate-600",
    countColor: "text-slate-900",
    ring:       "ring-2 ring-slate-400 border-slate-300",
    activeBg:   "bg-slate-50",
  },
  {
    id:         "recibido",
    label:      "Recibidos",
    sublabel:   "Sin iniciar",
    values:     ["Recibido"],
    Icon:       CircleAlert,
    iconBg:     "bg-orange-100",
    iconColor:  "text-orange-600",
    countColor: "text-orange-600",
    ring:       "ring-2 ring-orange-400 border-orange-300",
    activeBg:   "bg-orange-50/60",
  },
  {
    id:         "diagnostico",
    label:      "Diagnostico",
    sublabel:   "En revision",
    values:     ["Diagnostico"],
    Icon:       Clock,
    iconBg:     "bg-amber-100",
    iconColor:  "text-amber-600",
    countColor: "text-amber-600",
    ring:       "ring-2 ring-amber-400 border-amber-300",
    activeBg:   "bg-amber-50/60",
  },
  {
    id:         "en-reparacion",
    label:      "En Proceso",
    sublabel:   "En reparacion activa",
    values:     ["En Reparacion"],
    Icon:       Wrench,
    iconBg:     "bg-blue-100",
    iconColor:  "text-blue-600",
    countColor: "text-blue-600",
    ring:       "ring-2 ring-blue-400 border-blue-300",
    activeBg:   "bg-blue-50/60",
  },
  {
    id:         "listo",
    label:      "Listos",
    sublabel:   "Esperando entrega",
    values:     ["Listo"],
    Icon:       BadgeCheck,
    iconBg:     "bg-emerald-100",
    iconColor:  "text-emerald-600",
    countColor: "text-emerald-600",
    ring:       "ring-2 ring-emerald-400 border-emerald-300",
    activeBg:   "bg-emerald-50/60",
  },
  {
    id:         "reingreso",
    label:      "Reingresos",
    sublabel:   "Garantias / retornos",
    values:     ["Reingreso"],
    Icon:       RotateCcw,
    iconBg:     "bg-orange-100",
    iconColor:  "text-orange-600",
    countColor: "text-orange-600",
    ring:       "ring-2 ring-orange-400 border-orange-300",
    activeBg:   "bg-orange-50/60",
  },
] as const

// ─────────────────────────────────────────────────────────────────────────────

function ReparacionesContent() {
  const { startFetch, stopFetch } = useDataFetchPerf("reparaciones")
  const router                    = useRouter()
  const searchParams              = useSearchParams()
  const filterParam               = searchParams.get(FILTER_PARAM)
  const filterPreset =
    filterParam === "queue" ? "queue" : filterParam === "critical" ? "critical" : null

  const [repairs, setRepairs]                       = useState<BitacoraRepair[]>([])
  const [isLoading, setIsLoading]                   = useState(true)
  const [showNewTicketModal, setShowNewTicketModal]  = useState(false)
  const [editingRepairId, setEditingRepairId]        = useState<string | null>(null)
  const [searchTerm, setSearchTerm]                  = useState("")
  const [debouncedSearch, setDebouncedSearch]        = useState("")
  const [activeStatusId, setActiveStatusId]          = useState("all")
  const [page, setPage]                              = useState(0)
  const [totalRepairs, setTotalRepairs]              = useState(0)
  const [refreshKey, setRefreshKey]                  = useState(0)
  const PAGE_SIZE = 50

  // Estatus para query SQL - derivado de la tarjeta activa
  const estatusFilter = useMemo(() => {
    const card = STATUS_CARDS.find((c) => c.id === activeStatusId)
    return card && card.values.length > 0 ? card.values[0] : undefined
  }, [activeStatusId])

  // URL param: ?openNewTicket=1
  useEffect(() => {
    if (searchParams.get(OPEN_NEW_TICKET_PARAM) === "1") {
      setEditingRepairId(null)
      setShowNewTicketModal(true)
      router.replace("/dashboard/reparaciones", { scroll: false })
    }
  }, [searchParams, router])

  // URL param: ?editTicket={id}
  useEffect(() => {
    const ticketId = searchParams.get(EDIT_TICKET_PARAM)
    if (ticketId) {
      setEditingRepairId(ticketId)
      setShowNewTicketModal(true)
      router.replace("/dashboard/reparaciones", { scroll: false })
    }
  }, [searchParams, router])

  // URL preset: ?filter=queue → pre-selecciona "En Proceso"
  useEffect(() => {
    if (filterPreset === "queue") setActiveStatusId("en-reparacion")
  }, [filterPreset])

  // Debounce busqueda 300ms + reset pagina al cambiar busqueda
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(0)
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => clearTimeout(id)
  }, [searchTerm])

  // Load repairs - busqueda y estatus empujados a SQL (server-side)
  useEffect(() => {
    const loadRepairs = async () => {
      setIsLoading(true)
      startFetch()
      try {
        const result = await getRepairsByTallerId(
          page,
          PAGE_SIZE,
          debouncedSearch || undefined,
          estatusFilter
        )
        setRepairs(result.data || [])
        setTotalRepairs(result.total)
      } catch (error) {
        console.error("Error loading repairs:", error)
      } finally {
        setIsLoading(false)
        stopFetch()
      }
    }
    loadRepairs()
  }, [page, debouncedSearch, estatusFilter, refreshKey, startFetch, stopFetch])

  // Count per status
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of repairs) c[r.status] = (c[r.status] ?? 0) + 1
    return c
  }, [repairs])

  // "Total" usa el conteo real del servidor (count: planned); los demas cuentan la pagina actual
  const cardCount = (card: (typeof STATUS_CARDS)[number]) =>
    card.values.length === 0
      ? totalRepairs
      : card.values.reduce((sum, v) => sum + (statusCounts[v] ?? 0), 0)

  // Click KPI card: toggle (deselects si ya esta activo → vuelve a "all"); resetea pagina
  const handleCardClick = (id: string) => {
    setPage(0)
    setActiveStatusId((prev) => (prev === id ? "all" : id))
  }

  // Filtrado solo para "critical" (por antiguedad) - busqueda y estatus ya van server-side
  const filteredRepairs = useMemo(() => {
    if (filterParam !== "critical") return repairs
    return repairs.filter((r) => {
      if (r.status === "Entregado" || r.status === "Cancelado") return false
      const raw = r.updatedAtRaw
      if (!raw) return false
      return Date.now() - new Date(raw).getTime() > SEVEN_DAYS_MS
    })
  }, [repairs, filterParam])

  const handleRepairUpdated = (updated: BitacoraRepair) =>
    setRepairs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))

  const handleRepairDeleted = (repairId: string) =>
    setRepairs((prev) => prev.filter((r) => r.id !== repairId))

  const handleNewTicketSuccess = (_newRepairId: string) => {
    setShowNewTicketModal(false)
    setPage(0)
    setRefreshKey((k) => k + 1)
  }

  const hasActiveFilter = searchTerm || activeStatusId !== "all"

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: icon + title */}
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 shrink-0">
                <Wrench className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="italic font-extrabold text-xl tracking-tight text-slate-900 sm:text-2xl">
                    REPARACIONES
                  </h1>
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-bold text-slate-600 tabular-nums">
                    {totalRepairs.toLocaleString("es-MX")} ordenes
                  </span>
                </div>
                <p className="text-[10px] tracking-widest text-slate-500 font-semibold">
                  GESTION DE ORDENES Y SERVICIOS TECNICOS
                </p>
                <p className="mt-1 text-sm tracking-tight text-slate-500">
                  Flujo operativo en tiempo real para recepcion, diagnostico y entrega.
                </p>
              </div>
            </div>

            {/* Right: search + Nuevo Ticket */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56 lg:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  placeholder="Buscar folio o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-8 text-base placeholder:text-slate-400 transition-colors focus:bg-white md:text-sm"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Limpiar busqueda"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button
                onClick={() => {
                  setEditingRepairId(null)
                  setShowNewTicketModal(true)
                }}
                className="h-11 shrink-0 gap-2 rounded-xl px-4 font-semibold tracking-tight"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nuevo Ticket</span>
                <span className="sm:hidden">Nuevo</span>
              </Button>
            </div>
          </div>
        </div>

        <ReparacionEditDialog
          open={showNewTicketModal}
          onOpenChange={(open) => {
            setShowNewTicketModal(open)
            if (!open) setEditingRepairId(null)
          }}
          editingRepairId={editingRepairId}
          onEditSuccess={handleNewTicketSuccess}
        />

        {/* ── KPI Cards (6 operativos - Total movido al header) ────────────── */}
        {!isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {STATUS_CARDS.filter((c) => c.id !== "all").map((card) => {
              const isActive = activeStatusId === card.id
              const count    = cardCount(card)
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardClick(card.id)}
                  className={cn(
                    "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
                    "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
                    isActive ? cn(card.ring, card.activeBg) : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", card.iconBg)}>
                    <card.Icon className={cn("h-4 w-4 transition-transform duration-200 group-hover:scale-110", card.iconColor)} aria-hidden />
                  </div>
                  <p className={cn("text-2xl font-bold tabular-nums tracking-tight transition-colors", card.countColor)}>
                    {count.toLocaleString("es-MX")}
                  </p>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">
                      {card.label}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{card.sublabel}</p>
                  </div>
                  {isActive && (
                    <span className="self-start rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 ring-1 ring-slate-200">
                      Activo
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Reset filter hint ─────────────────────────────────────────────── */}
        {!isLoading && hasActiveFilter && (
          <div className="flex items-center gap-2 -mt-4 text-xs text-slate-400">
            <span>
              {filteredRepairs.length} resultado{filteredRepairs.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => { setSearchTerm(""); setActiveStatusId("all") }}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors font-medium"
            >
              <X className="h-3 w-3" /> Limpiar filtros
            </button>
          </div>
        )}

        {/* ── Table / Loading ───────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white py-16 gap-3 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            <p className="text-sm tracking-tight text-slate-500">Cargando reparaciones...</p>
          </div>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <BitacoraTable
                repairs={filteredRepairs}
                onRepairUpdated={handleRepairUpdated}
                onRepairDeleted={handleRepairDeleted}
                onEditTicket={(repair) => {
                  setEditingRepairId(repair.id)
                  setShowNewTicketModal(true)
                }}
              />
            </div>
            {totalRepairs > PAGE_SIZE && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                <span>
                  Mostrando {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalRepairs)} de {totalRepairs}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-2xl border-slate-200" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl border-slate-200"
                    disabled={(page + 1) * PAGE_SIZE >= totalRepairs}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ReparacionesPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ReparacionesContent />
    </Suspense>
  )
}
