"use server"

import { revalidatePath } from "next/cache"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"

export interface ReparacionGasto {
  id: string
  reparacion_id: string
  concepto: string
  monto: number
  tipo: "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"
  producto_id: string | null
  mostrar_cliente: boolean
  creado_por_nombre?: string
  created_at: string
}

export interface GastoOperativo {
  id: string
  concepto: string
  categoria: string
  monto: number
  metodo_pago: string
  fecha: string
  notas: string | null
  created_at: string
}

export interface AddGastoTicketInput {
  reparacion_id: string
  concepto: string
  monto: number
  tipo: "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"
  producto_id?: string | null
  mostrar_cliente?: boolean
}

export interface AddGastoOperativoInput {
  concepto: string
  categoria: string
  monto: number
  metodo_pago: string
  fecha: string
  notas?: string | null
}

async function getCajaAbiertaId(tallerId: string): Promise<string | null> {
  const prisma = getPrismaClient()
  const caja = await prisma.caja.findFirst({
    where: { tenantId: tallerId, estado: "abierta" },
    orderBy: { fechaApertura: "desc" },
    select: { id: true },
  })
  return caja?.id ?? null
}

function mapGastoReparacion(r: {
  id: string
  reparacionId: string
  concepto: string
  monto: { toNumber: () => number } | number
  tipo: string
  productoId: string | null
  mostrarCliente: boolean
  creadoPorNombre: string | null
  createdAt: Date
}): ReparacionGasto {
  return {
    id: r.id,
    reparacion_id: r.reparacionId,
    concepto: r.concepto,
    monto: typeof r.monto === "number" ? r.monto : r.monto.toNumber(),
    tipo: r.tipo as ReparacionGasto["tipo"],
    producto_id: r.productoId,
    mostrar_cliente: r.mostrarCliente,
    creado_por_nombre: r.creadoPorNombre ?? undefined,
    created_at: r.createdAt.toISOString(),
  }
}

function mapGastoOperativo(r: {
  id: string
  concepto: string
  categoria: string
  monto: { toNumber: () => number } | number
  metodoPago: string
  fecha: Date
  notas: string | null
  createdAt: Date
}): GastoOperativo {
  return {
    id: r.id,
    concepto: r.concepto,
    categoria: r.categoria,
    monto: typeof r.monto === "number" ? r.monto : r.monto.toNumber(),
    metodo_pago: r.metodoPago,
    fecha: r.fecha.toISOString().split("T")[0],
    notas: r.notas,
    created_at: r.createdAt.toISOString(),
  }
}

export async function getGastosTicket(reparacion_id: string): Promise<{ data: ReparacionGasto[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.gastoReparacion.findMany({
      where: { tenantId: tallerId, reparacionId: reparacion_id },
      orderBy: { createdAt: "desc" },
    })
    return { data: rows.map(mapGastoReparacion), error: null }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar gastos" }
  }
}

export async function addGastoTicket(input: AddGastoTicketInput): Promise<{ data: ReparacionGasto | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const cajaId = await getCajaAbiertaId(tallerId)
    if (!cajaId) return { data: null, error: "No hay caja abierta. Abre la caja antes de registrar un gasto." }

    const actor = await getCurrentActorDisplayName()

    const reparacion = await prisma.reparacion.findUnique({
      where: { id: input.reparacion_id, tenantId: tallerId },
      select: { folio: true },
    })
    const folio = reparacion?.folio ?? "?"

    const gasto = await prisma.gastoReparacion.create({
      data: {
        tenantId: tallerId,
        reparacionId: input.reparacion_id,
        concepto: input.concepto.trim(),
        monto: input.monto,
        tipo: input.tipo,
        productoId: input.producto_id ?? null,
        mostrarCliente: input.mostrar_cliente ?? false,
        creadoPorNombre: actor || "Sistema",
      },
    })

    const tipoLabel = {
      mano_obra: "Mano de Obra",
      refaccion: "Refaccion",
      maquila: "Maquila/Externo",
      insumo: "Insumos",
      otro: "Otros",
    }[input.tipo]

    await prisma.movimientoCaja.create({
      data: {
        tenantId: tallerId,
        cajaId,
        tipo: "gasto_reparacion",
        referenciaId: gasto.id,
        descripcion: `Inversion Folio #${folio} - ${tipoLabel}: ${input.concepto.trim()}`,
        monto: -Math.abs(input.monto),
        metodoPago: "efectivo",
        fecha: new Date(),
        vendedorNombre: actor || "Sistema",
      },
    })

    revalidatePath(`/dashboard/reparaciones/${input.reparacion_id}`)
    revalidatePath("/dashboard/ventas")

    return { data: mapGastoReparacion(gasto), error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al registrar gasto" }
  }
}

export async function deleteGastoTicket(id: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const gasto = await prisma.gastoReparacion.findFirst({
      where: { id, tenantId: tallerId },
      select: { reparacionId: true },
    })
    if (!gasto) return { error: "Gasto no encontrado" }

    await prisma.gastoReparacion.delete({ where: { id } })
    await prisma.movimientoCaja.deleteMany({
      where: { tenantId: tallerId, referenciaId: id, tipo: { in: ["gasto_reparacion", "gasto"] } },
    })

    revalidatePath(`/dashboard/reparaciones/${gasto.reparacionId}`)
    revalidatePath("/dashboard/ventas")
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al eliminar gasto" }
  }
}

export async function searchProductosParaGasto(query: string): Promise<{ data: { id: string; nombre: string; precio_venta: number }[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.producto.findMany({
      where: {
        tenantId: tallerId,
        nombre: { contains: query, mode: "insensitive" },
      },
      select: { id: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
      take: 8,
    })
    return {
      data: rows.map((r) => ({ id: r.id, nombre: r.nombre, precio_venta: Number(r.precioVenta) })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error buscando productos" }
  }
}

export async function getGastosOperativos(opts?: { desde?: string; hasta?: string }): Promise<{ data: GastoOperativo[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const where: Record<string, unknown> = { tenantId: tallerId }
    if (opts?.desde || opts?.hasta) {
      const fechaFilter: Record<string, Date> = {}
      if (opts?.desde) fechaFilter.gte = new Date(opts.desde)
      if (opts?.hasta) fechaFilter.lte = new Date(opts.hasta + "T23:59:59.999Z")
      where.fecha = fechaFilter
    }

    const rows = await prisma.gastoOperativo.findMany({
      where,
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 200,
    })
    return { data: rows.map(mapGastoOperativo), error: null }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar gastos operativos" }
  }
}

export async function addGastoOperativo(input: AddGastoOperativoInput): Promise<{ data: GastoOperativo | null; error: string | null; cajaAplicada?: boolean }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actor = await getCurrentActorDisplayName()

    let cajaId: string | null = null
    if (input.metodo_pago === "efectivo") {
      cajaId = await getCajaAbiertaId(tallerId)
      if (!cajaId) return { data: null, error: "No hay caja abierta. Abre la caja antes de registrar un gasto.", cajaAplicada: false }
    }

    const gasto = await prisma.gastoOperativo.create({
      data: {
        tenantId: tallerId,
        concepto: input.concepto.trim(),
        categoria: input.categoria,
        monto: input.monto,
        metodoPago: input.metodo_pago,
        fecha: new Date(input.fecha),
        notas: input.notas?.trim() || null,
      },
    })

    let cajaAplicada = false
    if (cajaId) {
      await prisma.movimientoCaja.create({
        data: {
          tenantId: tallerId,
          cajaId,
          tipo: "gasto",
          descripcion: input.concepto.trim(),
          monto: -Math.abs(input.monto),
          metodoPago: "efectivo",
          fecha: new Date(input.fecha),
          vendedorNombre: actor || "Sistema",
        },
      })
      cajaAplicada = true
    }

    return { data: mapGastoOperativo(gasto), error: null, cajaAplicada }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al registrar gasto operativo", cajaAplicada: false }
  }
}

export async function deleteGastoOperativo(id: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const gasto = await prisma.gastoOperativo.findFirst({
      where: { id, tenantId: tallerId },
      select: { id: true },
    })
    if (!gasto) return { error: "Gasto no encontrado" }

    await prisma.gastoOperativo.delete({ where: { id } })
    await prisma.movimientoCaja.deleteMany({
      where: { tenantId: tallerId, referenciaId: id, tipo: "gasto" },
    })

    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al eliminar gasto operativo" }
  }
}
