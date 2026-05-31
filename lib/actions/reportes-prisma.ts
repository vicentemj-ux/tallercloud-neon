"use server"

import { getTenantIdOrThrow } from "@/lib/auth/tenant-utils"
import { getPrismaClient } from "@/lib/prisma"

export interface FlujoEstatus {
  estatus: string
  count: number
  porcentaje: number
}

export interface MesIngresos {
  label: string
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

const MESES_CORTO = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
const ESTATUS_ACTIVOS = ["Recibido", "Diagnostico", "En Reparacion", "Listo"]
const FALLA_SKIP = new Set(["sin asignar", "no aplica", "n/a", "ninguna", "pendiente", ""])

export async function getReportesData(
  desde: string,
  hasta: string,
): Promise<{ data: ReportesData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const now = new Date()
    const desdeDt = new Date(`${desde}T00:00:00`)
    const hastaDt = new Date(`${hasta}T23:59:59.999`)

    const durMs = hastaDt.getTime() - desdeDt.getTime()
    const prevHasta = new Date(desdeDt.getTime() - 1)
    const prevDesde = new Date(prevHasta.getTime() - durMs)

    const seisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    const [
      reps,
      repsActivas,
      ventas,
      ventasSeis,
      movCaja,
      movCajaSeis,
      prevVentasData,
      prevMovCajaData,
    ] = await Promise.all([
      prisma.reparacion.findMany({
        where: { tenantId, createdAt: { gte: desdeDt, lte: hastaDt } },
        select: { estado: true, falla: true, tecnico: true },
      }),
      prisma.reparacion.findMany({
        where: { tenantId, estado: { in: ESTATUS_ACTIVOS } },
        select: { estado: true },
      }),
      prisma.venta.findMany({
        where: { tenantId, createdAt: { gte: desdeDt, lte: hastaDt }, estado: { not: "anulado" } },
        select: { total: true, metodoPago: true },
      }),
      prisma.venta.findMany({
        where: { tenantId, createdAt: { gte: seisMesesAtras }, estado: { not: "anulado" } },
        select: { total: true, createdAt: true },
      }),
      prisma.movimientoCaja.findMany({
        where: {
          tenantId,
          fecha: { gte: desdeDt, lte: hastaDt },
          tipo: { in: ["anticipo_reparacion", "liquidacion_reparacion"] },
        },
        select: { monto: true, fecha: true },
      }),
      prisma.movimientoCaja.findMany({
        where: {
          tenantId,
          fecha: { gte: seisMesesAtras },
          tipo: { in: ["anticipo_reparacion", "liquidacion_reparacion"] },
        },
        select: { monto: true, fecha: true },
      }),
      prisma.venta.findMany({
        where: { tenantId, createdAt: { gte: prevDesde, lte: prevHasta }, estado: { not: "anulado" } },
        select: { total: true },
      }),
      prisma.movimientoCaja.findMany({
        where: {
          tenantId,
          fecha: { gte: prevDesde, lte: prevHasta },
          tipo: { in: ["anticipo_reparacion", "liquidacion_reparacion"] },
        },
        select: { monto: true },
      }),
    ])

    const ticketsTotales = reps.length
    const entregadas = reps.filter((r) => r.estado === "Entregado")
    const canceladas = reps.filter((r) => r.estado === "Cancelado").length
    const ticketsCerrados = entregadas.length
    const noCancel = ticketsTotales - canceladas
    const tasaCierre = noCancel > 0 ? Math.round((ticketsCerrados / noCancel) * 100) : 0

    const ingresosRep = movCaja.reduce((s, m) => s + Number(m.monto), 0)
    const ingresosPos = ventas.reduce((s, v) => s + Number(v.total), 0)
    const ingresosTotales = ingresosRep + ingresosPos

    const ticketPromedio = entregadas.length > 0
      ? Math.round(ingresosRep / entregadas.length)
      : 0

    const prevTotal =
      prevVentasData.reduce((s, v) => s + Number(v.total), 0) +
      prevMovCajaData.reduce((s, m) => s + Number(m.monto), 0)

    let crecimientoIngresos = 0
    if (prevTotal > 0) {
      crecimientoIngresos = Math.round(((ingresosTotales - prevTotal) / prevTotal) * 100)
    } else if (ingresosTotales > 0) {
      crecimientoIngresos = 100
    }

    const flujoCounts = new Map<string, number>()
    for (const s of ESTATUS_ACTIVOS) flujoCounts.set(s, 0)
    for (const r of repsActivas) {
      const e = r.estado
      if (flujoCounts.has(e)) flujoCounts.set(e, (flujoCounts.get(e) ?? 0) + 1)
    }
    const totalActivos = Array.from(flujoCounts.values()).reduce((a, b) => a + b, 0)
    const flujoActivo: FlujoEstatus[] = ESTATUS_ACTIVOS
      .map((s) => ({
        estatus: s,
        count: flujoCounts.get(s) ?? 0,
        porcentaje: totalActivos > 0 ? Math.round(((flujoCounts.get(s) ?? 0) / totalActivos) * 100) : 0,
      }))
      .filter((s) => s.count > 0)

    const ingresosMensuales: MesIngresos[] = []
    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)

      const pos = ventasSeis
        .filter((v) => v.createdAt >= from && v.createdAt < to)
        .reduce((s, v) => s + Number(v.total), 0)

      const rep = movCajaSeis
        .filter((m) => m.fecha >= from && m.fecha < to)
        .reduce((s, m) => s + Number(m.monto), 0)

      ingresosMensuales.push({ label: MESES_CORTO[from.getMonth()], pos, reparaciones: rep, total: pos + rep })
    }

    const metodosMap = new Map<string, { total: number; count: number }>()
    for (const v of ventas) {
      const m = v.metodoPago ?? "efectivo"
      const prev = metodosMap.get(m) ?? { total: 0, count: 0 }
      metodosMap.set(m, { total: prev.total + Number(v.total), count: prev.count + 1 })
    }
    const totalVentasBase = ingresosPos || 1
    const metodosPago: MetodoPago[] = Array.from(metodosMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([metodo, { total, count }]) => ({
        metodo, total, count,
        porcentaje: Math.round((total / totalVentasBase) * 100),
      }))

    const fallaMap = new Map<string, number>()
    for (const r of reps) {
      const raw = r.falla?.trim()
      if (!raw || FALLA_SKIP.has(raw.toLowerCase()) || raw.length < 2) continue
      fallaMap.set(raw, (fallaMap.get(raw) ?? 0) + 1)
    }
    const topFallas: FallaTop[] = Array.from(fallaMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([falla, count]) => ({ falla, count }))

    const tecMap = new Map<string, number>()
    for (const r of reps) {
      const nombre = r.tecnico?.trim() || "Sin asignar"
      if (["sin asignar", "no asignado", "pendiente"].includes(nombre.toLowerCase())) continue
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
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Error al cargar datos de reportes" }
  }
}
