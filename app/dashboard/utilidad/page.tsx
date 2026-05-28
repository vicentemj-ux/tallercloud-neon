'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getUtilidadData, type UtilidadData, type TransaccionItem } from "@/lib/actions/utilidad"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPesos(n: number, showSign = false) {
  const abs = Math.abs(Math.round(n))
  const formatted = `$${abs.toLocaleString("es-MX")}`
  if (showSign && n < 0) return `-$${abs.toLocaleString("es-MX")}`
  return formatted
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UtilidadPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonthIso())
  const [dateTo,   setDateTo]   = useState(todayIso())
  const [data,     setData]     = useState<UtilidadData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const fetchData = useCallback(async (desde: string, hasta: string) => {
    setLoading(true)
    setError(null)
    const { data: d, error: e } = await getUtilidadData(desde, hasta)
    setData(d)
    setError(e)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData(firstOfMonthIso(), todayIso())
  }, [fetchData])

  const dash = (v: string) => loading ? "-" : v
  const utilidadNeta = data?.utilidadNeta ?? 0
  const esDeficit    = utilidadNeta < 0

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
              <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black italic text-slate-900">CONTROL DE UTILIDAD</h1>
              <p className="text-sm text-slate-500">Dashboard Financiero de Operacion</p>
            </div>
          </div>

          {/* Date Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-32 border-0 bg-transparent p-0 text-sm text-slate-700 font-medium"
              />
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-32 border-0 bg-transparent p-0 text-sm text-slate-700 font-medium"
              />
              <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <Button
              onClick={() => fetchData(dateFrom, dateTo)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase tracking-wider rounded-xl px-6"
            >
              {loading ? "Cargando..." : "Actualizar"}
            </Button>
            <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-slate-600 shadow-sm">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Main Utilidad Card - como la competencia */}
        <div className="rounded-[2rem] bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 p-8 text-white shadow-xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
            {/* Left: Rendimiento Neto Total */}
            <div className="flex flex-col gap-4 justify-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                Rendimiento Neto Total
              </div>
              <div className={`text-7xl font-black tracking-tight ${esDeficit ? "text-white" : "text-white"}`}>
                {loading ? "-" : fmtPesos(utilidadNeta, true)}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!loading && (
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider
                    ${esDeficit ? "bg-red-500 text-white" : "bg-emerald-400 text-emerald-950"}`}>
                    {esDeficit ? (
                      <>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                        Deficit de Caja
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 9 12 15 6 9" /></svg>
                        Rentable
                      </>
                    )}
                  </div>
                )}
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  Consolidado Real
                </span>
              </div>
            </div>

            {/* Right: 4 Sub Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Ventas Brutas</p>
                <p className="text-3xl font-black text-white mb-1">{dash(fmtPesos(data?.ventasBrutas ?? 0))}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Facturacion Consolidada</p>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Costo Directo</p>
                <p className="text-3xl font-black text-white/80 mb-1">{dash(fmtPesos(data?.costoDeVenta ?? 0))}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Inversion en Venta</p>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Margen Bruto</p>
                <p className="text-3xl font-black text-emerald-300 mb-1">{dash(fmtPesos(data?.margenBruto ?? 0))}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Utilidad Operativa</p>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Gasto General</p>
                <p className="text-3xl font-black text-amber-300 mb-1">{dash(fmtPesos(data?.totalGastos ?? 0))}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Egresos y Servicios</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Cards - 2 columnas como la competencia */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Relacion Ingresos */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <span className="text-lg font-bold text-emerald-600">$</span>
              </div>
              <div>
                <p className="text-sm font-black italic uppercase tracking-wide text-slate-900">Relacion Ingresos</p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Actividad de Cobro</p>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (data?.ingresosItems ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400 italic">Sin ingresos en este rango</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.ingresosItems ?? []).map((item: TransaccionItem) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.descripcion}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {item.fecha}
                        <span className="text-slate-300">*</span>
                        <span className="uppercase">{item.tipo === "venta" ? "Venta POS" : "Reparacion"}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-emerald-600 tabular-nums">
                      +{fmtPesos(item.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Relacion Egresos */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-black italic uppercase tracking-wide text-slate-900">Relacion Egresos</p>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Gastos del Periodo</p>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (data?.egresosItems ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400 italic">Sin egresos en este rango</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.egresosItems ?? []).map((item: TransaccionItem) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.descripcion}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {item.fecha}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-red-500 tabular-nums">
                      -{fmtPesos(item.monto)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
