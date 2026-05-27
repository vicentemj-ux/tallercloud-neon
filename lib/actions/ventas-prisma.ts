"use server"

import { revalidatePath } from "next/cache"
import { getPrismaClient } from "@/lib/prisma"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getInventoryPublicUrl } from "@/lib/storage"

export interface CajaRow {
  id: string
  taller_id: string
  monto_inicial: number
  monto_cierre: number | null
  fecha_apertura: string
  fecha_cierre: string | null
  estado: "abierta" | "cerrada"
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_ventas: number
  nota_cierre?: string | null
  numero_corte?: number | null
}

export interface ProductoDisponible {
  id: string
  taller_id: string
  nombre: string
  sku: string | null
  categoria: string | null
  precio_venta: number
  costo: number
  stock_actual: number
  imagen_url: string | null
  es_equipo: boolean
  imei_serie: string | null
  color: string | null
  capacidad: string | null
  condicion: string | null
  marca: string | null
  modelo: string | null
  procesador: string | null
  ram: string | null
  almacenamiento: string | null
}

export interface DetalleVentaInput {
  producto_id?: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  es_especial: boolean
  imei_serie?: string
  color?: string
  condicion?: string
  marca?: string
  modelo?: string
  procesador?: string
  ram?: string
  almacenamiento?: string
  categoria?: string
}

export interface CrearVentaInput {
  caja_id?: string | null
  cliente_nombre?: string | null
  cliente_id?: string | null
  cliente_telefono?: string | null
  total: number
  descuento?: number
  metodo_pago: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  cambio: number
  items: DetalleVentaInput[]
}

export interface VentaCreada {
  id: string
  folio: string
  total: number
  descuento: number
  metodo_pago: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  cambio: number
  created_at: string
  items: DetalleVentaInput[]
  cliente_nombre?: string | null
  cliente_telefono?: string | null
}

export interface HistorialCajaItem {
  id: string
  numero_corte: number | null
  fecha_apertura: string
  fecha_cierre: string | null
  estado: "abierta" | "cerrada"
  monto_inicial: number
  monto_cierre: number | null
  nota_cierre: string | null
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_ventas: number
  saldo_final: number
}

export interface VentaDelCorte {
  id: string
  folio: string
  cliente_nombre: string | null
  total: number
  metodo_pago: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  created_at: string
}

export interface MovimientoDelCorte {
  id: string
  tipo: string
  descripcion: string | null
  monto: number
  metodo_pago: string | null
  fecha: string
}

export interface DetalleCajaData {
  caja: HistorialCajaItem
  ventas: VentaDelCorte[]
  movimientos: MovimientoDelCorte[]
}

export interface CorteCobro {
  id: string
  tipo: string
  descripcion: string | null
  folio: string | null
  monto: number
  metodo_pago: string | null
}

export interface CorteGasto {
  id: string
  descripcion: string | null
  monto: number
}

export interface CorteVentaLinea {
  id: string
  folio: string
  created_at: string
  total: number
  metodo_pago?: string
  descripcion?: string
}

export interface CortePrintData {
  numero_corte: number
  fecha_apertura: string
  fecha_cierre: string
  monto_inicial: number
  total_ventas: number
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_abonos: number
  total_abonos_efectivo: number
  total_abonos_tarjeta: number
  total_abonos_transferencia: number
  total_gastos: number
  saldo_final: number
  monto_cierre?: number | null
  nota_cierre?: string
  cobrosRep: CorteCobro[]
  listaGastos: CorteGasto[]
  ventas: CorteVentaLinea[]
  totalVentasPdv: number
}

export interface AbonoPrintData {
  movimientoId: string
  folio: string
  clienteNombre: string
  clienteTelefono: string
  dispositivo: string
  metodoPago: string
  monto: number
  totalAbonado: number
  presupuesto: number
  saldoRestante: number
  fecha: string
}

export interface VentaLabelFetchData {
  id: string
  folio: string | null
  cliente_nombre: string | null
  items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>
  total: number
  created_at: string
}

export interface CobroReparacionTicketData {
  folio: string
  cliente: string
  conceptos: string
  monto: number
  metodo_pago: string
  fechaIso: string
  tipoMov: "anticipo" | "liquidacion"
}

function toNum(v: unknown): number {
  return Number(v ?? 0)
}

function normCaja(row: Record<string, unknown>): CajaRow {
  return {
    id: String(row.id),
    taller_id: String(row.taller_id),
    monto_inicial: toNum(row.monto_inicial),
    monto_cierre: row.monto_cierre == null ? null : toNum(row.monto_cierre),
    fecha_apertura: String(row.fecha_apertura),
    fecha_cierre: row.fecha_cierre == null ? null : String(row.fecha_cierre),
    estado: row.estado === "cerrada" ? "cerrada" : "abierta",
    total_efectivo: toNum(row.total_efectivo),
    total_tarjeta: toNum(row.total_tarjeta),
    total_transferencia: toNum(row.total_transferencia),
    total_ventas: toNum(row.total_ventas),
    nota_cierre: row.nota_cierre == null ? null : String(row.nota_cierre),
    numero_corte: row.numero_corte == null ? null : toNum(row.numero_corte),
  }
}

async function ensureCajaTableExists() {
  const prisma = getPrismaClient()
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS caja (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      taller_id text NOT NULL,
      monto_inicial numeric(12,2) NOT NULL DEFAULT 0,
      monto_cierre numeric(12,2),
      fecha_apertura timestamptz NOT NULL DEFAULT now(),
      fecha_cierre timestamptz,
      estado text NOT NULL DEFAULT 'abierta',
      total_efectivo numeric(12,2) NOT NULL DEFAULT 0,
      total_tarjeta numeric(12,2) NOT NULL DEFAULT 0,
      total_transferencia numeric(12,2) NOT NULL DEFAULT 0,
      total_ventas numeric(12,2) NOT NULL DEFAULT 0,
      nota_cierre text,
      numero_corte integer
    );
  `)
}

export async function getCajaAbierta(): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
      tallerId,
    )
    return { caja: rows[0] ? normCaja(rows[0]) : null, error: null }
  } catch (error) {
    return { caja: null, error: error instanceof Error ? error.message : "Error al verificar caja" }
  }
}

export async function requireCajaAbierta(): Promise<{ caja: CajaRow; error: null } | { caja: null; error: string }> {
  const { caja, error } = await getCajaAbierta()
  if (error) return { caja: null, error: `Error al verificar caja: ${error}` }
  if (!caja) return { caja: null, error: "No hay una caja abierta. Abre la caja antes de realizar esta operaciÃ³n." }
  return { caja, error: null }
}

export async function abrirCaja(montoInicial: number): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureCajaTableExists()

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      "SELECT COUNT(*)::int AS total FROM caja WHERE taller_id = $1",
      tallerId,
    )
    const numeroCorte = (countRows[0]?.total ?? 0) + 1

    const inserted = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO caja (taller_id, monto_inicial, estado, numero_corte)
       VALUES ($1, $2, 'abierta', $3)
       RETURNING *`,
      tallerId,
      montoInicial,
      numeroCorte,
    )
    return { caja: inserted[0] ? normCaja(inserted[0]) : null, error: null }
  } catch (error) {
    return { caja: null, error: error instanceof Error ? error.message : "Error al abrir caja" }
  }
}

export async function cerrarCaja(cajaId: string, montoCierre: number): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe(
      `UPDATE caja
       SET estado='cerrada', monto_cierre=$1, fecha_cierre=now()
       WHERE id=$2 AND taller_id=$3`,
      montoCierre,
      cajaId,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al cerrar caja" }
  }
}

export async function getProductosDisponibles(): Promise<{ data: ProductoDisponible[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, taller_id, nombre, sku, categoria, precio_venta, costo, stock_actual, imagen_url, es_equipo,
              imei_serie, color, capacidad, condicion, marca, modelo, procesador, ram, almacenamiento
       FROM productos
       WHERE taller_id = $1 AND stock_actual > 0
       ORDER BY nombre ASC
       LIMIT 300`,
      tallerId,
    )
    return {
      data: rows.map((row) => ({
        id: String(row.id),
        taller_id: String(row.taller_id),
        nombre: String(row.nombre ?? ""),
        sku: row.sku == null ? null : String(row.sku),
        categoria: row.categoria == null ? null : String(row.categoria),
        precio_venta: toNum(row.precio_venta),
        costo: toNum(row.costo),
        stock_actual: toNum(row.stock_actual),
        imagen_url: getInventoryPublicUrl(row.imagen_url == null ? null : String(row.imagen_url)),
        es_equipo: Boolean(row.es_equipo),
        imei_serie: row.imei_serie == null ? null : String(row.imei_serie),
        color: row.color == null ? null : String(row.color),
        capacidad: row.capacidad == null ? null : String(row.capacidad),
        condicion: row.condicion == null ? null : String(row.condicion),
        marca: row.marca == null ? null : String(row.marca),
        modelo: row.modelo == null ? null : String(row.modelo),
        procesador: row.procesador == null ? null : String(row.procesador),
        ram: row.ram == null ? null : String(row.ram),
        almacenamiento: row.almacenamiento == null ? null : String(row.almacenamiento),
      })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar inventario" }
  }
}

export async function crearVenta(input: CrearVentaInput): Promise<{ venta: VentaCreada | null; error: string | null }> {
  const cajaCheck = await requireCajaAbierta()
  if (cajaCheck.error || !cajaCheck.caja) return { venta: null, error: cajaCheck.error ?? "No hay caja abierta" }
  if (!input.items?.length) return { venta: null, error: "El carrito estÃ¡ vacÃ­o" }

  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actorNombre = await getCurrentActorDisplayName()

    const nextRows = await prisma.$queryRawUnsafe<Array<{ folio: string }>>(
      "SELECT get_next_venta_folio($1) AS folio",
      tallerId,
    )
    const folio = nextRows[0]?.folio
    if (!folio) return { venta: null, error: "No se pudo generar folio" }

    const insertedVenta = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO ventas
       (taller_id, caja_id, folio, cliente_nombre, cliente_id, cliente_telefono, total, descuento, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio, vendedor_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, created_at`,
      tallerId,
      input.caja_id ?? null,
      folio,
      input.cliente_nombre ?? null,
      input.cliente_id ?? null,
      input.cliente_telefono ?? null,
      input.total,
      input.descuento ?? 0,
      input.metodo_pago,
      input.monto_efectivo,
      input.monto_tarjeta,
      input.monto_transferencia,
      input.cambio,
      actorNombre,
    )
    const ventaId = String(insertedVenta[0].id)

    for (const item of input.items) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO detalle_ventas
         (venta_id, producto_id, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, es_especial, imei_serie, color, condicion, marca, modelo, categoria, procesador, ram, almacenamiento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        ventaId,
        item.producto_id ?? null,
        item.descripcion,
        item.cantidad,
        item.precio_unitario,
        item.costo_unitario,
        item.precio_unitario * item.cantidad,
        item.es_especial,
        item.imei_serie ?? null,
        item.color ?? null,
        item.condicion ?? null,
        item.marca ?? null,
        item.modelo ?? null,
        item.categoria ?? null,
        item.procesador ?? null,
        item.ram ?? null,
        item.almacenamiento ?? null,
      )
    }

    const stockItems = input.items.filter((item) => item.producto_id && !item.es_especial)
    if (stockItems.length > 0) {
      await prisma.$queryRawUnsafe("SELECT batch_decrement_stock($1::jsonb)", JSON.stringify(stockItems.map((i) => ({ producto_id: i.producto_id, taller_id: tallerId, cantidad: i.cantidad }))))
    }

    if (input.caja_id) {
      await prisma.$executeRawUnsafe(
        `UPDATE caja
         SET total_efectivo = total_efectivo + $1,
             total_tarjeta = total_tarjeta + $2,
             total_transferencia = total_transferencia + $3,
             total_ventas = total_ventas + 1
         WHERE id = $4 AND taller_id = $5`,
        input.monto_efectivo - input.cambio,
        input.monto_tarjeta,
        input.monto_transferencia,
        input.caja_id,
        tallerId,
      )

      await prisma.$executeRawUnsafe(
        `INSERT INTO movimientos_caja (taller_id, caja_id, tipo, referencia_id, descripcion, monto, metodo_pago, fecha)
         VALUES ($1,$2,'venta_pdv',$3,$4,$5,$6,now())`,
        tallerId,
        input.caja_id,
        ventaId,
        `Venta ${folio}${input.cliente_nombre ? ` - ${input.cliente_nombre}` : ""}`,
        input.total,
        input.metodo_pago,
      )
    }

    revalidatePath("/dashboard/historial-ventas")

    return {
      venta: {
        id: ventaId,
        folio,
        total: input.total,
        descuento: input.descuento ?? 0,
        metodo_pago: input.metodo_pago,
        monto_efectivo: input.monto_efectivo,
        monto_tarjeta: input.monto_tarjeta,
        monto_transferencia: input.monto_transferencia,
        cambio: input.cambio,
        created_at: String(insertedVenta[0].created_at),
        items: input.items,
        cliente_nombre: input.cliente_nombre,
        cliente_telefono: input.cliente_telefono,
      },
      error: null,
    }
  } catch (error) {
    return { venta: null, error: error instanceof Error ? error.message : "Error al crear venta" }
  }
}

export async function getHistorialCaja(page = 0, pageSize = 30): Promise<{ data: HistorialCajaItem[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const from = page * pageSize

    const data = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM caja
       WHERE taller_id = $1 AND estado = 'cerrada'
       ORDER BY fecha_apertura DESC
       OFFSET $2 LIMIT $3`,
      tallerId,
      from,
      pageSize,
    )
    const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      "SELECT COUNT(*)::int AS total FROM caja WHERE taller_id = $1 AND estado = 'cerrada'",
      tallerId,
    )

    const mapped: HistorialCajaItem[] = data.map((row) => {
      const montoInicial = toNum(row.monto_inicial)
      const saldoFinal = montoInicial + toNum(row.total_efectivo)
      return {
        id: String(row.id),
        numero_corte: row.numero_corte == null ? null : toNum(row.numero_corte),
        fecha_apertura: String(row.fecha_apertura),
        fecha_cierre: row.fecha_cierre == null ? null : String(row.fecha_cierre),
        estado: row.estado === "cerrada" ? "cerrada" : "abierta",
        monto_inicial: montoInicial,
        monto_cierre: row.monto_cierre == null ? null : toNum(row.monto_cierre),
        nota_cierre: row.nota_cierre == null ? null : String(row.nota_cierre),
        total_efectivo: toNum(row.total_efectivo),
        total_tarjeta: toNum(row.total_tarjeta),
        total_transferencia: toNum(row.total_transferencia),
        total_ventas: toNum(row.total_ventas),
        saldo_final: saldoFinal,
      }
    })

    return { data: mapped, error: null, total: totalRows[0]?.total ?? 0 }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error historial caja", total: 0 }
  }
}

export async function getDetalleCaja(cajaId: string): Promise<{ data: DetalleCajaData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const cajas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM caja WHERE id=$1 AND taller_id=$2 LIMIT 1", cajaId, tallerId)
    const caja = cajas[0]
    if (!caja) return { data: null, error: "Caja no encontrada" }

    const ventas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, folio, cliente_nombre, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, created_at
       FROM ventas WHERE caja_id=$1 AND taller_id=$2 AND estado='activa' ORDER BY created_at ASC`,
      cajaId,
      tallerId,
    )
    const movimientos = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, tipo, descripcion, monto, metodo_pago, fecha
       FROM movimientos_caja WHERE caja_id=$1 AND taller_id=$2 ORDER BY fecha ASC`,
      cajaId,
      tallerId,
    )

    return {
      data: {
        caja: {
          id: String(caja.id),
          numero_corte: caja.numero_corte == null ? null : toNum(caja.numero_corte),
          fecha_apertura: String(caja.fecha_apertura),
          fecha_cierre: caja.fecha_cierre == null ? null : String(caja.fecha_cierre),
          estado: caja.estado === "cerrada" ? "cerrada" : "abierta",
          monto_inicial: toNum(caja.monto_inicial),
          monto_cierre: caja.monto_cierre == null ? null : toNum(caja.monto_cierre),
          nota_cierre: caja.nota_cierre == null ? null : String(caja.nota_cierre),
          total_efectivo: toNum(caja.total_efectivo),
          total_tarjeta: toNum(caja.total_tarjeta),
          total_transferencia: toNum(caja.total_transferencia),
          total_ventas: toNum(caja.total_ventas),
          saldo_final: toNum(caja.monto_inicial) + toNum(caja.total_efectivo),
        },
        ventas: ventas.map((v) => ({
          id: String(v.id),
          folio: String(v.folio ?? ""),
          cliente_nombre: v.cliente_nombre == null ? null : String(v.cliente_nombre),
          total: toNum(v.total),
          metodo_pago: String(v.metodo_pago ?? ""),
          monto_efectivo: toNum(v.monto_efectivo),
          monto_tarjeta: toNum(v.monto_tarjeta),
          monto_transferencia: toNum(v.monto_transferencia),
          created_at: String(v.created_at),
        })),
        movimientos: movimientos.map((m) => ({
          id: String(m.id),
          tipo: String(m.tipo ?? ""),
          descripcion: m.descripcion == null ? null : String(m.descripcion),
          monto: toNum(m.monto),
          metodo_pago: m.metodo_pago == null ? null : String(m.metodo_pago),
          fecha: String(m.fecha),
        })),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error detalle caja" }
  }
}

export async function getAbonoById(movimientoId: string): Promise<{ data: AbonoPrintData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const movRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM movimientos_caja WHERE id=$1 AND taller_id=$2 LIMIT 1", movimientoId, tallerId)
    const mov = movRows[0]
    if (!mov) return { data: null, error: "Movimiento no encontrado." }
    const repRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT folio, cliente_nombre, cliente_telefono, marca, modelo, tipo_equipo, precio_estimado, anticipo FROM reparaciones WHERE id=$1 AND taller_id=$2 LIMIT 1", String(mov.referencia_id ?? ""), tallerId)
    const rep = repRows[0]
    if (!rep) return { data: null, error: "ReparaciÃ³n no encontrada." }

    const presupuesto = toNum(rep.precio_estimado)
    const totalAbonado = toNum(rep.anticipo)
    return { data: {
      movimientoId: String(mov.id),
      folio: String(rep.folio ?? ""),
      clienteNombre: String(rep.cliente_nombre ?? ""),
      clienteTelefono: String(rep.cliente_telefono ?? ""),
      dispositivo: `${String(rep.tipo_equipo ?? "")} ${String(rep.marca ?? "")} ${String(rep.modelo ?? "")}`.trim(),
      metodoPago: String(mov.metodo_pago ?? "efectivo"),
      monto: toNum(mov.monto),
      totalAbonado,
      presupuesto,
      saldoRestante: Math.max(0, presupuesto - totalAbonado),
      fecha: String(mov.fecha),
    }, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al obtener abono" }
  }
}

export async function getCajaConDetalle(cajaId: string): Promise<{ data: CortePrintData | null; error: string | null }> {
  const detalle = await getDetalleCaja(cajaId)
  if (!detalle.data || detalle.error) return { data: null, error: detalle.error ?? "Corte no encontrado." }
  const c = detalle.data.caja
  const ventas = detalle.data.ventas.map((v) => ({ id: v.id, folio: v.folio, created_at: v.created_at, total: v.total, metodo_pago: v.metodo_pago }))
  return {
    data: {
      numero_corte: c.numero_corte ?? 0,
      fecha_apertura: c.fecha_apertura,
      fecha_cierre: c.fecha_cierre ?? new Date().toISOString(),
      monto_inicial: c.monto_inicial,
      total_ventas: c.total_ventas,
      total_efectivo: c.total_efectivo,
      total_tarjeta: c.total_tarjeta,
      total_transferencia: c.total_transferencia,
      total_abonos: 0,
      total_abonos_efectivo: 0,
      total_abonos_tarjeta: 0,
      total_abonos_transferencia: 0,
      total_gastos: 0,
      saldo_final: c.saldo_final,
      monto_cierre: c.monto_cierre,
      nota_cierre: c.nota_cierre ?? undefined,
      cobrosRep: [],
      listaGastos: [],
      ventas,
      totalVentasPdv: ventas.reduce((sum, v) => sum + v.total, 0),
    },
    error: null,
  }
}

export async function getVentaLabelData(ventaId: string): Promise<{ data: VentaLabelFetchData | null; error: string | null }> {
  const ticket = await getVentaParaTicket(ventaId)
  if (!ticket.venta || ticket.error) return { data: null, error: ticket.error }
  return {
    data: {
      id: ticket.venta.id,
      folio: ticket.venta.folio,
      cliente_nombre: ticket.venta.cliente_nombre ?? null,
      items: ticket.venta.items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
      total: ticket.venta.total,
      created_at: ticket.venta.created_at,
    },
    error: null,
  }
}

export async function canAnularVentas(): Promise<boolean> {
  const tallerId = await getCurrentTallerId()
  return Boolean(tallerId)
}

export async function getVentaParaTicket(ventaId: string): Promise<{ venta: VentaCreada | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const ventas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM ventas WHERE id=$1 AND taller_id=$2 LIMIT 1", ventaId, tallerId)
    const venta = ventas[0]
    if (!venta) return { venta: null, error: "Venta no encontrada." }
    if (String(venta.estado ?? "") === "anulado") return { venta: null, error: "Esta venta fue anulada." }
    const detalles = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT producto_id, descripcion, cantidad, precio_unitario, costo_unitario, es_especial, imei_serie, color, condicion, marca, modelo, procesador, ram, almacenamiento FROM detalle_ventas WHERE venta_id=$1", ventaId)
    return {
      venta: {
        id: String(venta.id),
        folio: String(venta.folio ?? ""),
        total: toNum(venta.total),
        descuento: toNum(venta.descuento),
        metodo_pago: String(venta.metodo_pago ?? "efectivo"),
        monto_efectivo: toNum(venta.monto_efectivo),
        monto_tarjeta: toNum(venta.monto_tarjeta),
        monto_transferencia: toNum(venta.monto_transferencia),
        cambio: toNum(venta.cambio),
        created_at: String(venta.created_at),
        items: detalles.map((d) => ({
          producto_id: d.producto_id == null ? undefined : String(d.producto_id),
          descripcion: String(d.descripcion ?? ""),
          cantidad: toNum(d.cantidad),
          precio_unitario: toNum(d.precio_unitario),
          costo_unitario: toNum(d.costo_unitario),
          es_especial: Boolean(d.es_especial),
          imei_serie: d.imei_serie == null ? undefined : String(d.imei_serie),
          color: d.color == null ? undefined : String(d.color),
          condicion: d.condicion == null ? undefined : String(d.condicion),
          marca: d.marca == null ? undefined : String(d.marca),
          modelo: d.modelo == null ? undefined : String(d.modelo),
          procesador: d.procesador == null ? undefined : String(d.procesador),
          ram: d.ram == null ? undefined : String(d.ram),
          almacenamiento: d.almacenamiento == null ? undefined : String(d.almacenamiento),
        })),
        cliente_nombre: venta.cliente_nombre == null ? undefined : String(venta.cliente_nombre),
        cliente_telefono: venta.cliente_telefono == null ? undefined : String(venta.cliente_telefono),
      },
      error: null,
    }
  } catch (error) {
    return { venta: null, error: error instanceof Error ? error.message : "Error al obtener venta" }
  }
}

export async function getCobroReparacionParaTicket(movimientoId: string): Promise<{ data: CobroReparacionTicketData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM movimientos_caja WHERE id=$1 AND taller_id=$2 LIMIT 1", movimientoId, tallerId)
    const m = rows[0]
    if (!m) return { data: null, error: "Movimiento no encontrado." }
    const tipo = String(m.tipo ?? "")
    if (tipo !== "anticipo_reparacion" && tipo !== "liquidacion_reparacion") return { data: null, error: "Este movimiento no es un cobro de reparaciÃ³n." }
    let folio = "-"
    let cliente = "-"
    const rid = m.referencia_id == null ? null : String(m.referencia_id)
    if (rid) {
      const reps = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT folio, cliente_nombre FROM reparaciones WHERE id=$1 AND taller_id=$2 LIMIT 1", rid, tallerId)
      if (reps[0]) {
        folio = String(reps[0].folio ?? "-")
        cliente = String(reps[0].cliente_nombre ?? "-")
      }
    }
    return {
      data: {
        folio,
        cliente,
        conceptos: tipo === "liquidacion_reparacion" ? "LiquidaciÃ³n" : "Anticipo",
        monto: toNum(m.monto),
        metodo_pago: String(m.metodo_pago ?? "efectivo"),
        fechaIso: String(m.fecha ?? ""),
        tipoMov: tipo === "liquidacion_reparacion" ? "liquidacion" : "anticipo",
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al obtener cobro" }
  }
}

export async function anularVenta(ventaId: string, motivo?: string | null): Promise<{ success: boolean; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const resp = await prisma.$queryRawUnsafe<Array<{ ok: boolean; error?: string }>>(
      "SELECT * FROM anular_venta_pdv($1,$2,$3,$4)",
      ventaId,
      tallerId,
      tallerId,
      motivo ?? null,
    )
    const payload = resp[0]
    if (!payload?.ok) return { success: false, error: payload?.error ?? "No se pudo anular la venta." }
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error al anular venta" }
  }
}

export async function cancelarVentaMostrador(ventaId: string) {
  return anularVenta(ventaId, null)
}

export async function reenviarCorteEmail(_cajaId?: string): Promise<{ success: boolean; sentTo?: string; error?: string }> {
  return { success: false, error: "FunciÃ³n PRO temporalmente desactivada" }
}


