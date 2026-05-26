"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Truck, Search, Plus, Package, Users, Smartphone, ArrowRight,
  FileText, AlertTriangle,
} from "lucide-react"
import {
  getOrdenes,
} from "@/lib/actions/compras"
import type { OrdenCompra } from "@/lib/actions/compras"
import { ProveedoresModal } from "@/components/dashboard/compras/ProveedoresModal"
import { ReporteModal } from "@/components/dashboard/compras/ReporteModal"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMXN(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 })
}

function fmtDate(s: string | null) {
  if (!s) return "—"
  const d = new Date(s)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function fmtTime(s: string | null) {
  if (!s) return ""
  const d = new Date(s)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()
}

const ESTATUS_CONFIG: Record<string, { label: string; className: string }> = {
  borrador:     { label: "BORRADOR DE AUDITORÍA", className: "bg-slate-100 text-slate-600 border-slate-200" },
  en_transito:  { label: "EN TRÁNSITO",           className: "bg-blue-50 text-blue-700 border-blue-200" },
  pendiente:    { label: "ORDENADO",              className: "bg-blue-50 text-blue-600 border-blue-100" },
  recibida:     { label: "RECIBIDO",              className: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  parcial:      { label: "PARCIAL",               className: "bg-amber-50 text-amber-600 border-amber-100" },
  cancelada:    { label: "CANCELADO",             className: "bg-red-50 text-red-600 border-red-100" },
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComprasPage() {
  const router = useRouter()
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loadingOrdenes, setLoadingOrdenes] = useState(true)
  const [search, setSearch] = useState("")
  const [estatusFiltro, setEstatusFiltro] = useState("todos")
  const [showProvModal, setShowProvModal] = useState(false)
  const [showReporteModal, setShowReporteModal] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOrdenes = useCallback(async () => {
    setLoadingOrdenes(true)
    const { data } = await getOrdenes({ search, estatus: estatusFiltro })
    setOrdenes(data)
    setLoadingOrdenes(false)
  }, [search, estatusFiltro])

  useEffect(() => { fetchOrdenes() }, [fetchOrdenes])

  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => fetchOrdenes(), 400)
  }

  const estatusOptions = [
    { value: "todos", label: "Todos" },
    { value: "borrador", label: "Borradores" },
    { value: "en_transito", label: "En tránsito" },
    { value: "pendiente", label: "Ordenados" },
    { value: "recibida", label: "Recibidos" },
    { value: "cancelada", label: "Cancelados" },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">

        {/* ── HEADER ── */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
              <Truck className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-3xl font-black italic tracking-tight text-slate-900 sm:text-4xl">
                CADENA DE SUMINISTRO
              </h1>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                Logística global y abastecimiento de activos
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/inventario")}
              className="h-9 gap-2 rounded-full border-emerald-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-emerald-700 hover:bg-emerald-50 shadow-sm"
            >
              <Package className="h-3.5 w-3.5" /> Inventario crítico
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowProvModal(true)}
              className="h-9 gap-2 rounded-full border-blue-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-blue-700 hover:bg-blue-50 shadow-sm"
            >
              <Users className="h-3.5 w-3.5" /> Directorio proveedores
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/compras/usados")}
              className="h-9 gap-2 rounded-full border-fuchsia-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-fuchsia-700 hover:bg-fuchsia-50 shadow-sm"
            >
              <Smartphone className="h-3.5 w-3.5" /> Equipos usados
            </Button>
            <Button
              onClick={() => router.push("/dashboard/compras/nueva")}
              className="h-10 gap-2 rounded-full bg-blue-600 px-5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 shadow-sm btn-glow"
            >
              <Plus className="h-4 w-4" /> Generar orden
            </Button>
          </div>
        </header>

        {/* ── Buscador + Filtros ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="BUSCAR EN EL ARCHIVO LOGÍSTICO (ORDEN #, PROVEEDOR...)"
              className="h-12 rounded-full border-slate-200 bg-white pl-11 pr-4 text-sm font-medium uppercase tracking-wider text-slate-800 placeholder:text-slate-300 placeholder:font-normal shadow-sm"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {estatusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEstatusFiltro(opt.value)}
                className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-all border ${
                  estatusFiltro === opt.value
                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tabla de órdenes ── */}
        <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Header de tabla */}
          <div className="hidden sm:grid grid-cols-[1.2fr_1.2fr_140px_1fr_140px_48px] gap-4 px-6 py-4 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Descriptor orden
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Origen suministro
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Estado operativo
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">
              Resumen financiero
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-right">
              Timestamp registro
            </span>
            <span />
          </div>

          {loadingOrdenes ? (
            <div className="p-6 flex flex-col gap-3">
              {[0,1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
            </div>
          ) : ordenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">Sin órdenes de compra</p>
              <p className="text-xs text-slate-400">Crea una nueva orden para abastecer tu inventario.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {ordenes.map((orden) => {
                const cfg = ESTATUS_CONFIG[orden.estatus]
                return (
                  <div
                    key={orden.id}
                    className="group flex flex-col sm:grid sm:grid-cols-[1.2fr_1.2fr_140px_1fr_140px_48px] gap-3 sm:gap-4 px-6 py-5 hover:bg-slate-50/60 transition-colors cursor-pointer items-start sm:items-center"
                    onClick={() => router.push(`/dashboard/compras/${orden.id}`)}
                  >
                    {/* DESCRIPTOR ORDEN */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                        <FileText className="h-5 w-5 text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-slate-900 truncate">{orden.folio}</p>
                        {orden.errores_recepcion && orden.errores_recepcion.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-red-500 mt-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            Requiere atención
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ORIGEN SUMINISTRO */}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{orden.proveedor_nombre}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                        Suministros verificados
                      </p>
                    </div>

                    {/* ESTADO OPERATIVO */}
                    <div>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${cfg.className}`}
                      >
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* RESUMEN FINANCIERO */}
                    <div className="text-right">
                      <p className="text-base font-black text-slate-900 tabular-nums">{fmtMXN(orden.total)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                        {orden.articulos_count ?? 0} artículos auditados
                      </p>
                    </div>

                    {/* TIMESTAMP */}
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-700">{fmtDate(orden.created_at)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{fmtTime(orden.created_at)}</p>
                    </div>

                    {/* ACCIÓN */}
                    <div className="flex items-center justify-end">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-slate-700 transition-colors">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ProveedoresModal open={showProvModal} onClose={() => setShowProvModal(false)} />
      <ReporteModal open={showReporteModal} onClose={() => setShowReporteModal(false)} />
    </div>
  )
}
