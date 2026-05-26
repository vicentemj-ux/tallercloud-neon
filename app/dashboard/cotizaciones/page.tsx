"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, Lock } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { CotizacionesHeader } from "@/components/dashboard/cotizaciones/cotizaciones-header"
import { CotizacionesStats } from "@/components/dashboard/cotizaciones/cotizaciones-stats"
import { CotizacionesToolbar, type FiltroCotizaciones } from "@/components/dashboard/cotizaciones/cotizaciones-toolbar"
import { CotizacionesEmptyState } from "@/components/dashboard/cotizaciones/cotizaciones-empty-state"
import { CotizacionesList } from "@/components/dashboard/cotizaciones/cotizaciones-list"
import { CotizacionForm } from "@/components/dashboard/cotizaciones/cotizacion-form"
import { CotizacionDetail } from "@/components/dashboard/cotizaciones/cotizacion-detail"
import {
  buildCotizacionWhatsAppLink,
  convertirCotizacionAReparacion,
  createCotizacion,
  getCotizaciones,
  setCotizacionEstado,
  type Cotizacion,
  type CotizacionInput,
  updateCotizacion,
} from "@/lib/actions/cotizaciones"
import { getEsUsuarioPro } from "@/lib/actions/auth"

export default function CotizacionesPage() {
  const [isPro, setIsPro] = useState(false)
  const [checkingPro, setCheckingPro] = useState(true)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filtro, setFiltro] = useState<FiltroCotizaciones>("todas")
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editing, setEditing] = useState<Cotizacion | null>(null)
  const [selected, setSelected] = useState<Cotizacion | null>(null)

  const loadCotizaciones = async (nextFiltro = filtro, nextSearch = search) => {
    setLoading(true)
    const { data, error } = await getCotizaciones({ estado: nextFiltro, search: nextSearch })
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error })
    } else {
      setCotizaciones(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const pro = await getEsUsuarioPro()
      if (!cancelled) {
        setIsPro(Boolean(pro))
        setCheckingPro(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (checkingPro || !isPro) return
    loadCotizaciones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingPro, isPro])

  const stats = useMemo(() => {
    const total = cotizaciones.length
    const pendientes = cotizaciones.filter((cot) => cot.estado === "pendiente").length
    const aceptadas = cotizaciones.filter((cot) => cot.estado === "aceptada").length
    const rechazadas = cotizaciones.filter((cot) => cot.estado === "rechazada").length
    return { total, pendientes, aceptadas, rechazadas }
  }, [cotizaciones])

  const handleSave = async (input: CotizacionInput) => {
    const result = editing ? await updateCotizacion(editing.id, input) : await createCotizacion(input)
    if (result.error) {
      toast({ variant: "destructive", title: "Error", description: result.error })
      return
    }
    toast({ title: editing ? "Cotizacion actualizada" : "Cotizacion creada" })
    setEditing(null)
    await loadCotizaciones()
  }

  const handleWhatsApp = async (cotizacion: Cotizacion) => {
    const { url, error } = await buildCotizacionWhatsAppLink(cotizacion)
    if (error || !url) {
      toast({ variant: "destructive", title: "WhatsApp", description: error || "No se pudo abrir WhatsApp." })
      return
    }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const handleConvert = async (cotizacion: Cotizacion) => {
    const res = await convertirCotizacionAReparacion(cotizacion.id)
    if (!res.success) {
      toast({ variant: "destructive", title: "Conversión", description: res.error || "No se pudo convertir." })
      return
    }
    toast({ title: "Cotizacion convertida", description: `Se creo la reparacion ${res.folioReparacion ?? ""}`.trim() })
    await loadCotizaciones()
  }

  const handleSetEstado = async (cotizacion: Cotizacion, estado: "aceptada" | "rechazada") => {
    const { error } = await setCotizacionEstado(cotizacion.id, estado)
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error })
      return
    }
    toast({ title: "Estado actualizado", description: `Cotizacion marcada como ${estado}.` })
    await loadCotizaciones()
  }

  if (checkingPro) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center px-4 py-8 text-sm text-slate-500">
          Validando acceso PRO...
        </div>
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <CotizacionesHeader onCreate={() => {}} />
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <Lock className="h-7 w-7 text-slate-500" />
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-900">Modulo disponible en PLAN PRO</h2>
            <p className="mt-2 text-sm text-slate-500">
              Activa tu plan PRO para generar cotizaciones y convertirlas a reparacion en un clic.
            </p>
            <Button className="btn-glow mt-5 h-11 rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700" asChild>
              <a href="/dashboard/facturacion">Ir a Mi suscripcion</a>
            </Button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <CotizacionesHeader
          onCreate={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        />

        <CotizacionesStats stats={stats} />

        <CotizacionesToolbar
          search={search}
          onSearch={async (value) => {
            setSearch(value)
            await loadCotizaciones(filtro, value)
          }}
          filtro={filtro}
          onFiltro={async (value) => {
            setFiltro(value)
            await loadCotizaciones(value, search)
          }}
        />

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            Cargando cotizaciones...
          </section>
        ) : cotizaciones.length === 0 ? (
          <CotizacionesEmptyState
            onCreate={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          />
        ) : (
          <CotizacionesList
            data={cotizaciones}
            onDetail={(cotizacion) => {
              setSelected(cotizacion)
              setDetailOpen(true)
            }}
            onEdit={(cotizacion) => {
              setEditing(cotizacion)
              setFormOpen(true)
            }}
            onWhatsApp={handleWhatsApp}
            onConvert={handleConvert}
            onSetAceptada={(cotizacion) => handleSetEstado(cotizacion, "aceptada")}
            onSetRechazada={(cotizacion) => handleSetEstado(cotizacion, "rechazada")}
          />
        )}
      </div>

      <CotizacionForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        initial={editing}
        onSubmit={handleSave}
      />

      <CotizacionDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        cotizacion={selected}
      />
    </div>
  )
}
