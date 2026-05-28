"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransaccionItem {
  id: string
  fecha: string
  descripcion: string
  monto: number
  tipo: "venta" | "reparacion" | "gasto"
}

export interface UtilidadData {
  // Ventas POS
  ingresosPos: number
  costoStockPos: number
  utilidadPos: number

  // Reparaciones entregadas
  ingresosRep: number
  inversionRep: number
  utilidadRep: number

  // Gastos operativos
  gastos: TransaccionItem[]
  totalGastos: number

  // Transacciones detalladas para las listas
  ingresosItems: TransaccionItem[]
  egresosItems: TransaccionItem[]

  // Resumen principal
  ventasBrutas: number   // ingresosPos + ingresosRep
  costoDeVenta: number   // costoStockPos + inversionRep
  margenBruto: number    // ventasBrutas - costoDeVenta
  utilidadNeta: number   // margenBruto - totalGastos
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getUtilidadData(
  desde: string,  // YYYY-MM-DD
  hasta: string,  // YYYY-MM-DD
): Promise<{ data: UtilidadData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const desdeTs = `${desde}T00:00:00`
  const hastaTs = `${hasta}T23:59:59.999`

  // 3 parallel queries: ventas+detalle, reparaciones entregadas, gastos operativos
  const [ventasResult, repsResult, gastosResult] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, folio, total, created_at, detalle_ventas(costo_unitario, cantidad)")
      .eq("taller_id", tallerId)
      .gte("created_at", desdeTs)
      .lte("created_at", hastaTs)
      .neq("estado", "anulado"),
    supabase
      .from("reparaciones")
      .select("id, folio, costo_total, created_at")
      .eq("taller_id", tallerId)
      .eq("estatus", "Entregado")
      .gte("created_at", desdeTs)
      .lte("created_at", hastaTs),
    supabase
      .from("bitacora_gastos")
      .select("id, concepto, categoria, monto, fecha")
      .eq("taller_id", tallerId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(200),
  ])

  if (ventasResult.error) return { data: null, error: ventasResult.error.message }
  if (gastosResult.error) return { data: null, error: gastosResult.error.message }

  const ventas  = ventasResult.data ?? []
  const reps    = repsResult.data   ?? []
  const gastosRaw  = (gastosResult.data ?? []) as Array<{ id: string; concepto: string; categoria: string; monto: number; fecha: string }>

  // ── Ventas POS ────────────────────────────────────────────────────────────

  const ingresosPos = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const costoStockPos = ventas.reduce((s, v) => {
    const detalles = (v.detalle_ventas as Array<{ costo_unitario: number | null; cantidad: number | null }> | null) ?? []
    return s + detalles.reduce(
      (ds, d) => ds + (Number(d.costo_unitario ?? 0) * Number(d.cantidad ?? 1)),
      0,
    )
  }, 0)
  const utilidadPos = ingresosPos - costoStockPos

  // ── Reparaciones ──────────────────────────────────────────────────────────

  const ingresosRep = reps.reduce((s, r) => s + Number(r.costo_total ?? 0), 0)

  // Fetch gastos internos (partes + mano de obra) para los tickets entregados del periodo
  let inversionRep = 0
  if (reps.length > 0) {
    const repIds = reps.map(r => r.id as string)
    const { data: repGastos } = await supabase
      .from("reparacion_gastos")
      .select("monto")
      .eq("taller_id", tallerId)
      .in("reparacion_id", repIds)
    inversionRep = (repGastos ?? []).reduce((s, g) => s + Number(g.monto ?? 0), 0)
  }

  const utilidadRep = ingresosRep - inversionRep

  // ── Transacciones detalladas ──────────────────────────────────────────────

  const ingresosItems: TransaccionItem[] = [
    ...ventas.map(v => ({
      id: v.id as string,
      fecha: (v.created_at as string)?.slice(0, 10) ?? "",
      descripcion: `Venta Directa #${(v.folio as string) || v.id}`,
      monto: Number(v.total ?? 0),
      tipo: "venta" as const,
    })),
    ...reps.map(r => ({
      id: r.id as string,
      fecha: (r.created_at as string)?.slice(0, 10) ?? "",
      descripcion: `Reparacion #${(r.folio as string) || r.id}`,
      monto: Number(r.costo_total ?? 0),
      tipo: "reparacion" as const,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  const egresosItems: TransaccionItem[] = gastosRaw.map(g => ({
    id: g.id,
    fecha: g.fecha,
    descripcion: g.concepto,
    monto: Number(g.monto ?? 0),
    tipo: "gasto" as const,
  }))

  // ── Gastos operativos ─────────────────────────────────────────────────────

  const totalGastos = gastosRaw.reduce((s, g) => s + Number(g.monto ?? 0), 0)

  // ── Resumen principal ─────────────────────────────────────────────────────

  const ventasBrutas = ingresosPos + ingresosRep
  const costoDeVenta = costoStockPos + inversionRep
  const margenBruto  = ventasBrutas - costoDeVenta
  const utilidadNeta = margenBruto - totalGastos

  return {
    data: {
      ingresosPos,
      costoStockPos,
      utilidadPos,
      ingresosRep,
      inversionRep,
      utilidadRep,
      gastos: egresosItems,
      totalGastos,
      ingresosItems,
      egresosItems,
      ventasBrutas,
      costoDeVenta,
      margenBruto,
      utilidadNeta,
    },
    error: null,
  }
}
