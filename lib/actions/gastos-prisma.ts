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
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    "SELECT id FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
    tallerId,
  )
  return rows[0]?.id ?? null
}

export async function getGastosTicket(reparacion_id: string): Promise<{ data: ReparacionGasto[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, reparacion_id, concepto, monto, tipo, producto_id, mostrar_cliente, creado_por_nombre, created_at
       FROM reparacion_gastos
       WHERE taller_id = $1 AND reparacion_id = $2
       ORDER BY created_at DESC`,
      tallerId,
      reparacion_id,
    )

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        reparacion_id: String(r.reparacion_id),
        concepto: String(r.concepto ?? ""),
        monto: Number(r.monto ?? 0),
        tipo: (r.tipo as ReparacionGasto["tipo"]) ?? "otro",
        producto_id: r.producto_id == null ? null : String(r.producto_id),
        mostrar_cliente: Boolean(r.mostrar_cliente),
        creado_por_nombre: r.creado_por_nombre == null ? undefined : String(r.creado_por_nombre),
        created_at: String(r.created_at),
      })),
      error: null,
    }
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
    const folioRows = await prisma.$queryRawUnsafe<Array<{ folio: string }>>(
      "SELECT folio FROM reparaciones WHERE id = $1 AND taller_id = $2 LIMIT 1",
      input.reparacion_id,
      tallerId,
    )
    const folio = folioRows[0]?.folio ?? "?"

    const gastoRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO reparacion_gastos (taller_id, reparacion_id, concepto, monto, tipo, producto_id, mostrar_cliente, creado_por_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, reparacion_id, concepto, monto, tipo, producto_id, mostrar_cliente, creado_por_nombre, created_at`,
      tallerId,
      input.reparacion_id,
      input.concepto.trim(),
      input.monto,
      input.tipo,
      input.producto_id ?? null,
      input.mostrar_cliente ?? false,
      actor || "Sistema",
    )
    const gasto = gastoRows[0]
    if (!gasto) return { data: null, error: "No se pudo crear el gasto." }

    const tipoLabel = {
      mano_obra: "Mano de Obra",
      refaccion: "Refacción",
      maquila: "Maquila/Externo",
      insumo: "Insumos",
      otro: "Otros",
    }[input.tipo]

    await prisma.$executeRawUnsafe(
      `INSERT INTO movimientos_caja (taller_id, caja_id, tipo, referencia_id, descripcion, monto, metodo_pago, fecha, vendedor_nombre)
       VALUES ($1,$2,'gasto_reparacion',$3,$4,$5,'efectivo',now(),$6)`,
      tallerId,
      cajaId,
      String(gasto.id),
      `Inversión Folio #${folio} - ${tipoLabel}: ${input.concepto.trim()}`,
      -Math.abs(input.monto),
      actor || "Sistema",
    )

    revalidatePath(`/dashboard/reparaciones/${input.reparacion_id}`)
    revalidatePath("/dashboard/ventas")

    return {
      data: {
        id: String(gasto.id),
        reparacion_id: String(gasto.reparacion_id),
        concepto: String(gasto.concepto ?? ""),
        monto: Number(gasto.monto ?? 0),
        tipo: (gasto.tipo as ReparacionGasto["tipo"]) ?? "otro",
        producto_id: gasto.producto_id == null ? null : String(gasto.producto_id),
        mostrar_cliente: Boolean(gasto.mostrar_cliente),
        creado_por_nombre: gasto.creado_por_nombre == null ? undefined : String(gasto.creado_por_nombre),
        created_at: String(gasto.created_at),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al registrar gasto" }
  }
}

export async function deleteGastoTicket(id: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Array<{ reparacion_id: string }>>(
      "SELECT reparacion_id FROM reparacion_gastos WHERE id = $1 AND taller_id = $2 LIMIT 1",
      id,
      tallerId,
    )
    const reparacionId = rows[0]?.reparacion_id
    if (!reparacionId) return { error: "Gasto no encontrado" }

    await prisma.$executeRawUnsafe("DELETE FROM reparacion_gastos WHERE id = $1 AND taller_id = $2", id, tallerId)
    await prisma.$executeRawUnsafe(
      "DELETE FROM movimientos_caja WHERE taller_id = $1 AND referencia_id = $2 AND tipo IN ('gasto_reparacion','gasto')",
      tallerId,
      id,
    )

    revalidatePath(`/dashboard/reparaciones/${reparacionId}`)
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
    const pattern = `%${query}%`
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; nombre: string; precio_venta: number }>>(
      `SELECT id, nombre, precio_venta FROM productos
       WHERE taller_id = $1 AND nombre ILIKE $2
       ORDER BY nombre ASC
       LIMIT 8`,
      tallerId,
      pattern,
    )
    return { data: rows.map((r) => ({ id: r.id, nombre: r.nombre, precio_venta: Number(r.precio_venta ?? 0) })), error: null }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error buscando productos" }
  }
}

export async function getGastosOperativos(opts?: { desde?: string; hasta?: string }): Promise<{ data: GastoOperativo[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, concepto, categoria, monto, metodo_pago, fecha, notas, created_at
       FROM bitacora_gastos
       WHERE taller_id = $1
         AND ($2::text IS NULL OR fecha >= $2::date)
         AND ($3::text IS NULL OR fecha <= $3::date)
       ORDER BY fecha DESC, created_at DESC
       LIMIT 200`,
      tallerId,
      opts?.desde ?? null,
      opts?.hasta ?? null,
    )
    return {
      data: rows.map((r) => ({
        id: String(r.id),
        concepto: String(r.concepto ?? ""),
        categoria: String(r.categoria ?? ""),
        monto: Number(r.monto ?? 0),
        metodo_pago: String(r.metodo_pago ?? ""),
        fecha: String(r.fecha ?? ""),
        notas: r.notas == null ? null : String(r.notas),
        created_at: String(r.created_at),
      })),
      error: null,
    }
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

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO bitacora_gastos (taller_id, concepto, categoria, monto, metodo_pago, fecha, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, concepto, categoria, monto, metodo_pago, fecha, notas, created_at`,
      tallerId,
      input.concepto.trim(),
      input.categoria,
      input.monto,
      input.metodo_pago,
      input.fecha,
      input.notas?.trim() || null,
    )
    const gasto = rows[0]
    if (!gasto) return { data: null, error: "No se pudo registrar el gasto", cajaAplicada: false }

    let cajaAplicada = false
    if (cajaId) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO movimientos_caja (taller_id, caja_id, tipo, descripcion, monto, metodo_pago, fecha, vendedor_nombre)
         VALUES ($1,$2,'gasto',$3,$4,'efectivo',$5,$6)`,
        tallerId,
        cajaId,
        input.concepto.trim(),
        -Math.abs(input.monto),
        input.fecha,
        actor || "Sistema",
      )
      cajaAplicada = true
    }

    return {
      data: {
        id: String(gasto.id),
        concepto: String(gasto.concepto ?? ""),
        categoria: String(gasto.categoria ?? ""),
        monto: Number(gasto.monto ?? 0),
        metodo_pago: String(gasto.metodo_pago ?? ""),
        fecha: String(gasto.fecha ?? ""),
        notas: gasto.notas == null ? null : String(gasto.notas),
        created_at: String(gasto.created_at),
      },
      error: null,
      cajaAplicada,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al registrar gasto operativo", cajaAplicada: false }
  }
}

export async function deleteGastoOperativo(id: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe("DELETE FROM bitacora_gastos WHERE id = $1 AND taller_id = $2", id, tallerId)
    await prisma.$executeRawUnsafe(
      "DELETE FROM movimientos_caja WHERE taller_id = $1 AND referencia_id = $2 AND tipo = 'gasto'",
      tallerId,
      id,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al eliminar gasto operativo" }
  }
}
