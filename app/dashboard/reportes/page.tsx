'use client'

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BarChart3, TrendingUp, TrendingDown, Target, DollarSign, Wrench,
  Clock, Package, Trophy, ShoppingCart, CreditCard, Banknote,
  ArrowLeftRight, Search, Printer, Share2,
} from "lucide-react"
import { getReportesData, type ReportesData } from "@/lib/actions/reportes-prisma"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPesos(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return `$${Math.round(n).toLocaleString("es-MX")}`
}

function todayIso()        { return new Date().toISOString().slice(0, 10) }
function firstOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}
function nDaysAgoIso(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function firstOfYearIso() { return `${new Date().getFullYear()}-01-01` }

const PERIODOS = [
  { label: "7 Dias",  desde: () => nDaysAgoIso(6),  hasta: todayIso },
  { label: "Mes",     desde: firstOfMonthIso,         hasta: todayIso },
  { label: "3 Meses", desde: () => nDaysAgoIso(89),  hasta: todayIso },
  { label: "Ano",     desde: firstOfYearIso,          hasta: todayIso },
]

const ESTATUS_BAR: Record<string, string> = {
  "Recibido":      "#3b82f6",
  "Diagnostico":   "#8b5cf6",
  "En Reparacion": "#f59e0b",
  "Listo":         "#10b981",
}

const METODO_COLOR: Record<string, string> = {
  efectivo:      "#10b981",
  tarjeta:       "#3b82f6",
  transferencia: "#8b5cf6",
  mixto:         "#f59e0b",
}

// ─── Skeleton Components ───────────────────────────────────────────────────────

function Sk({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />
}

function SkeletonKPICard() {
  return (
    <Card className="gap-0 py-0 border-slate-200 bg-white">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <Sk className="h-9 w-9 rounded-lg" />
          <Sk className="h-4 w-10" />
        </div>
        <Sk className="h-3 w-24 mb-2" />
        <Sk className="h-8 w-28 mb-2" />
        <Sk className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function SkeletonChart() {
  const heights = [70, 50, 90, 40, 65, 80]
  return (
    <Card className="gap-0 py-0 border-slate-200 bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Sk className="h-5 w-48 mb-2" />
            <Sk className="h-3 w-36" />
          </div>
          <div className="flex gap-4">
            <Sk className="h-3 w-16" />
            <Sk className="h-3 w-20" />
          </div>
        </div>
        <div className="h-44 flex items-end gap-2 mb-3">
          {heights.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: 176 }}>
              <div className="w-full animate-pulse rounded-t-md bg-slate-200" style={{ height: h }} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {heights.map((_, i) => <Sk key={i} className="flex-1 h-3" />)}
        </div>
      </CardContent>
    </Card>
  )
}

function SkeletonInfoCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="gap-0 py-0 border-slate-200 bg-white">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <Sk className="h-8 w-8 rounded-lg" />
          <div>
            <Sk className="h-4 w-32 mb-1" />
            <Sk className="h-3 w-44" />
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1.5">
                <Sk className="h-3 w-36" />
                <Sk className="h-3 w-16" />
              </div>
              <Sk className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const [activePeriodo, setActivePeriodo] = useState(1)
  const [search,   setSearch]   = useState("")
  const [data,     setData]     = useState<ReportesData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const fetchData = useCallback(async (idx: number) => {
    setLoading(true)
    setError(null)
    const p = PERIODOS[idx]
    const { data: d, error: e } = await getReportesData(p.desde(), p.hasta())
    setData(d)
    setError(e)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(1) }, [fetchData])

  const handlePeriodo = (idx: number) => {
    setActivePeriodo(idx)
    fetchData(idx)
  }

  const handlePrint = () => window.print()

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Reporte TallerCloud", url: window.location.href })
    } else {
      await navigator.clipboard.writeText(window.location.href)
      alert("Enlace copiado al portapapeles")
    }
  }

  const maxMes = data ? Math.max(...data.ingresosMensuales.map(m => m.total), 1) : 1

  // Filtrar tecnicos y fallas por busqueda
  const q = search.toLowerCase().trim()
  const filteredFallas  = data ? (q ? data.topFallas.filter(f => f.falla.toLowerCase().includes(q)) : data.topFallas) : []
  const filteredTecs    = data ? (q ? data.eliteSquad.filter(t => t.nombre.toLowerCase().includes(q)) : data.eliteSquad) : []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                <BarChart3 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="italic font-extrabold text-xl tracking-tight text-slate-900 sm:text-2xl">
                  REPORTES <span className="text-blue-600">PRO</span>
                </h1>
                <p className="text-[10px] tracking-widest text-slate-500 font-semibold">
                  VISION FINANCIERA Y OPERATIVA INTEGRADA DEL TALLER
                </p>
                <p className="mt-1 text-sm tracking-tight text-slate-500">
                  Vision Financiera y Operativa Integrada del Taller
                </p>
              </div>
            </div>

          {/* Centro: Busqueda + Period Tabs */}
          <div className="flex flex-1 items-center justify-center gap-3 lg:max-w-xl">
            <div className="relative flex-1 max-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Buscar falla o tecnico..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs border-slate-200 bg-white rounded-lg"
              />
            </div>
            <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1">
              {PERIODOS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handlePeriodo(i)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150
                    ${activePeriodo === i
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Derecha: Acciones */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="h-9 gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="h-9 gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartir
            </Button>
          </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Error al cargar datos: {error}
          </div>
        )}

        {/* ── KPI ROW ── */}
        {loading
          ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:4}).map((_,i)=><SkeletonKPICard key={i}/>)}</div>
          : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Ingresos Totales */}
              <Card className="gap-0 py-0 border-slate-200 bg-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 to-transparent pointer-events-none" />
                <CardContent className="p-5 relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15">
                      <DollarSign className="h-5 w-5 text-blue-600" />
                    </div>
                    <span className={`text-xs font-bold flex items-center gap-0.5
                      ${(data?.crecimientoIngresos ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {(data?.crecimientoIngresos ?? 0) >= 0
                        ? <TrendingUp className="h-3.5 w-3.5" />
                        : <TrendingDown className="h-3.5 w-3.5" />}
                      {Math.abs(data?.crecimientoIngresos ?? 0)}%
                    </span>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Ingresos</p>
                  <p className="text-3xl font-black text-slate-900">{fmtPesos(data?.ingresosTotales ?? 0)}</p>
                  <div className="flex gap-2 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{fmtPesos(data?.ingresosPos ?? 0)}</span>
                    <span className="flex items-center gap-1"><Wrench className="h-3 w-3" />{fmtPesos(data?.ingresosRep ?? 0)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Tickets */}
              <Card className="gap-0 py-0 border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15 mb-3">
                    <Wrench className="h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Tickets</p>
                  <p className="text-3xl font-black text-slate-900">{data?.ticketsTotales ?? 0}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {data?.ticketsCerrados ?? 0} entregados · {(data?.ticketsTotales ?? 0) - (data?.ticketsCerrados ?? 0)} pendientes
                  </p>
                </CardContent>
              </Card>

              {/* Tasa de Cierre */}
              <Card className="gap-0 py-0 border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 mb-3">
                    <Target className="h-5 w-5 text-emerald-600" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Tasa de Cierre</p>
                  <p className="text-3xl font-black text-slate-900">{data?.tasaCierre ?? 0}%</p>
                  <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data?.tasaCierre ?? 0}%` }} />
                  </div>
                </CardContent>
              </Card>

              {/* Ticket Promedio */}
              <Card className="gap-0 py-0 border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 mb-3">
                    <TrendingUp className="h-5 w-5 text-amber-600" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Ticket Promedio</p>
                  <p className="text-3xl font-black text-slate-900">{fmtPesos(data?.ticketPromedio ?? 0)}</p>
                  <p className="text-xs text-slate-400 mt-2">Por reparacion entregada</p>
                </CardContent>
              </Card>
            </div>
          )}

        {/* ── GRAFICO 6 MESES ── */}
        {loading ? <SkeletonChart /> : (
          <Card className="gap-0 py-0 border-slate-200 bg-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-black text-slate-900">Ingresos ultimos 6 meses</h3>
                  <p className="text-xs text-slate-400 mt-0.5">POS + Reparaciones entregadas combinados</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />POS
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-purple-500" />Reparaciones
                  </span>
                </div>
              </div>

              <div className="h-44 flex items-end gap-2 mb-3">
                {(data?.ingresosMensuales ?? []).map((m, i) => {
                  const totalH = maxMes > 0 ? Math.max((m.total / maxMes) * 176, m.total > 0 ? 14 : 4) : 4
                  const posH   = m.total > 0 ? (m.pos / m.total) * totalH : 0
                  const repH   = totalH - posH
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                      {m.total > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10
                          whitespace-nowrap bg-slate-800 text-white text-xs rounded px-2 py-0.5 pointer-events-none">
                          {fmtPesos(m.total)}
                        </div>
                      )}
                      <div className="w-full flex flex-col justify-end" style={{ height: 176 }}>
                        <div className="w-full flex flex-col rounded-t-md overflow-hidden" style={{ height: totalH }}>
                          <div className="w-full bg-purple-500" style={{ height: repH }} />
                          <div className="w-full bg-blue-500"   style={{ height: posH }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2">
                {(data?.ingresosMensuales ?? []).map((m, i) => (
                  <div key={i} className="flex-1 text-center">
                    <p className="text-xs font-semibold text-slate-400">{m.label}</p>
                    {m.total > 0 && <p className="text-xs font-bold text-slate-600">{fmtPesos(m.total)}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── FILA MEDIA: Flujo + Metodos de Pago ── */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Flujo Activo */}
          {loading ? <SkeletonInfoCard rows={3} /> : (
            <Card className="gap-0 py-0 border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15">
                      <Clock className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Flujo Activo</h3>
                      <p className="text-xs text-slate-400">Tickets en proceso ahora</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-900">{data?.totalActivos ?? 0}</p>
                    <p className="text-xs text-slate-400">activos</p>
                  </div>
                </div>

                {(data?.flujoActivo ?? []).length === 0
                  ? (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <Target className="h-7 w-7 text-emerald-400" />
                      <p className="text-sm font-semibold text-emerald-600">Sin tickets pendientes</p>
                    </div>
                  )
                  : (
                    <div className="space-y-3">
                      {(data?.flujoActivo ?? []).map(e => (
                        <div key={e.estatus}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold" style={{ color: ESTATUS_BAR[e.estatus] ?? "#64748b" }}>
                              {e.estatus.toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-500">{e.count} tickets · {e.porcentaje}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${e.porcentaje}%`, background: ESTATUS_BAR[e.estatus] ?? "#64748b" }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {/* Metodos de Pago */}
          {loading ? <SkeletonInfoCard rows={3} /> : (
            <Card className="gap-0 py-0 border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Metodos de Pago</h3>
                    <p className="text-xs text-slate-400">Ventas POS del periodo seleccionado</p>
                  </div>
                </div>

                {(data?.metodosPago ?? []).length === 0
                  ? (
                    <div className="flex flex-col items-center py-6 gap-2">
                      <Search className="h-7 w-7 text-slate-300" />
                      <p className="text-xs text-slate-400 italic">Sin ventas POS en este periodo</p>
                    </div>
                  )
                  : (
                    <div className="space-y-3">
                      {(data?.metodosPago ?? []).map(m => {
                        const color = METODO_COLOR[m.metodo] ?? "#64748b"
                        const icon  = m.metodo === "efectivo" ? <Banknote className="h-3.5 w-3.5 text-white" />
                                    : m.metodo === "tarjeta"  ? <CreditCard className="h-3.5 w-3.5 text-white" />
                                    : m.metodo === "transferencia" ? <ArrowLeftRight className="h-3.5 w-3.5 text-white" />
                                    : <DollarSign className="h-3.5 w-3.5 text-white" />
                        return (
                          <div key={m.metodo} className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                              style={{ background: color }}>
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-slate-700 capitalize">{m.metodo}</span>
                                <span className="text-xs text-slate-400">{fmtPesos(m.total)} · {m.count}x</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${m.porcentaje}%`, background: color }} />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-8 text-right">{m.porcentaje}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── FILA INFERIOR: Fallas + Tecnicos ── */}
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Fallas Mas Frecuentes */}
          {loading ? <SkeletonInfoCard rows={5} /> : (
            <Card className="gap-0 py-0 border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15">
                    <Package className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Fallas Mas Frecuentes</h3>
                    <p className="text-xs text-slate-400">Guia para surtir partes y refacciones</p>
                  </div>
                </div>

                {filteredFallas.length === 0
                  ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <Search className="h-7 w-7 text-slate-300" />
                      <p className="text-xs text-slate-400 italic">
                        {q ? "Sin resultados para la busqueda" : "Sin fallas registradas en el periodo"}
                      </p>
                    </div>
                  )
                  : (() => {
                      const max = filteredFallas[0].count
                      return (
                        <div className="space-y-3">
                          {filteredFallas.map((f, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className={`text-xs font-black w-4 text-center
                                ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-slate-300"}`}>
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-semibold text-slate-700 truncate">{f.falla}</p>
                                  <span className="text-xs text-slate-400 ml-2 shrink-0">{f.count}x</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-400 rounded-full transition-all duration-500"
                                    style={{ width: `${(f.count / max) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
              </CardContent>
            </Card>
          )}

          {/* Rendimiento por Tecnico */}
          {loading ? <SkeletonInfoCard rows={4} /> : (
            <Card className="gap-0 py-0 border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                    <Trophy className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Rendimiento por Tecnico</h3>
                    <p className="text-xs text-slate-400">Reparaciones entregadas en el periodo</p>
                  </div>
                </div>

                {filteredTecs.length === 0
                  ? (
                    <div className="flex flex-col items-center py-8 gap-2">
                      <Search className="h-7 w-7 text-slate-300" />
                      <p className="text-xs text-slate-400 italic">
                        {q ? "Sin resultados para la busqueda" : "Sin reparaciones entregadas en el periodo"}
                      </p>
                    </div>
                  )
                  : (
                    <div className="space-y-3">
                      {filteredTecs.map((t, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shrink-0
                            ${i === 0 ? "bg-amber-100 text-amber-700"
                              : i === 1 ? "bg-slate-100 text-slate-600"
                              : "bg-orange-50 text-orange-600"}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold text-slate-700 truncate">{t.nombre}</p>
                              <span className="text-xs text-slate-400 ml-2 shrink-0">{t.completados} entregas</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                style={{ width: `${t.porcentaje}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 w-8 text-right">{t.porcentaje}%</span>
                        </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
