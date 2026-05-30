"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Camera,
  Calendar,
  Clock,
  FileText,
  Loader2,
  MoreHorizontal,
  PlusCircle,
  Phone,
  Search,
  ShoppingBag,
  UserCheck,
  UserIcon,
  UserX,
  Wrench,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getVisitas,
  registrarVisitaManual,
  getCurrentTallerIdPublic,
  type BitacoraVisita,
} from "@/lib/actions/bitacora-visitas-prisma"
import { getMotivoLabel, type MotivoVisita } from "@/lib/utils/visitas"

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

const QUICK_PURPOSES: { value: MotivoVisita; label: string; icon: React.ReactNode }[] = [
  { value: "cotizacion", label: "Cotizacion", icon: <FileText className="h-5 w-5" /> },
  { value: "reparacion", label: "Seguimiento reparacion", icon: <Wrench className="h-5 w-5" /> },
  { value: "personal", label: "Personal", icon: <UserIcon className="h-5 w-5" /> },
  { value: "venta", label: "Buscar equipo / accesorio", icon: <ShoppingBag className="h-5 w-5" /> },
  { value: "otro", label: "Otro", icon: <MoreHorizontal className="h-5 w-5" /> },
]

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
    getCurrentTallerIdPublic().then((id) => {
      if (id) {
        setTallerId(id)
      } else {
        setTallerIdError(true)
        setLoading(false)
      }
    })
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
              <RegistrarVisitaButton
                tallerId={tallerId}
                onRegistrada={() => {
                  if (tallerId) {
                    const estado = filter === "todos" ? undefined : filter
                    void getVisitas({
                      tallerId,
                      estado,
                      desde: desde ? `${desde}T00:00:00` : undefined,
                      hasta: hasta ? `${hasta}T23:59:59` : undefined,
                      limite: 500,
                    }).then(({ data }) => setVisitas(data))
                  }
                }}
              />
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
            <span className="text-xs text-slate-400">-</span>
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

        {/* Lista agrupada por dia */}
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
              <p className="text-xs text-slate-400 mt-1">Asegurate de haber iniciado sesion correctamente.</p>
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
              <p className="text-sm font-medium text-slate-400">No hay registros de visitas en este periodo</p>
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
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Foto</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Hora</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Estado</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Cliente</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Contacto</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Motivo</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Atendido por</th>
                        <th className="px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Vinculo</th>
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
                              {v.cliente_nombre || "-"}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {v.cliente_telefono ? (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${v.cliente_telefono}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                              >
                                <Phone className="h-3 w-3" />
                                {v.cliente_telefono}
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
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
                              {v.atendido_por || "-"}
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

/* ─── Registrar Visita Button + Modal ─── */

function RegistrarVisitaButton({
  tallerId,
  onRegistrada,
}: {
  tallerId: string | null
  onRegistrada: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!tallerId}
        className="h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider btn-glow"
      >
        <PlusCircle className="h-4 w-4" />
        Registrar Visita
      </Button>
      {open && (
        <RegistrarVisitaModal
          onClose={() => setOpen(false)}
          onRegistrada={() => {
            setOpen(false)
            onRegistrada()
          }}
        />
      )}
    </>
  )
}

function RegistrarVisitaModal({
  onClose,
  onRegistrada,
}: {
  onClose: () => void
  onRegistrada: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoVisita | null>(null)
  const [motivoOtro, setMotivoOtro] = useState("")
  const [clienteNombre, setClienteNombre] = useState("")
  const [clienteTelefono, setClienteTelefono] = useState("")
  const [notas, setNotas] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!motivo) {
      toast.error("Selecciona un motivo de visita")
      return
    }
    if (motivo === "otro" && !motivoOtro.trim()) {
      toast.error("Especifica el motivo")
      return
    }

    setSaving(true)
    const { success, error, visita } = await registrarVisitaManual({
      motivoVisita: motivo,
      motivoOtro: motivo === "otro" ? motivoOtro : undefined,
      notas: notas || undefined,
      clienteNombre: clienteNombre.trim() || undefined,
      clienteTelefono: clienteTelefono.trim() || undefined,
    })
    setSaving(false)

    if (!success) {
      toast.error(error || "Error al registrar visita")
      return
    }

    toast(
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-100 flex items-center justify-center">
          <Camera className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/90">Visita Registrada</p>
          <p className="text-[11px] text-white/60 font-medium">
            {getMotivoLabel(motivo)}
            {clienteNombre ? ` - ${clienteNombre}` : ""}
          </p>
        </div>
      </div>,
      { duration: 4000 }
    )

    setMotivo(null)
    setMotivoOtro("")
    setClienteNombre("")
    setClienteTelefono("")
    setNotas("")
    onRegistrada()
  }, [motivo, motivoOtro, clienteNombre, clienteTelefono, notas, onRegistrada])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Header con placeholder */}
        <div className="relative h-44 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/80">
            <Camera className="h-12 w-12" />
            <span className="text-[10px] font-black uppercase tracking-widest">Sin camara</span>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-3 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
            NUEVA VISITA MANUAL
          </div>
        </div>

        <div className="p-5 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
            Motivo de la visita
          </h3>

          {/* Quick-purpose buttons */}
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PURPOSES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setMotivo(p.value)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-bold transition-all ${
                  motivo === p.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className={motivo === p.value ? "text-blue-500" : "text-slate-400"}>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>

          {motivo === "otro" && (
            <input
              type="text"
              value={motivoOtro}
              onChange={(e) => setMotivoOtro(e.target.value)}
              placeholder="Especifica el motivo..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          )}

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                Nombre del cliente
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  placeholder="Ej: Juan Perez"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                Telefono
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  placeholder="Ej: 5512345678"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Notas */}
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Notas adicionales (opcional)..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />

          <Button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-xs btn-glow"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Registrar Visita"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Estado Badge ─── */

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

/* ─── Stat Badge ─── */

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
