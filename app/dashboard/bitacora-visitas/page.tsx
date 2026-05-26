"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  Calendar,
  Clock,
  Loader2,
  Search,
  UserCheck,
  UserX,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getVisitas, type BitacoraVisita } from "@/lib/actions/bitacora-visitas"
import { getMotivoLabel } from "@/lib/utils/visitas"

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtDateFull(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function groupByDay(visitas: BitacoraVisita[]): Map<string, BitacoraVisita[]> {
  const map = new Map<string, BitacoraVisita[]>()
  for (const v of visitas) {
    const day = v.fecha_hora_entrada.slice(0, 10)
    const list = map.get(day) || []
    list.push(v)
    map.set(day, list)
  }
  return map
}

export default function BitacoraVisitasPage() {
  const router = useRouter()
  const [visitas, setVisitas] = useState<BitacoraVisita[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"todos" | "pendiente" | "atendido" | "se_fue">("todos")
  const [tallerId, setTallerId] = useState<string | null>(null)
  const [tallerIdError, setTallerIdError] = useState(false)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [photoZoom, setPhotoZoom] = useState<string | null>(null)

  useEffect(() => {
    const match = document.cookie.match(/tallerId=([^;]+)/)
    const id = match ? decodeURIComponent(match[1]) : null
    if (id) {
      setTallerId(id)
    } else {
      setTallerIdError(true)
      setLoading(false)
    }
    const hoy = toLocalDateStr(new Date())
    setDesde(hoy)
    setHasta(hoy)
  }, [])

  useEffect(() => {
    if (!tallerId) return
    async function load(id: string) {
      setLoading(true)
      try {
        const estado = filter === "todos" ? undefined : filter
        const { data } = await getVisitas({
          tallerId: id,
          estado,
          desde: desde ? `${desde}T00:00:00` : undefined,
          hasta: hasta ? `${hasta}T23:59:59` : undefined,
          limite: 500,
        })
        setVisitas(data)
      } catch {
        setVisitas([])
      } finally {
        setLoading(false)
      }
    }
    void load(tallerId)
  }, [tallerId, filter, desde, hasta])

  const grouped = useMemo(() => groupByDay(visitas), [visitas])

  const stats = {
    total: visitas.length,
    pendientes: visitas.filter((v) => v.estado_atencion === "pendiente").length,
    atendidos: visitas.filter((v) => v.estado_atencion === "atendido").length,
    seFueron: visitas.filter((v) => v.estado_atencion === "se_fue").length,
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                <Camera className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-extrabold italic tracking-tight text-slate-900">
                    BITACORA DE VISITAS
                  </h1>
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-bold text-slate-600 tabular-nums">
                    {stats.total.toLocaleString("es-MX")} visitas
                  </span>
                </div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-500">
                  DETECCION AUTOMATICA DE CLIENTES
                </p>
                <p className="mt-1 text-sm tracking-tight text-slate-500">
                  Control diario de entradas, motivos de visita y atencion del equipo.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <StatBadge label="Pendientes" value={stats.pendientes} color="red" />
              <StatBadge label="Atendidos" value={stats.atendidos} color="emerald" />
              <StatBadge label="Se fueron" value={stats.seFueron} color="slate" />
            </div>
          </div>
        </div>

        {/* Filtros: fecha + estado */}
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 w-40 rounded-xl border-slate-200 bg-white text-xs font-semibold px-3"
            />
            <span className="text-xs text-slate-400">—</span>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="h-9 w-40 rounded-xl border-slate-200 bg-white text-xs font-semibold px-3"
            />
          </div>
          <div className="h-6 w-px bg-slate-200 hidden sm:block" />
          <div className="flex flex-wrap gap-2">
            {([
              { key: "todos", label: "Todos" },
              { key: "pendiente", label: "Pendientes" },
              { key: "atendido", label: "Atendidos" },
              { key: "se_fue", label: "Se fueron" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-wider transition-all border ${
                  filter === f.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista agrupada por día */}
        <div className="space-y-6">
          {loading ? (
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-12 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm text-slate-400 mt-3 font-medium">Cargando visitas...</p>
            </div>
          ) : tallerIdError ? (
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-12 text-center">
              <XCircle className="mx-auto h-8 w-8 text-red-400 mb-3" />
              <p className="text-sm font-bold text-slate-700">No se pudo identificar el taller</p>
              <p className="text-xs text-slate-400 mt-1">Asegúrate de haber iniciado sesión correctamente.</p>
              <Button
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                onClick={() => router.push("/dashboard")}
              >
                Volver al inicio
              </Button>
            </div>
          ) : visitas.length === 0 ? (
            <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-12 text-center">
              <Search className="mx-auto h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-400">No hay registros de visitas en este período</p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([day, dayVisitas]) => (
              <div key={day} className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-tight text-slate-700">
                    {fmtDateFull(`${day}T12:00:00`)}
                  </h2>
                  <span className="text-[10px] font-bold text-slate-400">
                    {dayVisitas.length} visita{dayVisitas.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30">
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Foto
                        </th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Hora
                        </th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Estado
                        </th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Motivo
                        </th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Atendido por
                        </th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Vínculo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {dayVisitas.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => v.foto_entrada_url && setPhotoZoom(v.foto_entrada_url)}
                              className="h-14 w-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 block relative group"
                              disabled={!v.foto_entrada_url}
                            >
                              {v.foto_entrada_url ? (
                                <>
                                  <img
                                    src={v.foto_entrada_url}
                                    alt="Entrada"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                    <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-300">
                                  <Camera className="h-5 w-5" />
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-xs font-black text-slate-900">{fmtTime(v.fecha_hora_entrada)}</div>
                            {v.fecha_hora_salida && (
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                Salida: {fmtTime(v.fecha_hora_salida)}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <EstadoBadge estado={v.estado_atencion} />
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-xs font-bold text-slate-700">
                              {getMotivoLabel(v.motivo_visita)}
                            </div>
                            {v.motivo_otro && (
                              <div className="text-[10px] text-slate-500">{v.motivo_otro}</div>
                            )}
                            {v.notas && (
                              <div className="text-[10px] text-slate-400 mt-0.5 italic max-w-[200px] truncate" title={v.notas}>
                                {v.notas}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="text-xs font-bold text-slate-600">
                              {v.atendido_por || "—"}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-1">
                              {v.reparacion_folio && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">
                                  Rep #{v.reparacion_folio}
                                </span>
                              )}
                              {v.venta_folio && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                                  Venta #{v.venta_folio}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Lightbox para foto ampliada */}
      {photoZoom && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPhotoZoom(null)}
        >
          <button
            type="button"
            onClick={() => setPhotoZoom(null)}
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={photoZoom}
            alt="Foto de entrada"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { text: string; icon: React.ReactNode; classes: string }> = {
    pendiente: {
      text: "Pendiente",
      icon: <Clock className="h-3 w-3" />,
      classes: "bg-amber-50 text-amber-600 border-amber-100",
    },
    atendido: {
      text: "Atendido",
      icon: <UserCheck className="h-3 w-3" />,
      classes: "bg-emerald-50 text-emerald-600 border-emerald-100",
    },
    no_atendido: {
      text: "No atendido",
      icon: <XCircle className="h-3 w-3" />,
      classes: "bg-red-50 text-red-600 border-red-100",
    },
    se_fue: {
      text: "Se fue",
      icon: <UserX className="h-3 w-3" />,
      classes: "bg-slate-100 text-slate-500 border-slate-200",
    },
  }

  const config = map[estado] || map.pendiente

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${config.classes}`}
    >
      {config.icon}
      {config.text}
    </span>
  )
}

function StatBadge({ label, value, color }: { label: string; value: number; color: "slate" | "red" | "emerald" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-50 text-red-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }
  return (
    <div className={`rounded-2xl px-4 py-2 text-center ${colors[color]}`}>
      <div className="text-lg font-black leading-none">{value}</div>
      <div className="text-[9px] font-black uppercase tracking-wider mt-1 opacity-70">{label}</div>
    </div>
  )
}
