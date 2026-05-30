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

export interface AbrirCajaResult {
  caja: CajaRow | null
  error: string | null
  status: "opened" | "already_open" | "error"
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

function mapCaja(c: {
  id: string
  tenantId: string
  montoInicial: { toNumber: () => number } | number
  montoCierre: { toNumber: () => number } | number | null
  fechaApertura: Date
  fechaCierre: Date | null
  estado: string
  totalEfectivo: { toNumber: () => number } | number
  totalTarjeta: { toNumber: () => number } | number
  totalTransferencia: { toNumber: () => number } | number
  totalVentas: number
  notaCierre: string | null
  numeroCorte: number | null
}): CajaRow {
  return {
    id: c.id,
    taller_id: c.tenantId,
    monto_inicial: Number(c.montoInicial),
    monto_cierre: c.montoCierre == null ? null : Number(c.montoCierre),
    fecha_apertura: c.fechaApertura.toISOString(),
    fecha_cierre: c.fechaCierre?.toISOString() ?? null,
    estado: c.estado === "cerrada" ? "cerrada" : "abierta",
    total_efectivo: Number(c.totalEfectivo),
    total_tarjeta: Number(c.totalTarjeta),
    total_transferencia: Number(c.totalTransferencia),
    total_ventas: Number(c.totalVentas),
    nota_cierre: c.notaCierre,
    numero_corte: c.numeroCorte,
  }
}

function mapHistorialCajaItem(c: {
  id: string
  montoInicial: { toNumber: () => number } | number
  montoCierre: { toNumber: () => number } | number | null
  fechaApertura: Date
  fechaCierre: Date | null
  estado: string
  totalEfectivo: { toNumber: () => number } | number
  totalTarjeta: { toNumber: () => number } | number
  totalTransferencia: { toNumber: () => number } | number
  totalVentas: number
  notaCierre: string | null
  numeroCorte: number | null
}): HistorialCajaItem {
  const montoInicial = Number(c.montoInicial)
  const totalEfectivo = Number(c.totalEfectivo)
  return {
    id: c.id,
    numero_corte: c.numeroCorte,
    fecha_apertura: c.fechaApertura.toISOString(),
    fecha_cierre: c.fechaCierre?.toISOString() ?? null,
    estado: c.estado === "cerrada" ? "cerrada" : "abierta",
    monto_inicial: montoInicial,
    monto_cierre: c.montoCierre == null ? null : Number(c.montoCierre),
    nota_cierre: c.notaCierre,
    total_efectivo: totalEfectivo,
    total_tarjeta: Number(c.totalTarjeta),
    total_transferencia: Number(c.totalTransferencia),
    total_ventas: Number(c.totalVentas),
    saldo_final: montoInicial + totalEfectivo,
  }
}

export async function getCajaAbierta(): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const caja = await prisma.caja.findFirst({
      where: { tenantId: tallerId, estado: "abierta" },
      orderBy: { fechaApertura: "desc" },
    })
    return { caja: caja ? mapCaja(caja) : null, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al verificar caja"
    console.error("[ventas-prisma] getCajaAbierta:", message)
    return { caja: null, error: null }
  }
}

export async function requireCajaAbierta(): Promise<{ caja: CajaRow; error: null } | { caja: null; error: string }> {
  const { caja, error } = await getCajaAbierta()
  if (error) return { caja: null, error: `Error al verificar caja: ${error}` }
  if (!caja) return { caja: null, error: "No hay una caja abierta. Abre la caja antes de realizar esta operacion." }
  return { caja, error: null }
}

export async function abrirCaja(montoInicial: number): Promise<AbrirCajaResult> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const existingOpen = await prisma.caja.findFirst({
      where: { tenantId: tallerId, estado: "abierta" },
      orderBy: { fechaApertura: "desc" },
    })
    if (existingOpen) {
      return {
        status: "already_open",
        caja: mapCaja(existingOpen),
        error: "Ya hay una caja abierta.",
      }
    }

    const count = await prisma.caja.count({ where: { tenantId: tallerId } })
    const numeroCorte = count + 1

    const caja = await prisma.caja.create({
      data: {
        tenantId: tallerId,
        montoInicial,
        estado: "abierta",
        numeroCorte,
      },
    })

    return { status: "opened", caja: mapCaja(caja), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al abrir caja"
    console.error("[ventas-prisma] abrirCaja:", message)
    return { status: "error", caja: null, error: message }
  }
}

export async function cerrarCaja(cajaId: string, montoCierre: number): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.caja.updateMany({
      where: { id: cajaId, tenantId: tallerId, estado: "abierta" },
      data: { estado: "cerrada", montoCierre, fechaCierre: new Date() },
    })
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al cerrar caja" }
  }
}

export async function getProductosDisponibles(): Promise<{ data: ProductoDisponible[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.producto.findMany({
      where: { tenantId: tallerId, stockActual: { gt: 0 } },
      orderBy: { nombre: "asc" },
      take: 300,
    })
    return {
      data: rows.map((row) => ({
        id: row.id,
        taller_id: row.tenantId,
        nombre: row.nombre,
        sku: row.sku,
        categoria: row.categoria,
        precio_venta: Number(row.precioVenta),
        costo: Number(row.costo),
        stock_actual: row.stockActual,
        imagen_url: getInventoryPublicUrl(row.imagenUrl),
        es_equipo: row.esEquipo,
        imei_serie: row.imeiSerie,
        color: row.color,
        capacidad: row.capacidad,
        condicion: row.condicion,
        marca: row.marca,
        modelo: row.modelo,
        procesador: row.procesador,
        ram: row.ram,
        almacenamiento: row.almacenamiento,
      })),
      error: null,
    }
  } catch (error) {
    console.error("[ventas-prisma] getProductosDisponibles:", error)
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar inventario" }
  }
}

export async function crearVenta(input: CrearVentaInput): Promise<{ venta: VentaCreada | null; error: string | null }> {
  const cajaCheck = await requireCajaAbierta()
  if (cajaCheck.error || !cajaCheck.caja) return { venta: null, error: cajaCheck.error ?? "No hay caja abierta" }
  if (!input.items?.length) return { venta: null, error: "El carrito esta vacio" }

  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actorNombre = await getCurrentActorDisplayName()

    const ventaCount = await prisma.venta.count({ where: { tenantId: tallerId } })
    const folio = `VTA-${String(ventaCount + 1).padStart(6, "0")}`

    const ventaDb = await prisma.venta.create({
      data: {
        tenantId: tallerId,
        cajaId: input.caja_id ?? null,
        folio,
        clienteNombre: input.cliente_nombre ?? null,
        clienteId: input.cliente_id ?? null,
        clienteTelefono: input.cliente_telefono ?? null,
        total: input.total,
        descuento: input.descuento ?? 0,
        metodoPago: input.metodo_pago,
        montoEfectivo: input.monto_efectivo,
        montoTarjeta: input.monto_tarjeta,
        montoTransferencia: input.monto_transferencia,
        cambio: input.cambio,
        vendedorNombre: actorNombre,
      },
    })

    const stockItems = input.items.filter((item) => item.producto_id && !item.es_especial)

    for (const item of input.items) {
      await prisma.detalleVenta.create({
        data: {
          ventaId: ventaDb.id,
          productoId: item.producto_id ?? null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          costoUnitario: item.costo_unitario,
          subtotal: item.precio_unitario * item.cantidad,
          esEspecial: item.es_especial,
          imeiSerie: item.imei_serie ?? null,
          color: item.color ?? null,
          condicion: item.condicion ?? null,
          marca: item.marca ?? null,
          modelo: item.modelo ?? null,
          categoria: item.categoria ?? null,
          procesador: item.procesador ?? null,
          ram: item.ram ?? null,
          almacenamiento: item.almacenamiento ?? null,
        },
      })
    }

    for (const item of stockItems) {
      await prisma.producto.update({
        where: { id: item.producto_id!, tenantId: tallerId },
        data: { stockActual: { decrement: item.cantidad } },
      })
    }

    if (input.caja_id) {
      try {
        await prisma.caja.update({
          where: { id: input.caja_id },
          data: {
            totalEfectivo: { increment: input.monto_efectivo - input.cambio },
            totalTarjeta: { increment: input.monto_tarjeta },
            totalTransferencia: { increment: input.monto_transferencia },
            totalVentas: { increment: 1 },
          },
        })
      } catch {
        console.error("[ventas-prisma] caja update fallback")
      }

      try {
        await prisma.movimientoCaja.create({
          data: {
            tenantId: tallerId,
            cajaId: input.caja_id,
            tipo: "venta_pdv",
            referenciaId: ventaDb.id,
            descripcion: `Venta ${folio}${input.cliente_nombre ? ` - ${input.cliente_nombre}` : ""}`,
            monto: input.total,
            metodoPago: input.metodo_pago,
            fecha: new Date(),
          },
        })
      } catch {
        console.error("[ventas-prisma] movimiento_caja fallback")
      }
    }

    revalidatePath("/dashboard/historial-ventas")

    return {
      venta: {
        id: ventaDb.id,
        folio,
        total: input.total,
        descuento: input.descuento ?? 0,
        metodo_pago: input.metodo_pago,
        monto_efectivo: input.monto_efectivo,
        monto_tarjeta: input.monto_tarjeta,
        monto_transferencia: input.monto_transferencia,
        cambio: input.cambio,
        created_at: ventaDb.createdAt.toISOString(),
        items: input.items,
        cliente_nombre: input.cliente_nombre,
        cliente_telefono: input.cliente_telefono,
      },
      error: null,
    }
  } catch (error) {
    console.error("[ventas-prisma] crearVenta:", error instanceof Error ? error.message : String(error))
    return { venta: null, error: error instanceof Error ? error.message : "Error al crear venta" }
  }
}

export async function getHistorialCaja(page = 0, pageSize = 30): Promise<{ data: HistorialCajaItem[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const from = page * pageSize

    const rows = await prisma.caja.findMany({
      where: { tenantId: tallerId, estado: "cerrada" },
      orderBy: { fechaApertura: "desc" },
      skip: from,
      take: pageSize,
    })

    const total = await prisma.caja.count({
      where: { tenantId: tallerId, estado: "cerrada" },
    })

    return { data: rows.map(mapHistorialCajaItem), error: null, total }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error historial caja", total: 0 }
  }
}

export async function getDetalleCaja(cajaId: string): Promise<{ data: DetalleCajaData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const caja = await prisma.caja.findFirst({
      where: { id: cajaId, tenantId: tallerId },
    })
    if (!caja) return { data: null, error: "Caja no encontrada" }

    const ventas = await prisma.venta.findMany({
      where: { cajaId, tenantId: tallerId, estado: "activa" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        folio: true,
        clienteNombre: true,
        total: true,
        metodoPago: true,
        montoEfectivo: true,
        montoTarjeta: true,
        montoTransferencia: true,
        createdAt: true,
      },
    })

    const movimientos = await prisma.movimientoCaja.findMany({
      where: { cajaId, tenantId: tallerId },
      orderBy: { fecha: "asc" },
      select: {
        id: true,
        tipo: true,
        descripcion: true,
        monto: true,
        metodoPago: true,
        fecha: true,
      },
    })

    return {
      data: {
        caja: mapHistorialCajaItem(caja),
        ventas: ventas.map((v) => ({
          id: v.id,
          folio: v.folio,
          cliente_nombre: v.clienteNombre,
          total: Number(v.total),
          metodo_pago: v.metodoPago,
          monto_efectivo: Number(v.montoEfectivo),
          monto_tarjeta: Number(v.montoTarjeta),
          monto_transferencia: Number(v.montoTransferencia),
          created_at: v.createdAt.toISOString(),
        })),
        movimientos: movimientos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          descripcion: m.descripcion,
          monto: Number(m.monto),
          metodo_pago: m.metodoPago,
          fecha: m.fecha.toISOString(),
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

    const mov = await prisma.movimientoCaja.findFirst({
      where: { id: movimientoId, tenantId: tallerId },
    })
    if (!mov) return { data: null, error: "Movimiento no encontrado." }

    const rep = await prisma.reparacion.findFirst({
      where: { id: String(mov.referenciaId ?? ""), tenantId: tallerId },
      select: {
        folio: true,
        cliente: { select: { nombre: true, telefono: true } },
        tipoEquipo: true,
        equipoMarca: true,
        equipoModelo: true,
        costoEstimado: true,
        anticipo: true,
      },
    })
    if (!rep) return { data: null, error: "Reparacion no encontrada." }

    const presupuesto = Number(rep.costoEstimado ?? 0)
    const totalAbonado = Number(rep.anticipo ?? 0)

    return {
      data: {
        movimientoId: mov.id,
        folio: rep.folio,
        clienteNombre: rep.cliente?.nombre ?? "",
        clienteTelefono: rep.cliente?.telefono ?? "",
        dispositivo: `${rep.tipoEquipo ?? ""} ${rep.equipoMarca ?? ""} ${rep.equipoModelo ?? ""}`.trim(),
        metodoPago: mov.metodoPago ?? "efectivo",
        monto: Number(mov.monto),
        totalAbonado,
        presupuesto,
        saldoRestante: Math.max(0, presupuesto - totalAbonado),
        fecha: mov.fecha.toISOString(),
      },
      error: null,
    }
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

    const venta = await prisma.venta.findFirst({
      where: { id: ventaId, tenantId: tallerId },
      include: {
        detalles: {
          select: {
            productoId: true,
            descripcion: true,
            cantidad: true,
            precioUnitario: true,
            costoUnitario: true,
            esEspecial: true,
            imeiSerie: true,
            color: true,
            condicion: true,
            marca: true,
            modelo: true,
            procesador: true,
            ram: true,
            almacenamiento: true,
          },
        },
      },
    })

    if (!venta) return { venta: null, error: "Venta no encontrada." }
    if (venta.estado === "anulado") return { venta: null, error: "Esta venta fue anulada." }

    return {
      venta: {
        id: venta.id,
        folio: venta.folio,
        total: Number(venta.total),
        descuento: Number(venta.descuento),
        metodo_pago: venta.metodoPago,
        monto_efectivo: Number(venta.montoEfectivo),
        monto_tarjeta: Number(venta.montoTarjeta),
        monto_transferencia: Number(venta.montoTransferencia),
        cambio: Number(venta.cambio),
        created_at: venta.createdAt.toISOString(),
        items: venta.detalles.map((d) => ({
          producto_id: d.productoId ?? undefined,
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio_unitario: Number(d.precioUnitario),
          costo_unitario: Number(d.costoUnitario),
          es_especial: d.esEspecial,
          imei_serie: d.imeiSerie ?? undefined,
          color: d.color ?? undefined,
          condicion: d.condicion ?? undefined,
          marca: d.marca ?? undefined,
          modelo: d.modelo ?? undefined,
          procesador: d.procesador ?? undefined,
          ram: d.ram ?? undefined,
          almacenamiento: d.almacenamiento ?? undefined,
        })),
        cliente_nombre: venta.clienteNombre,
        cliente_telefono: venta.clienteTelefono,
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

    const mov = await prisma.movimientoCaja.findFirst({
      where: { id: movimientoId, tenantId: tallerId },
    })
    if (!mov) return { data: null, error: "Movimiento no encontrado." }

    const tipo = mov.tipo
    if (tipo !== "anticipo_reparacion" && tipo !== "liquidacion_reparacion") {
      return { data: null, error: "Este movimiento no es un cobro de reparacion." }
    }

    let folio = "-"
    let cliente = "-"
    const rid = mov.referenciaId
    if (rid) {
      const rep = await prisma.reparacion.findFirst({
        where: { id: rid, tenantId: tallerId },
        select: {
          folio: true,
          cliente: { select: { nombre: true } },
        },
      })
      if (rep) {
        folio = rep.folio
        cliente = rep.cliente?.nombre ?? "-"
      }
    }

    return {
      data: {
        folio,
        cliente,
        conceptos: tipo === "liquidacion_reparacion" ? "Liquidacion" : "Anticipo",
        monto: Number(mov.monto),
        metodo_pago: mov.metodoPago ?? "efectivo",
        fechaIso: mov.fecha.toISOString(),
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

    const result = await prisma.venta.updateMany({
      where: { id: ventaId, tenantId: tallerId, estado: "activa" },
      data: { estado: "anulado" },
    })

    if (result.count === 0) {
      return { success: false, error: "Venta no encontrada o ya anulada." }
    }

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error al anular venta" }
  }
}

export async function cancelarVentaMostrador(ventaId: string) {
  return anularVenta(ventaId, null)
}

export async function reenviarCorteEmail(_cajaId?: string): Promise<{ success: boolean; sentTo?: string; error?: string }> {
  return { success: false, error: "Funcion PRO temporalmente desactivada" }
}
