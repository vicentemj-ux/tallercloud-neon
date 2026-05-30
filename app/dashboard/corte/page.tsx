"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Banknote,
  Calculator,
  CreditCard,
  DollarSign,
  Loader2,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getCajaConDetalle, cerrarCaja, getCajaAbierta } from "@/lib/actions/ventas-prisma"
import { verificarVisitasPendientesCierre, getCurrentTallerIdPublic } from "@/lib/actions/bitacora-visitas-prisma"
import type { CajaRow, CortePrintData } from "@/lib/actions/ventas-prisma"

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CortePage() {
  const router = useRouter()
  const [caja, setCaja] = useState<CajaRow | null>(null)
  const [preview, setPreview] = useState<CortePrintData | null>(null)
  const [montoCierre, setMontoCierre] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [fetching, setFetching] = useState(true)
  const [tallerId, setTallerId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const id = await getCurrentTallerIdPublic()
      setTallerId(id)

      const { caja: c } = await getCajaAbierta()
      if (!c) {
        router.replace("/dashboard")
        return
      }
      setCaja(c)
      const { data } = await getCajaConDetalle(c.id)
      if (data) setPreview(data)
      setFetching(false)
    }
    void init()
  }, [router])

  const totalAbonosEfectivo = preview?.total_abonos_efectivo ?? 0
  const totalAbonosTarjeta = preview?.total_abonos_tarjeta ?? 0
  const totalAbonosTransferencia = preview?.total_abonos_transferencia ?? 0
  const totalGastos = preview?.total_gastos ?? 0

  const totalSistema = caja
    ? caja.monto_inicial + caja.total_efectivo + totalAbonosEfectivo - totalGastos
    : 0
  const totalTarjeta = caja ? caja.total_tarjeta + totalAbonosTarjeta : 0
  const totalTransferencia = caja ? caja.total_transferencia + totalAbonosTransferencia : 0
  const totalVentas = preview?.totalVentasPdv ?? 0

  const diferencia = useMemo(() => {
    const contado = montoCierre ? parseFloat(montoCierre.replace(",", ".")) : null
    return contado !== null && !isNaN(contado) ? contado - totalSistema : null
  }, [montoCierre, totalSistema])

  async function handleCerrar() {
    if (!caja) return
    const val = parseFloat(montoCierre.replace(",", "."))
    if (isNaN(val) || val < 0) {
      setError("Ingresa el monto contado en caja para continuar")
      return
    }

    // Bloquear si hay visitas pendientes desde la apertura de caja
    if (tallerId) {
      const { puedeCerrar, visitasPendientes } = await verificarVisitasPendientesCierre(tallerId, caja.fecha_apertura)
      if (!puedeCerrar) {
        setError(`No puedes cerrar caja: hay ${visitasPendientes} visita(s) pendiente(s) en la Bitacora de Visitas. Registra las atenciones antes de cerrar.`)
        return
      }
    }

    setLoading(true)
    const { error: err } = await cerrarCaja(caja.id, val)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    window.dispatchEvent(new CustomEvent("caja:cerrada"))
    router.push("/dashboard")
  }

  if (fetching) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!caja) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-700 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </button>
            <h1 className="text-3xl font-black italic uppercase tracking-tight text-slate-900">
              CIERRE DE CAJA DIARIO
            </h1>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mt-1">
              RECONCILIACION DE EFECTIVO · {caja.numero_corte ? `CORTE #${String(caja.numero_corte).padStart(3, "0")}` : "CAJA"}
            </p>
          </div>
          <div className="shrink-0">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              TERMINAL ID: CAJA
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Registros Sistema */}
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                <Calculator className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Registros Sistema
              </h2>
            </div>

            <div className="space-y-3">
              <RegistroRow
                icon={<Banknote className="h-4 w-4" />}
                label="FONDO INICIAL"
                value={caja.monto_inicial}
                variant="default"
              />
              <RegistroRow
                icon={<DollarSign className="h-4 w-4" />}
                label="VENTAS EFECTIVO"
                value={caja.total_efectivo}
                variant="green"
              />
              <RegistroRow
                icon={<CreditCard className="h-4 w-4" />}
                label="TARJETA"
                value={totalTarjeta}
                variant="purple"
              />
              <RegistroRow
                icon={<TrendingUp className="h-4 w-4" />}
                label="TRANSFERENCIA"
                value={totalTransferencia}
                variant="cyan"
              />
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  MONTO VENDIDO
                </span>
                <span className="text-2xl font-black text-blue-600">${fmt(totalVentas)}</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                {caja.total_ventas} OPERACIONES CAPTURADAS
              </p>
            </div>
          </div>

          {/* Right: Arqueo Manual */}
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                <DollarSign className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Arqueo Manual
              </h2>
            </div>

            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-slate-500">
                EFECTIVO FISICO EN CAJA
              </Label>
              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                  $
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoCierre}
                  onChange={(e) => {
                    setMontoCierre(e.target.value)
                    setError("")
                  }}
                  className="pl-10 text-2xl font-bold h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-300"
                  placeholder="0.00"
                />
              </div>
            </div>

            {diferencia !== null && (
              <p
                className={`text-xs font-black uppercase tracking-wider ${
                  diferencia === 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                DIFERENCIA: $ {fmt(diferencia)}
              </p>
            )}

            <div>
              <Label className="text-xs font-black uppercase tracking-wider text-slate-500">
                OBSERVACIONES DE AUDITORIA
              </Label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={4}
                className="w-full mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="Anota cualquier novedad..."
              />
            </div>

            {error && (
              <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                {error}
              </p>
            )}

            <Button
              onClick={() => void handleCerrar()}
              disabled={loading}
              className="w-full h-14 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white font-black uppercase tracking-wider text-sm"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "EJECUTAR CIERRE MAESTRO"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RegistroRow({
  icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ReactNode
  label: string
  value: number
  variant?: "default" | "green" | "purple" | "cyan"
}) {
  const variantClasses = {
    default: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
    cyan: "bg-cyan-50 text-cyan-600",
  }
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white border border-slate-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center ${variantClasses[variant]}`}
        >
          {icon}
        </div>
        <span className="text-xs font-black uppercase tracking-wider text-slate-600">
          {label}
        </span>
      </div>
      <span className="text-sm font-black text-slate-900">${fmt(value)}</span>
    </div>
  )
}


