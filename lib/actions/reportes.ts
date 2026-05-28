"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlujoEstatus {
  estatus: string
  count: number
  porcentaje: number
}

export interface MesIngresos {
  label: string        // "ENE", "FEB", etc.
  pos: number
  reparaciones: number
  total: number
}

export interface FallaTop {
  falla: string
  count: number
}

export interface TecnicoTop {
  nombre: string
  completados: number
  porcentaje: number
}

export interface MetodoPago {
  metodo: string
  total: number
  count: number
  porcentaje: number
}

export interface ReportesData {
  ingresosTotales: number
  ingresosPos: number
  ingresosRep: number
  ticketsTotales: number
  ticketsCerrados: number
  tasaCierre: number
  ticketPromedio: number
  crecimientoIngresos: number
  flujoActivo: FlujoEstatus[]
  totalActivos: number
  ingresosMensuales: MesIngresos[]
  metodosPago: MetodoPago[]
  topFallas: FallaTop[]
  eliteSquad: TecnicoTop[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES_CORTO    = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"]
const ESTATUS_ACTIVOS = ["Recibido", "Diagnostico", "En Reparacion", "Listo"]
const FALLA_SKIP     = new Set(["sin asignar", "no aplica", "n/a", "ninguna", "pendiente", ""])

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getReportesData(
  desde: string,  // YYYY-MM-DD
  hasta: string,  // YYYY-MM-DD
): Promise<{ data: ReportesData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const now     = new Date()
  const desdeTs = `${desde}T00:00:00`
  const hastaTs = `${hasta}T23:59:59.999`

  // Periodo anterior de igual duracion (para crecimiento)
  const durMs     = new Date(`${hasta}T23:59:59`).getTime() - new Date(`${desde}T00:00:00`).getTime()
  const prevHasta = new Date(new Date(`${desde}T00:00:00`).getTime() - 1).toISOString()
  const prevDesde = new Date(new Date(`${desde}T00:00:00`).getTime() - durMs - 1).toISOString()

  // Inicio de los ultimos 6 meses (para grafico)
  const seisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  // ── 6 queries en paralelo ─────────────────────────────────────────────────
  //
  // Columnas correctas en reparaciones:
  //   * "falla"    (no "falla_reportada" - no existe)
  //   * "tecnico"  (string nombre, no tecnico_id - no es FK)
  //
  // Ingresos por reparaciones AHORA vienen de movimientos_caja (dinero real en caja),
  // no de reparaciones.costo_total (que es costo de refacciones, no ingreso).
  const [
    repsResult,
    repsActivasResult,
    ventasResult,
    ventasSeisMesesResult,
    movimientosCajaResult,
    movimientosCajaSeisResult,
  ] = await Promise.all([
    // Reparaciones del periodo - estatus + falla + tecnico (sin costo_total)
    supabase
      .from("reparaciones")
      .select("estatus, falla, tecnico")
      .eq("taller_id", tallerId)
      .gte("created_at", desdeTs)
      .lte("created_at", hastaTs),

    // Tickets activos AHORA (flujo en tiempo real)
    supabase
      .from("reparaciones")
      .select("estatus")
      .eq("taller_id", tallerId)
      .in("estatus", ESTATUS_ACTIVOS),

    // Ventas POS del periodo
    supabase
      .from("ventas")
      .select("total, metodo_pago")
      .eq("taller_id", tallerId)
      .gte("created_at", desdeTs)
      .lte("created_at", hastaTs)
      .neq("estado", "anulado"),

    // Ventas ultimos 6 meses para grafico
    supabase
      .from("ventas")
      .select("total, created_at")
      .eq("taller_id", tallerId)
      .gte("created_at", seisMesesAtras)
      .neq("estado", "anulado"),

    // Ingresos reales por reparaciones del periodo (desde caja)
    supabase
      .from("movimientos_caja")
      .select("monto, fecha")
      .eq("taller_id", tallerId)
      .gte("fecha", desdeTs)
      .lte("fecha", hastaTs)
      .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"]),

    // Ingresos reales por reparaciones ultimos 6 meses (para grafico)
    supabase
      .from("movimientos_caja")
      .select("monto, fecha")
      .eq("taller_id", tallerId)
      .gte("fecha", seisMesesAtras)
      .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"]),
  ])

  if (repsResult.error) {
    console.error("[reportes] reparaciones periodo:", repsResult.error.message)
    return { data: null, error: repsResult.error.message }
  }
  if (ventasResult.error) {
    console.error("[reportes] ventas periodo:", ventasResult.error.message)
    return { data: null, error: ventasResult.error.message }
  }
  if (movimientosCajaResult.error) {
    console.error("[reportes] movimientos_caja periodo:", movimientosCajaResult.error.message)
  }

  const reps        = repsResult.data          ?? []
  const repsActivas = repsActivasResult.data   ?? []
  const ventas      = ventasResult.data        ?? []
  const ventasSeis  = ventasSeisMesesResult.data ?? []
  const movCaja     = movimientosCajaResult.data ?? []
  const movCajaSeis = movimientosCajaSeisResult.data ?? []

  // ── KPIs del periodo ──────────────────────────────────────────────────────

  const ticketsTotales  = reps.length
  const entregadas      = reps.filter(r => r.estatus === "Entregado")
  const canceladas      = reps.filter(r => r.estatus === "Cancelado").length
  const ticketsCerrados = entregadas.length
  const noCancel        = ticketsTotales - canceladas
  const tasaCierre      = noCancel > 0 ? Math.round((ticketsCerrados / noCancel) * 100) : 0

  // Ingresos reales por reparaciones = dinero que entro a caja (anticipos + liquidaciones)
  const ingresosRep     = movCaja.reduce((s, m) => s + Number(m.monto ?? 0), 0)
  const ingresosPos     = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const ingresosTotales = ingresosRep + ingresosPos

  // Ticket promedio = ingresos reales / reparaciones entregadas (que generaron ingreso)
  const ticketPromedio = entregadas.length > 0
    ? Math.round(ingresosRep / entregadas.length)
    : 0

  // ── Crecimiento vs periodo anterior ──────────────────────────────────────

  let crecimientoIngresos = 0
  const [prevVentas, prevMovCaja] = await Promise.all([
    supabase.from("ventas")
      .select("total")
      .eq("taller_id", tallerId)
      .gte("created_at", prevDesde)
      .lte("created_at", prevHasta)
      .neq("estado", "anulado"),
    supabase.from("movimientos_caja")
      .select("monto")
      .eq("taller_id", tallerId)
      .gte("fecha", prevDesde)
      .lte("fecha", prevHasta)
      .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"]),
  ])
  const prevTotal =
    (prevVentas.data ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0) +
    (prevMovCaja.data ?? []).reduce((s, m) => s + Number(m.monto ?? 0), 0)
  if (prevTotal > 0) {
    crecimientoIngresos = Math.round(((ingresosTotales - prevTotal) / prevTotal) * 100)
  } else if (ingresosTotales > 0) {
    crecimientoIngresos = 100
  }

  // ── Flujo activo ─────────────────────────────────────────────────────────

  const flujoCounts = new Map<string, number>()
  for (const s of ESTATUS_ACTIVOS) flujoCounts.set(s, 0)
  for (const r of repsActivas) {
    const e = r.estatus as string
    if (flujoCounts.has(e)) flujoCounts.set(e, (flujoCounts.get(e) ?? 0) + 1)
  }
  const totalActivos = Array.from(flujoCounts.values()).reduce((a, b) => a + b, 0)
  const flujoActivo: FlujoEstatus[] = ESTATUS_ACTIVOS
    .map(s => ({
      estatus:    s,
      count:      flujoCounts.get(s) ?? 0,
      porcentaje: totalActivos > 0 ? Math.round(((flujoCounts.get(s) ?? 0) / totalActivos) * 100) : 0,
    }))
    .filter(s => s.count > 0)

  // ── Ingresos ultimos 6 meses (grafico) ───────────────────────────────────

  const ingresosMensuales: MesIngresos[] = []
  for (let i = 5; i >= 0; i--) {
    const from    = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const to      = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr   = to.toISOString().slice(0, 10)

    const pos = ventasSeis
      .filter(v => { const d = (v.created_at as string).slice(0, 10); return d >= fromStr && d < toStr })
      .reduce((s, v) => s + Number(v.total ?? 0), 0)

    // Ingresos reales por reparaciones = movimientos_caja del mes
    const rep = movCajaSeis
      .filter(m => { const d = (m.fecha as string).slice(0, 10); return d >= fromStr && d < toStr })
      .reduce((s, m) => s + Number(m.monto ?? 0), 0)

    ingresosMensuales.push({ label: MESES_CORTO[from.getMonth()], pos, reparaciones: rep, total: pos + rep })
  }

  // ── Metodos de pago ───────────────────────────────────────────────────────

  const metodosMap = new Map<string, { total: number; count: number }>()
  for (const v of ventas) {
    const m    = (v.metodo_pago as string | null) ?? "efectivo"
    const prev = metodosMap.get(m) ?? { total: 0, count: 0 }
    metodosMap.set(m, { total: prev.total + Number(v.total ?? 0), count: prev.count + 1 })
  }
  const totalVentasBase = ingresosPos || 1
  const metodosPago: MetodoPago[] = Array.from(metodosMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([metodo, { total, count }]) => ({
      metodo, total, count,
      porcentaje: Math.round((total / totalVentasBase) * 100),
    }))

  // ── Fallas mas frecuentes - columna "falla" ───────────────────────────────

  const fallaMap = new Map<string, number>()
  for (const r of reps) {
    const f = (r.falla as string | null)?.trim().toLowerCase()
    if (!f || FALLA_SKIP.has(f) || f.length < 2) continue
    const key = (r.falla as string).trim()
    fallaMap.set(key, (fallaMap.get(key) ?? 0) + 1)
  }
  const topFallas: FallaTop[] = Array.from(fallaMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([falla, count]) => ({ falla, count }))

  // ── Tecnicos - columna "tecnico" (string nombre) ──────────────────────────
  // Usamos TODAS las reparaciones del periodo (no solo entregadas) para mostrar
  // actividad real del tecnico. Si no hay entregas en el periodo, al menos se ve
  // quien esta trabajando en los tickets activos.

  const tecMap = new Map<string, number>()
  for (const r of reps) {
    const nombre = (r.tecnico as string | null)?.trim() || "Sin asignar"
    if (nombre.toLowerCase() === "sin asignar" || nombre.toLowerCase() === "no asignado" || nombre.toLowerCase() === "pendiente") continue
    tecMap.set(nombre, (tecMap.get(nombre) ?? 0) + 1)
  }
  const totalComp = Array.from(tecMap.values()).reduce((a, b) => a + b, 0)
  const eliteSquad: TecnicoTop[] = Array.from(tecMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, completados]) => ({
      nombre, completados,
      porcentaje: totalComp > 0 ? Math.round((completados / totalComp) * 100) : 0,
    }))

  return {
    data: {
      ingresosTotales, ingresosPos, ingresosRep,
      ticketsTotales, ticketsCerrados, tasaCierre, ticketPromedio, crecimientoIngresos,
      flujoActivo, totalActivos,
      ingresosMensuales,
      metodosPago,
      topFallas,
      eliteSquad,
    },
    error: null,
  }
}
