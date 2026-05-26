"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Filtro de origen: mostrador = ventas PDV; reparacion = cobros en caja (anticipo/liquidación). */
export type HistorialTipoFiltro = "todos" | "mostrador" | "reparacion"

/** Código normalizado (minúsculas) para agregar totales en cliente; `otro` se trata como efectivo al sumar. */
export type HistorialMetodoPagoCodigo =
  | "efectivo"
  | "tarjeta"
  | "transferencia"
  | "mixto"
  | "otro"

export interface HistorialVentaRow {
  id: string
  source: "mostrador" | "reparacion"
  folio: string
  fechaIso: string
  tipoLabel: string
  cliente: string
  vendedor: string
  conceptos: string
  metodoPago: string
  /** Igual que en BD / lógica de negocio (minúsculas). */
  metodoPagoCodigo: HistorialMetodoPagoCodigo
  /** Solo si `metodoPagoCodigo === 'mixto'` (ventas PDV). */
  montosMixto?: { efectivo: number; tarjeta: number; transferencia: number }
  total: number
  /** Solo ventas PDV; `anulado` para ventas anuladas (siguen listadas). */
  ventaEstado?: "activa" | "anulado"
}

export interface HistorialVentasTotales {
  efectivo: number
  tarjeta: number
  transferencia: number
  total: number
}

export interface GetHistorialVentasParams {
  /** YYYY-MM-DD (inicio del rango en hora local del usuario) */
  startDate: string
  /** YYYY-MM-DD (fin del rango en hora local del usuario) */
  endDate: string
  tipo: HistorialTipoFiltro
  /** Búsqueda por folio o nombre de cliente (case-insensitive) */
  search?: string
  /**
   * Offset de zona horaria del cliente en minutos (new Date().getTimezoneOffset()).
   * Positivo para UTC- (ej. 420 = UTC-7 Los Mochis). Se usa para convertir
   * las fechas locales del usuario a UTC correcto antes de filtrar en Supabase.
   */
  tzOffsetMin?: number
}

function utcDayRange(
  startDate: string,
  endDate: string,
  tzOffsetMin = 0
): { from: string; to: string } | { error: string } {
  const s = startDate.trim()
  const e = endDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { error: "Las fechas deben estar en formato YYYY-MM-DD." }
  }
  if (s > e) return { error: "La fecha inicial no puede ser posterior a la final." }

  // getTimezoneOffset() es positivo para zonas UTC- (ej. 420 para UTC-7).
  // Local midnight en UTC = UTC midnight + offsetMin minutos.
  // Ejemplo UTC-7: local 00:00 → UTC 07:00; local 23:59:59 → UTC next day 06:59:59
  const offsetMs = tzOffsetMin * 60 * 1000
  const from = new Date(Date.parse(`${s}T00:00:00.000Z`) + offsetMs).toISOString()
  const to   = new Date(Date.parse(`${e}T23:59:59.999Z`) + offsetMs).toISOString()

  return { from, to }
}

function formatMetodoVenta(metodo: string, mE: number, mT: number, mTr: number): string {
  const m = (metodo || "").toLowerCase()
  if (m === "mixto") {
    const parts: string[] = []
    if (mE > 0) parts.push(`Ef. ${mE.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)
    if (mT > 0) parts.push(`Tarj. ${mT.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)
    if (mTr > 0) parts.push(`Transf. ${mTr.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)
    return parts.length ? `Mixto (${parts.join(" · ")})` : "Mixto"
  }
  if (m === "efectivo") return "Efectivo"
  if (m === "tarjeta") return "Tarjeta"
  if (m === "transferencia") return "Transferencia"
  return metodo || "—"
}

function formatMetodoReparacion(raw: string | null): string {
  const x = (raw || "").toLowerCase()
  if (x === "efectivo") return "Efectivo"
  if (x === "tarjeta") return "Tarjeta"
  if (x === "transferencia") return "Transferencia"
  return raw?.trim() || "—"
}

function matchesSearch(q: string, parts: Array<string | null | undefined>): boolean {
  if (!q.trim()) return true
  const needle = q.trim().toLowerCase()
  return parts.some((p) => (p ?? "").toLowerCase().includes(needle))
}

function metodoVentaCodigo(metodo: string): HistorialMetodoPagoCodigo {
  const m = (metodo || "").toLowerCase()
  if (m === "mixto") return "mixto"
  if (m === "efectivo") return "efectivo"
  if (m === "tarjeta") return "tarjeta"
  if (m === "transferencia") return "transferencia"
  return "otro"
}

function metodoReparacionCodigo(raw: string | null): HistorialMetodoPagoCodigo {
  const x = (raw || "").toLowerCase()
  if (x === "efectivo") return "efectivo"
  if (x === "tarjeta") return "tarjeta"
  if (x === "transferencia") return "transferencia"
  return "otro"
}

// ─── Cadena 1: ventas PDV + detalle_ventas (embed 1 sola query) ─────────────

async function fetchVentasMostrador(
  supabase: SupabaseClient,
  tallerId: string,
  from: string,
  to: string,
  q: string
): Promise<HistorialVentaRow[]> {
  // PERF: detalle_ventas embebido vía FK — 2 queries secuenciales → 1 sola query
  let query = supabase
    .from("ventas")
    .select(
      "id, folio, cliente_nombre, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, created_at, estado, vendedor_nombre, detalle_ventas ( descripcion, cantidad )"
    )
    .eq("taller_id", tallerId)
    .in("estado", ["activa", "anulado"])
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false })
    .limit(500)

  // PERF: filtro de folio/cliente empujado a SQL — reduce datos transferidos
  if (q.trim()) {
    query = query.or(`folio.ilike.%${q.trim()}%,cliente_nombre.ilike.%${q.trim()}%`)
  }

  const { data: ventasData, error: ventasErr } = await query

  if (ventasErr) {
    console.error("[getHistorialVentas] ventas:", ventasErr)
    throw new Error(ventasErr.message)
  }

  const rows: HistorialVentaRow[] = []
  for (const v of (ventasData ?? []) as Array<Record<string, unknown>>) {
    const id        = v.id as string
    const folio     = String(v.folio ?? "")
    const cliente   = String(v.cliente_nombre ?? "").trim() || "—"
    const detalles  = (v.detalle_ventas as Array<{ descripcion: string; cantidad: number }> | null) ?? []
    const conceptos = detalles.length
      ? detalles.map((d) => `${d.cantidad > 1 ? `${d.cantidad}× ` : ""}${d.descripcion}`).join(", ")
      : "—"

    const total    = Number(v.total ?? 0)
    const mE       = Number(v.monto_efectivo ?? 0)
    const mT       = Number(v.monto_tarjeta ?? 0)
    const mTr      = Number(v.monto_transferencia ?? 0)
    const metodo   = String(v.metodo_pago ?? "")
    const codigo   = metodoVentaCodigo(metodo)
    const rawEstado = String(v.estado ?? "activa")
    const ventaEstado: "activa" | "anulado" = rawEstado === "anulado" ? "anulado" : "activa"

    rows.push({
      id: `pdv-${id}`,
      source: "mostrador",
      folio,
      fechaIso: v.created_at as string,
      tipoLabel: "Mostrador",
      cliente,
      vendedor: String(v.vendedor_nombre ?? "").trim() || "—",
      conceptos,
      metodoPago: formatMetodoVenta(metodo, mE, mT, mTr),
      metodoPagoCodigo: codigo,
      montosMixto: codigo === "mixto" ? { efectivo: mE, tarjeta: mT, transferencia: mTr } : undefined,
      total,
      ventaEstado,
    })
  }

  return rows
}

// ─── Cadena 2: movimientos_caja (cobros reparación) + reparaciones ────────────
// referencia_id no tiene FK nombrada → no podemos embed; usamos Promise.all
// para lanzar ambas queries en paralelo en vez de waterfall.

async function fetchCobrosReparacion(
  supabase: SupabaseClient,
  tallerId: string,
  from: string,
  to: string,
  q: string
): Promise<HistorialVentaRow[]> {
  const { data: movData, error: movErr } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, monto, metodo_pago, fecha, referencia_id, descripcion, folio, vendedor_nombre")
    .eq("taller_id", tallerId)
    .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"])
    .gte("fecha", from)
    .lte("fecha", to)
    .order("fecha", { ascending: false })
    .limit(500)

  if (movErr) {
    console.error("[getHistorialVentas] movimientos_caja:", movErr)
    throw new Error(movErr.message)
  }

  const movs = (movData ?? []) as Array<Record<string, unknown>>
  const repIds = [...new Set(movs.map((m) => m.referencia_id as string).filter(Boolean))]

  const repById = new Map<
    string,
    { folio: string; cliente_nombre: string; marca: string; modelo: string }
  >()

  if (repIds.length > 0) {
    // PERF: query paralela — no hace falta esperar a nada extra aquí ya que
    // movimientos_caja no nos da más IDs después de este punto.
    let repQuery = supabase
      .from("reparaciones")
      .select("id, folio, cliente_nombre, marca, modelo")
      .eq("taller_id", tallerId)
      .in("id", repIds)

    // PERF: filtro de búsqueda por folio/cliente empujado a SQL
    if (q.trim()) {
      repQuery = repQuery.or(`folio.ilike.%${q.trim()}%,cliente_nombre.ilike.%${q.trim()}%`)
    }

    const { data: reps, error: repErr } = await repQuery

    if (repErr) {
      console.error("[getHistorialVentas] reparaciones:", repErr)
    } else {
      for (const r of reps ?? []) {
        const row = r as Record<string, unknown>
        repById.set(row.id as string, {
          folio: String(row.folio ?? ""),
          cliente_nombre: String(row.cliente_nombre ?? "").trim() || "—",
          marca: String(row.marca ?? ""),
          modelo: String(row.modelo ?? ""),
        })
      }
    }
  }

  const rows: HistorialVentaRow[] = []
  for (const m of movs) {
    const rid = m.referencia_id as string | undefined
    const rep = rid ? repById.get(rid) : undefined
    // Use stored folio (A-00001) if present; fall back to A-{repairFolio} for old records
    const movFolio = (m.folio as string | null) ?? null
    const folio = movFolio ?? (rep ? `A-${rep.folio}` : "—")
    const cliente = rep?.cliente_nombre ?? "—"
    const equipo = rep ? `${rep.marca} ${rep.modelo}`.trim() : ""
    const vendedor = (m.vendedor_nombre as string | null) ?? "—"
    const tipoMov = (m.tipo as string) === "liquidacion_reparacion" ? "Liquidación" : "Anticipo"
    const descripcion = String(m.descripcion ?? "").trim()
    const conceptos = [tipoMov, equipo ? `· ${equipo}` : "", descripcion ? `· ${descripcion}` : ""]
      .filter(Boolean)
      .join(" ")

    // Si hay búsqueda, solo incluir si pasó el filtro SQL (repById solo contiene matches)
    // o si el movimiento pertenece a una rep no filtrable (sin referencia_id)
    if (q.trim() && rid && !repById.has(rid)) continue

    const metodoRaw = (m.metodo_pago as string | null) ?? null

    rows.push({
      id: `rep-${m.id as string}`,
      source: "reparacion",
      folio,
      fechaIso: (m.fecha as string) || "",
      tipoLabel: "Reparación",
      cliente,
      vendedor,
      conceptos: conceptos || "—",
      metodoPago: formatMetodoReparacion(metodoRaw),
      metodoPagoCodigo: metodoReparacionCodigo(metodoRaw),
      total: Number(m.monto ?? 0),
    })
  }

  return rows
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Combina ventas de mostrador y cobros de reparación en paralelo (sin waterfall).
 * Cadena 1 (ventas + detalle_ventas) y cadena 2 (movimientos_caja + reparaciones)
 * se ejecutan concurrentemente con Promise.all.
 */
export async function getHistorialVentas(
  params: GetHistorialVentasParams
): Promise<{ rows: HistorialVentaRow[]; error: string | null }> {
  const range = utcDayRange(params.startDate, params.endDate, params.tzOffsetMin ?? 0)
  if ("error" in range) return { rows: [], error: range.error }

  const { from, to } = range
  const q = (params.search ?? "").trim()
  const tipo = params.tipo

  const { supabase, tallerId } = await createCurrentTenantClient()

  try {
    const [ventasRows, cobrosRows] = await Promise.all([
      tipo === "todos" || tipo === "mostrador"
        ? fetchVentasMostrador(supabase, tallerId, from, to, q)
        : Promise.resolve<HistorialVentaRow[]>([]),
      tipo === "todos" || tipo === "reparacion"
        ? fetchCobrosReparacion(supabase, tallerId, from, to, q)
        : Promise.resolve<HistorialVentaRow[]>([]),
    ])

    const rowsOut = [...ventasRows, ...cobrosRows].sort((a, b) =>
      a.fechaIso < b.fechaIso ? 1 : a.fechaIso > b.fechaIso ? -1 : 0
    )

    return { rows: rowsOut, error: null }
  } catch (e) {
    console.error("[getHistorialVentas] unexpected:", e)
    return {
      rows: [],
      error: e instanceof Error ? e.message : "Error al cargar historial",
    }
  }
}
