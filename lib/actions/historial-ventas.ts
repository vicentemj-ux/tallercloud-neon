"use server"

import { getPrismaClient } from "@/lib/prisma"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

export type HistorialTipoFiltro = "todos" | "mostrador" | "reparacion"

export type HistorialMetodoPagoCodigo = "efectivo" | "tarjeta" | "transferencia" | "mixto" | "otro"

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
  metodoPagoCodigo: HistorialMetodoPagoCodigo
  montosMixto?: { efectivo: number; tarjeta: number; transferencia: number }
  total: number
  ventaEstado?: "activa" | "anulado"
}

export interface HistorialVentasTotales {
  efectivo: number
  tarjeta: number
  transferencia: number
  total: number
}

export interface GetHistorialVentasParams {
  startDate: string
  endDate: string
  tipo: HistorialTipoFiltro
  search?: string
  tzOffsetMin?: number
}

function utcDayRange(startDate: string, endDate: string, tzOffsetMin = 0): { from: string; to: string } | { error: string } {
  const s = startDate.trim()
  const e = endDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return { error: "Las fechas deben estar en formato YYYY-MM-DD." }
  if (s > e) return { error: "La fecha inicial no puede ser posterior a la final." }

  const offsetMs = tzOffsetMin * 60 * 1000
  const from = new Date(Date.parse(`${s}T00:00:00.000Z`) + offsetMs).toISOString()
  const to = new Date(Date.parse(`${e}T23:59:59.999Z`) + offsetMs).toISOString()
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

type MostradorRow = {
  id: string
  folio: string | null
  cliente_nombre: string | null
  total: number
  metodo_pago: string | null
  monto_efectivo: number | null
  monto_tarjeta: number | null
  monto_transferencia: number | null
  created_at: Date | string
  estado: string | null
  vendedor_nombre: string | null
}

type DetalleRow = { venta_id: string; descripcion: string | null; cantidad: number | null }
type MovRow = {
  id: string
  tipo: string
  monto: number
  metodo_pago: string | null
  fecha: Date | string
  referencia_id: string | null
  descripcion: string | null
  folio: string | null
  vendedor_nombre: string | null
}
type RepRow = { id: string; folio: string | null; cliente_nombre: string | null; marca: string | null; modelo: string | null }

async function fetchVentasMostrador(tallerId: string, from: string, to: string, q: string): Promise<HistorialVentaRow[]> {
  const prisma = getPrismaClient()
  const pattern = `%${q}%`

  const ventas = await prisma.$queryRawUnsafe<MostradorRow[]>(
    `SELECT id, folio, cliente_nombre, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, created_at, estado, vendedor_nombre
     FROM ventas
     WHERE taller_id = $1
       AND estado IN ('activa', 'anulado')
       AND created_at >= $2::timestamptz
       AND created_at <= $3::timestamptz
       AND ($4 = '' OR folio ILIKE $5 OR cliente_nombre ILIKE $5)
     ORDER BY created_at DESC
     LIMIT 500`,
    tallerId,
    from,
    to,
    q,
    pattern,
  )

  const ventaIds = ventas.map((v) => v.id)
  let detalleRows: DetalleRow[] = []
  if (ventaIds.length > 0) {
    detalleRows = await prisma.$queryRawUnsafe<DetalleRow[]>(
      `SELECT venta_id, descripcion, cantidad
       FROM detalle_ventas
       WHERE venta_id = ANY($1::text[])
       ORDER BY created_at ASC`,
      ventaIds,
    )
  }

  const detallesByVenta = new Map<string, Array<{ descripcion: string; cantidad: number }>>()
  for (const d of detalleRows) {
    const arr = detallesByVenta.get(d.venta_id) ?? []
    arr.push({ descripcion: d.descripcion ?? "", cantidad: Number(d.cantidad ?? 1) })
    detallesByVenta.set(d.venta_id, arr)
  }

  return ventas.map((v) => {
    const detalles = detallesByVenta.get(v.id) ?? []
    const conceptos = detalles.length
      ? detalles.map((d) => `${d.cantidad > 1 ? `${d.cantidad}× ` : ""}${d.descripcion}`).join(", ")
      : "—"

    const metodo = v.metodo_pago ?? ""
    const mE = Number(v.monto_efectivo ?? 0)
    const mT = Number(v.monto_tarjeta ?? 0)
    const mTr = Number(v.monto_transferencia ?? 0)
    const codigo = metodoVentaCodigo(metodo)

    return {
      id: `pdv-${v.id}`,
      source: "mostrador",
      folio: String(v.folio ?? ""),
      fechaIso: new Date(v.created_at).toISOString(),
      tipoLabel: "Mostrador",
      cliente: (v.cliente_nombre ?? "").trim() || "—",
      vendedor: (v.vendedor_nombre ?? "").trim() || "—",
      conceptos,
      metodoPago: formatMetodoVenta(metodo, mE, mT, mTr),
      metodoPagoCodigo: codigo,
      montosMixto: codigo === "mixto" ? { efectivo: mE, tarjeta: mT, transferencia: mTr } : undefined,
      total: Number(v.total ?? 0),
      ventaEstado: v.estado === "anulado" ? "anulado" : "activa",
    }
  })
}

async function fetchCobrosReparacion(tallerId: string, from: string, to: string, q: string): Promise<HistorialVentaRow[]> {
  const prisma = getPrismaClient()

  const movs = await prisma.$queryRawUnsafe<MovRow[]>(
    `SELECT id, tipo, monto, metodo_pago, fecha, referencia_id, descripcion, folio, vendedor_nombre
     FROM movimientos_caja
     WHERE taller_id = $1
       AND tipo IN ('anticipo_reparacion', 'liquidacion_reparacion')
       AND fecha >= $2::timestamptz
       AND fecha <= $3::timestamptz
     ORDER BY fecha DESC
     LIMIT 500`,
    tallerId,
    from,
    to,
  )

  const repIds = [...new Set(movs.map((m) => m.referencia_id).filter((id): id is string => Boolean(id)))]
  const repById = new Map<string, RepRow>()
  if (repIds.length > 0) {
    const pattern = `%${q}%`
    const reps = await prisma.$queryRawUnsafe<RepRow[]>(
      `SELECT id, folio, cliente_nombre, marca, modelo
       FROM reparaciones
       WHERE taller_id = $1
         AND id = ANY($2::text[])
         AND ($3 = '' OR folio ILIKE $4 OR cliente_nombre ILIKE $4)`,
      tallerId,
      repIds,
      q,
      pattern,
    )
    for (const rep of reps) repById.set(rep.id, rep)
  }

  const rows: HistorialVentaRow[] = []
  for (const m of movs) {
    const rid = m.referencia_id
    const rep = rid ? repById.get(rid) : undefined
    if (q.trim() && rid && !rep) continue

    const movFolio = m.folio ?? null
    const folio = movFolio ?? (rep?.folio ? `A-${rep.folio}` : "—")
    const cliente = (rep?.cliente_nombre ?? "").trim() || "—"
    const equipo = `${(rep?.marca ?? "").trim()} ${(rep?.modelo ?? "").trim()}`.trim()
    const tipoMov = m.tipo === "liquidacion_reparacion" ? "Liquidación" : "Anticipo"
    const descripcion = (m.descripcion ?? "").trim()
    const conceptos = [tipoMov, equipo ? `· ${equipo}` : "", descripcion ? `· ${descripcion}` : ""]
      .filter(Boolean)
      .join(" ")

    rows.push({
      id: `rep-${m.id}`,
      source: "reparacion",
      folio,
      fechaIso: new Date(m.fecha).toISOString(),
      tipoLabel: "Reparación",
      cliente,
      vendedor: (m.vendedor_nombre ?? "").trim() || "—",
      conceptos: conceptos || "—",
      metodoPago: formatMetodoReparacion(m.metodo_pago),
      metodoPagoCodigo: metodoReparacionCodigo(m.metodo_pago),
      total: Number(m.monto ?? 0),
    })
  }

  return rows
}

export async function getHistorialVentas(params: GetHistorialVentasParams): Promise<{ rows: HistorialVentaRow[]; error: string | null }> {
  const range = utcDayRange(params.startDate, params.endDate, params.tzOffsetMin ?? 0)
  if ("error" in range) return { rows: [], error: range.error }

  const { from, to } = range
  const q = (params.search ?? "").trim()
  const tipo = params.tipo
  const tallerId = await getCurrentTallerId()

  try {
    const [ventasRows, cobrosRows] = await Promise.all([
      tipo === "todos" || tipo === "mostrador" ? fetchVentasMostrador(tallerId, from, to, q) : Promise.resolve<HistorialVentaRow[]>([]),
      tipo === "todos" || tipo === "reparacion" ? fetchCobrosReparacion(tallerId, from, to, q) : Promise.resolve<HistorialVentaRow[]>([]),
    ])

    const rowsOut = [...ventasRows, ...cobrosRows].sort((a, b) => (a.fechaIso < b.fechaIso ? 1 : a.fechaIso > b.fechaIso ? -1 : 0))
    return { rows: rowsOut, error: null }
  } catch (e) {
    console.error("[getHistorialVentas] unexpected:", e)
    return { rows: [], error: e instanceof Error ? e.message : "Error al cargar historial" }
  }
}
