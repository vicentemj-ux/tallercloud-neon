import { OrdersTable } from "@/components/dashboard/orders-table"
import { NewRepairButton } from "@/components/dashboard/new-repair-button"
import { getDashboardMvpData } from "@/lib/actions/dashboard-prisma"
import { getDashboardSubscriptionBannerContext } from "@/lib/actions/settings-prisma"
import { Button } from "@/components/ui/button"
import {
  Zap, Globe, ArrowRight, TrendingUp, Wrench,
  AlertTriangle, CheckCircle2,
} from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

/**
 * Metricas via `getDashboardMvpData` (Prisma/Neon nativo). No existe tabla `inventario`.
 */
export default async function DashboardPage() {
  let dashboardData: Awaited<ReturnType<typeof getDashboardMvpData>>
  let subCtx: Awaited<ReturnType<typeof getDashboardSubscriptionBannerContext>>
  try {
    // Datos del dashboard sobre Prisma/Neon para no depender del stack legacy de Supabase.
    ;[dashboardData, subCtx] = await Promise.all([
      getDashboardMvpData(),
      getDashboardSubscriptionBannerContext(),
    ])
  } catch (error) {
    console.error("[dashboard] failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    dashboardData = {
      stats: {
        reparacionesTotales: 0,
        recibidas: 0,
        diagnostico: 0,
        enReparacion: 0,
        listas: 0,
        entregadas: 0,
        urgentes: 0,
        ingresosBasicosMes: 0,
      },
      orders: [],
    }
    subCtx = {
      showBanner: true,
      isPro: false,
      planTipo: "activo",
      diasRestantes: 0,
      tieneVencimiento: false,
      precioPlanMensual: null,
      zonaHoraria: null,
    }
  }
  const stats = {
    enProceso: dashboardData.stats.diagnostico + dashboardData.stats.enReparacion + dashboardData.stats.recibidas,
    listos: dashboardData.stats.listas,
    ventasMes: dashboardData.stats.ingresosBasicosMes,
    urgentes: dashboardData.stats.urgentes,
  }

  const showTimezoneBanner = !subCtx.zonaHoraria || subCtx.zonaHoraria === "UTC"

  /**
   * Reglas de visibilidad del banner de suscripcion:
   * - suspendido: siempre visible
   * - prueba: siempre visible (el usuario necesita saber cuantos dias le quedan)
   * - activo con vencimiento: solo cuando faltan ≤ 5 dias (urgencia de renovacion)
   * - activo sin vencimiento: nunca (suscripcion estable)
   */
  const showSubscriptionUrgencyBanner =
    subCtx.planTipo === "suspendido" ||
    subCtx.planTipo === "prueba" ||
    (subCtx.planTipo === "activo" && subCtx.tieneVencimiento && subCtx.diasRestantes <= 5)

  const planCtaHref = "/dashboard/facturacion"

  // Porcentaje visual de tickets activos vs listos
  const totalOps = Math.max(stats.enProceso + stats.listos, 1)
  const pctEnProceso = Math.round((stats.enProceso / totalOps) * 100)

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">

        {/* ── HEADER ── */}
        <header className="flex min-w-0 items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black italic tracking-tight text-slate-900 sm:text-4xl">
              VISTA <span className="text-blue-600">GENERAL</span>
            </h1>
            <p className="mt-1 max-w-full text-sm leading-snug text-slate-500">
              Panorama en tiempo real de operaciones, tickets y desempeno del taller.
            </p>
          </div>
        </header>

        {/* ── Banners de cuenta (suscripcion / zona horaria) ── */}
        {(showSubscriptionUrgencyBanner || showTimezoneBanner) && (
          <section className={`grid gap-3 ${showSubscriptionUrgencyBanner && showTimezoneBanner ? "sm:grid-cols-2" : ""}`}>
            {showSubscriptionUrgencyBanner && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/95 px-4 py-3 shadow-sm ring-1 ring-amber-100/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-white shadow-sm">
                    <Zap className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    {subCtx.planTipo === "suspendido" ? (
                      <p className="text-sm font-semibold text-blue-900">Cuenta suspendida - regulariza tu suscripcion.</p>
                    ) : subCtx.planTipo === "prueba" ? (
                      <p className="text-sm font-semibold text-blue-900">
                        Te quedan <span className="font-black text-blue-700">{subCtx.diasRestantes}</span> {subCtx.diasRestantes === 1 ? "dia" : "dias"} de prueba.
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-blue-900">
                        Tu suscripcion vence en <span className="font-black text-blue-700">{subCtx.diasRestantes}</span> {subCtx.diasRestantes === 1 ? "dia" : "dias"}. Renueva pronto.
                      </p>
                    )}
                  </div>
                </div>
                <Button size="sm" className="shrink-0 h-8 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700" asChild>
                  <Link href={planCtaHref}>Gestionar</Link>
                </Button>
              </div>
            )}
            {showTimezoneBanner && (
              <Link href="/dashboard/configuracion" className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                  <Globe className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Configuracion pendiente</p>
                  <p className="text-sm font-semibold text-slate-700">Configura tu zona horaria</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </Link>
            )}
          </section>
        )}

        {/* ── BENTO GRID ── */}
        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4"
          aria-label="Metricas operativas"
        >

          {/* ── HERO: Ingresos del Mes - col-span-2 row-span-2 ── */}
          <Link
            href="/dashboard/ventas"
            aria-label="Ver ventas e ingresos del mes"
            className="
              col-span-1 sm:col-span-2 lg:row-span-2
              group relative overflow-hidden rounded-3xl
              bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700
              p-6 sm:p-8 text-white shadow-xl shadow-blue-500/20
              transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-500/30
              min-h-[168px] lg:min-h-0
            "
          >
            {/* Decorative circles */}
            <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-12 -right-6 h-64 w-64 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-px w-full bg-white/10" />

            <div className="relative z-10 flex h-full flex-col justify-between gap-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-200">
                  Ingresos del Mes
                </span>
              </div>

              <div>
                <p className="text-4xl font-black tabular-nums leading-none tracking-tight sm:text-6xl">
                  ${stats.ventasMes.toLocaleString("es-MX")}
                </p>
                <p className="mt-2 text-sm text-blue-200/90">
                  Ventas brutas registradas este mes
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-200 transition-colors group-hover:text-white">
                <span>Ver historial de ventas</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {/* ── Equipos Listos ── */}
          <Link
            href="/dashboard/reparaciones"
            aria-label="Ver equipos listos para entregar"
            className="
              group relative overflow-hidden rounded-3xl
              border border-emerald-200 bg-emerald-50
              p-5 sm:p-6
              transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-300
              min-h-[140px]
            "
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-100/60" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400/50" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Listos</p>
                <p className="text-4xl font-black tabular-nums leading-none text-slate-900">{stats.listos}</p>
                <p className="mt-1 text-xs text-emerald-700">Esperando al cliente</p>
              </div>
            </div>
          </Link>

          {/* ── Urgentes ── */}
          <Link
            href="/dashboard/reparaciones?filter=critical"
            aria-label="Ver tickets urgentes"
            className={`
              group relative overflow-hidden rounded-3xl p-5 sm:p-6
              transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md
              min-h-[140px]
              ${stats.urgentes > 0
                ? "border border-red-200 bg-red-50 hover:border-red-300"
                : "border border-slate-200 bg-white hover:border-slate-300"}
            `}
          >
            {stats.urgentes > 0 && (
              <div className="pointer-events-none absolute left-0 inset-y-0 w-1 rounded-l-3xl bg-red-500" />
            )}
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-red-100/40" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stats.urgentes > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                  <AlertTriangle className={`h-5 w-5 ${stats.urgentes > 0 ? "text-red-600" : "text-slate-400"}`} />
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${stats.urgentes > 0 ? "bg-red-500 shadow-sm shadow-red-400/50" : "bg-slate-300"}`} />
              </div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-0.5 ${stats.urgentes > 0 ? "text-red-600" : "text-slate-400"}`}>
                  Urgentes
                </p>
                <p className={`text-4xl font-black tabular-nums leading-none ${stats.urgentes > 0 ? "text-slate-900" : "text-slate-400"}`}>
                  {stats.urgentes}
                </p>
                <p className={`mt-1 text-xs ${stats.urgentes > 0 ? "text-red-700" : "text-slate-400"}`}>
                  7+ dias sin movimiento
                </p>
              </div>
            </div>
          </Link>

          {/* ── Tickets en Cola - col-span-2 ── */}
          <Link
            href="/dashboard/reparaciones?filter=queue"
            aria-label="Ver tickets en cola"
            className="
              col-span-1 sm:col-span-2
              group relative overflow-hidden rounded-3xl
              border border-slate-200 bg-white p-5 sm:p-6
              transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300
            "
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                  <Wrench className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Tickets en Cola</p>
                  <p className="text-4xl font-black tabular-nums leading-tight text-slate-900">{stats.enProceso}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Recibidos y en reparacion activa</p>
                </div>
              </div>

              {/* Mini progress bar visual */}
              <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
                <span className="text-xs text-slate-400">
                  <span className="text-lg font-black text-slate-700">{pctEnProceso}%</span> en proceso
                </span>
                <div className="h-2 w-28 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-700"
                    style={{ width: `${pctEnProceso}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400">de {totalOps} ops. activas</span>
              </div>
            </div>
          </Link>

          {/* ── CTA: Nueva Reparacion - col-span-4 ── */}
          <div className="
              col-span-1 sm:col-span-2 lg:col-span-4
            group relative overflow-hidden rounded-3xl
            bg-slate-900 p-5 sm:p-6
            transition-all duration-200 hover:bg-slate-800
          ">
            {/* Decorative */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute right-0 bottom-0 h-32 w-64 rounded-full bg-blue-600/10" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
                  Accion Rapida
                </p>
                <p className="text-lg font-black text-white leading-tight">
                  Registrar nueva reparacion
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Crea el ticket, asigna tecnico y genera el folio al instante.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <NewRepairButton
                  className="h-11 gap-2 whitespace-nowrap rounded-2xl bg-blue-600 px-6 font-bold uppercase tracking-tight text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25"
                />
              </div>
            </div>
          </div>

        </section>

        {/* ── ACTIVIDAD RECIENTE ── */}
        <section aria-labelledby="dashboard-actividad-heading">
          <h2 id="dashboard-actividad-heading" className="sr-only">
            Actividad reciente de reparaciones
          </h2>
          <OrdersTable orders={dashboardData.orders} />
        </section>

      </div>
    </div>
  )
}
