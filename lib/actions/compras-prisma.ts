"use server"

import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"

export interface Proveedor {
  id: string
  nombre: string
  contacto: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  activo: boolean
  created_at: string
}

export interface DetalleOrden {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  producto_id: string | null
}

export interface OrdenCompra {
  id: string
  folio: string
  proveedor_id: string | null
  proveedor_nombre: string
  estatus: "borrador" | "en_transito" | "pendiente" | "recibida" | "parcial" | "cancelada"
  total: number
  notas: string | null
  fecha_orden: string
  fecha_entrega: string | null
  stock_aplicado: boolean
  created_at: string
  custodio: string | null
  detalle?: DetalleOrden[]
  errores_recepcion?: string[] | null
  articulos_count?: number
}

export interface CreateProveedorInput {
  nombre: string
  contacto?: string | null
  telefono?: string | null
  email?: string | null
  notas?: string | null
}

export interface UpdateProveedorInput extends CreateProveedorInput {
  id: string
}

export interface DetalleInput {
  descripcion: string
  cantidad: number
  precio_unitario: number
  producto_id?: string | null
}

export interface CreateOrdenInput {
  proveedor_id?: string | null
  proveedor_nombre: string
  fecha_orden: string
  fecha_entrega?: string | null
  notas?: string | null
  detalle: DetalleInput[]
}

async function nextFolio(tallerId: string): Promise<string> {
  const prisma = getPrismaClient()
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(folio, '\\D', '', 'g'), '')::int),0) AS n FROM ordenes_compra WHERE taller_id = $1",
    tallerId,
  )
  return `OC-${String((rows[0]?.n ?? 0) + 1).padStart(5, "0")}`
}

export async function getOrdenes(opts?: { search?: string; estatus?: string }): Promise<{ data: OrdenCompra[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const search = opts?.search?.trim() ?? ""
    const pattern = `%${search}%`

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT o.id, o.folio, o.proveedor_id, o.proveedor_nombre, o.estatus, o.total, o.notas, o.fecha_orden, o.fecha_entrega,
              o.stock_aplicado, o.created_at, o.custodio, o.errores_recepcion,
              (SELECT COUNT(*)::int FROM detalle_orden_compra d WHERE d.orden_id = o.id AND d.taller_id = o.taller_id) AS articulos_count
       FROM ordenes_compra o
       WHERE o.taller_id = $1
         AND ($2 = 'todos' OR o.estatus = $2)
         AND ($3 = '' OR o.folio ILIKE $4 OR o.proveedor_nombre ILIKE $4)
       ORDER BY o.created_at DESC
       LIMIT 150`,
      tallerId,
      opts?.estatus ?? "todos",
      search,
      pattern,
    )

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        folio: String(r.folio ?? ""),
        proveedor_id: r.proveedor_id == null ? null : String(r.proveedor_id),
        proveedor_nombre: String(r.proveedor_nombre ?? ""),
        estatus: (r.estatus as OrdenCompra["estatus"]) ?? "borrador",
        total: Number(r.total ?? 0),
        notas: r.notas == null ? null : String(r.notas),
        fecha_orden: String(r.fecha_orden ?? ""),
        fecha_entrega: r.fecha_entrega == null ? null : String(r.fecha_entrega),
        stock_aplicado: Boolean(r.stock_aplicado),
        created_at: String(r.created_at),
        custodio: r.custodio == null ? null : String(r.custodio),
        errores_recepcion: (() => {
          if (r.errores_recepcion == null) return null
          if (Array.isArray(r.errores_recepcion)) return r.errores_recepcion as string[]
          try { return JSON.parse(String(r.errores_recepcion)) as string[] } catch { return null }
        })(),
        articulos_count: Number(r.articulos_count ?? 0),
      })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar ordenes" }
  }
}

export async function getOrdenById(ordenId: string): Promise<{ data: OrdenCompra | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const ordRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, folio, proveedor_id, proveedor_nombre, estatus, total, notas, fecha_orden, fecha_entrega, stock_aplicado, created_at, custodio, errores_recepcion
       FROM ordenes_compra
       WHERE id = $1 AND taller_id = $2
       LIMIT 1`,
      ordenId,
      tallerId,
    )
    const ord = ordRows[0]
    if (!ord) return { data: null, error: "Orden no encontrada." }

    const detRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, descripcion, cantidad, precio_unitario, subtotal, producto_id
       FROM detalle_orden_compra
       WHERE orden_id = $1 AND taller_id = $2
       ORDER BY created_at ASC`,
      ordenId,
      tallerId,
    )

    const data: OrdenCompra = {
      id: String(ord.id),
      folio: String(ord.folio ?? ""),
      proveedor_id: ord.proveedor_id == null ? null : String(ord.proveedor_id),
      proveedor_nombre: String(ord.proveedor_nombre ?? ""),
      estatus: (ord.estatus as OrdenCompra["estatus"]) ?? "borrador",
      total: Number(ord.total ?? 0),
      notas: ord.notas == null ? null : String(ord.notas),
      fecha_orden: String(ord.fecha_orden ?? ""),
      fecha_entrega: ord.fecha_entrega == null ? null : String(ord.fecha_entrega),
      stock_aplicado: Boolean(ord.stock_aplicado),
      created_at: String(ord.created_at),
      custodio: ord.custodio == null ? null : String(ord.custodio),
      errores_recepcion: null,
      detalle: detRows.map((d) => ({
        id: String(d.id),
        descripcion: String(d.descripcion ?? ""),
        cantidad: Number(d.cantidad ?? 0),
        precio_unitario: Number(d.precio_unitario ?? 0),
        subtotal: Number(d.subtotal ?? 0),
        producto_id: d.producto_id == null ? null : String(d.producto_id),
      })),
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error cargando orden" }
  }
}

export async function createOrden(input: CreateOrdenInput): Promise<{ data: OrdenCompra | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actor = await getCurrentActorDisplayName()

    if (!input.detalle?.length) return { data: null, error: "Agrega al menos un producto." }
    if (!input.proveedor_nombre.trim()) return { data: null, error: "El proveedor es requerido." }

    const total = input.detalle.reduce((s, d) => s + Number(d.cantidad) * Number(d.precio_unitario), 0)
    const folio = await nextFolio(tallerId)

    const ordRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO ordenes_compra (taller_id, folio, proveedor_id, proveedor_nombre, estatus, total, notas, fecha_orden, fecha_entrega, custodio)
       VALUES ($1,$2,$3,$4,'borrador',$5,$6,$7,$8,$9)
       RETURNING id, folio, proveedor_id, proveedor_nombre, estatus, total, notas, fecha_orden, fecha_entrega, stock_aplicado, created_at, custodio`,
      tallerId,
      folio,
      input.proveedor_id ?? null,
      input.proveedor_nombre.trim(),
      total,
      input.notas?.trim() || null,
      input.fecha_orden,
      input.fecha_entrega || null,
      actor,
    )
    const orden = ordRows[0]
    if (!orden) return { data: null, error: "No se pudo crear la orden." }

    for (const d of input.detalle) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO detalle_orden_compra (taller_id, orden_id, descripcion, cantidad, precio_unitario, subtotal, producto_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        tallerId,
        String(orden.id),
        d.descripcion.trim(),
        Number(d.cantidad),
        Number(d.precio_unitario),
        Number(d.cantidad) * Number(d.precio_unitario),
        d.producto_id ?? null,
      )
    }

    return {
      data: {
        id: String(orden.id),
        folio: String(orden.folio ?? ""),
        proveedor_id: orden.proveedor_id == null ? null : String(orden.proveedor_id),
        proveedor_nombre: String(orden.proveedor_nombre ?? ""),
        estatus: (orden.estatus as OrdenCompra["estatus"]) ?? "borrador",
        total: Number(orden.total ?? 0),
        notas: orden.notas == null ? null : String(orden.notas),
        fecha_orden: String(orden.fecha_orden ?? ""),
        fecha_entrega: orden.fecha_entrega == null ? null : String(orden.fecha_entrega),
        stock_aplicado: Boolean(orden.stock_aplicado),
        created_at: String(orden.created_at),
        custodio: orden.custodio == null ? null : String(orden.custodio),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error creando orden" }
  }
}

export async function emitirOrden(ordenId: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe(
      "UPDATE ordenes_compra SET estatus = 'en_transito' WHERE id = $1 AND taller_id = $2 AND estatus = 'borrador'",
      ordenId,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error emitiendo orden" }
  }
}

export async function abortarOrden(ordenId: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe(
      "DELETE FROM ordenes_compra WHERE id = $1 AND taller_id = $2 AND estatus = 'borrador'",
      ordenId,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error abortando orden" }
  }
}

export async function getProveedores(): Promise<{ data: Proveedor[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, nombre, contacto, telefono, email, notas, activo, created_at
       FROM proveedores
       WHERE taller_id = $1 AND activo = true
       ORDER BY nombre ASC`,
      tallerId,
    )
    return {
      data: rows.map((r) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ""),
        contacto: r.contacto == null ? null : String(r.contacto),
        telefono: r.telefono == null ? null : String(r.telefono),
        email: r.email == null ? null : String(r.email),
        notas: r.notas == null ? null : String(r.notas),
        activo: Boolean(r.activo),
        created_at: String(r.created_at),
      })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error cargando proveedores" }
  }
}

export async function createProveedor(input: CreateProveedorInput): Promise<{ data: Proveedor | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    if (!input.nombre?.trim()) return { data: null, error: "El nombre es requerido." }

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO proveedores (taller_id, nombre, contacto, telefono, email, notas, activo)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id, nombre, contacto, telefono, email, notas, activo, created_at`,
      tallerId,
      input.nombre.trim(),
      input.contacto?.trim() || null,
      input.telefono?.trim() || null,
      input.email?.trim() || null,
      input.notas?.trim() || null,
    )
    const r = rows[0]
    if (!r) return { data: null, error: "No se pudo crear proveedor." }
    return { data: { id: String(r.id), nombre: String(r.nombre), contacto: r.contacto == null ? null : String(r.contacto), telefono: r.telefono == null ? null : String(r.telefono), email: r.email == null ? null : String(r.email), notas: r.notas == null ? null : String(r.notas), activo: Boolean(r.activo), created_at: String(r.created_at) }, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error creando proveedor" }
  }
}

export async function updateProveedor(input: UpdateProveedorInput): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    if (!input.nombre?.trim()) return { error: "El nombre es requerido." }

    await prisma.$executeRawUnsafe(
      `UPDATE proveedores SET nombre=$1, contacto=$2, telefono=$3, email=$4, notas=$5
       WHERE id=$6 AND taller_id=$7`,
      input.nombre.trim(),
      input.contacto?.trim() || null,
      input.telefono?.trim() || null,
      input.email?.trim() || null,
      input.notas?.trim() || null,
      input.id,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error actualizando proveedor" }
  }
}

export async function deleteProveedor(id: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe("UPDATE proveedores SET activo=false WHERE id=$1 AND taller_id=$2", id, tallerId)
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error eliminando proveedor" }
  }
}

export async function buscarProductosParaCompra(query: string): Promise<{ data: { id: string; nombre: string; stock_actual: number; costo: number; sku: string | null }[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const pattern = `%${query}%`
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; nombre: string; stock_actual: number; costo: number; sku: string | null }>>(
      `SELECT id, nombre, stock_actual, costo, sku
       FROM productos
       WHERE taller_id = $1 AND nombre ILIKE $2
       ORDER BY nombre ASC
       LIMIT 8`,
      tallerId,
      pattern,
    )
    return { data: rows.map((p) => ({ id: p.id, nombre: p.nombre, stock_actual: Number(p.stock_actual ?? 0), costo: Number(p.costo ?? 0), sku: p.sku ?? null })), error: null }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error buscando productos" }
  }
}

export async function recibirOrdenConCreacion(ordenId: string, margenPorcentaje: number | null): Promise<{ success: boolean; creados: number; actualizados: number; errores: string[] }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const errores: string[] = []
    let creados = 0
    let actualizados = 0

    const ordenRows = await prisma.$queryRawUnsafe<Array<{ estatus: string; stock_aplicado: boolean }>>(
      "SELECT estatus, stock_aplicado FROM ordenes_compra WHERE id = $1 AND taller_id = $2 LIMIT 1",
      ordenId,
      tallerId,
    )
    const orden = ordenRows[0]
    if (!orden) return { success: false, creados: 0, actualizados: 0, errores: ["Orden no encontrada."] }
    if (!["pendiente", "parcial", "en_transito"].includes(orden.estatus) || orden.stock_aplicado) {
      return { success: false, creados: 0, actualizados: 0, errores: ["La orden ya fue recibida o cancelada."] }
    }

    const lineas = await prisma.$queryRawUnsafe<Array<{ id: string; descripcion: string; cantidad: number; precio_unitario: number; producto_id: string | null }>>(
      "SELECT id, descripcion, cantidad, precio_unitario, producto_id FROM detalle_orden_compra WHERE orden_id = $1 AND taller_id = $2",
      ordenId,
      tallerId,
    )

    for (const linea of lineas.filter((l) => !l.producto_id)) {
      const costo = Number(linea.precio_unitario)
      const cantidad = Number(linea.cantidad)
      const precioVenta = margenPorcentaje != null && margenPorcentaje > 0 ? costo * (1 + margenPorcentaje / 100) : 0

      const prodRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO productos (taller_id, nombre, costo, precio_venta, stock_actual, stock_minimo, es_equipo)
         VALUES ($1,$2,$3,$4,$5,1,false)
         RETURNING id`,
        tallerId,
        linea.descripcion.trim(),
        costo,
        Number(precioVenta.toFixed(2)),
        cantidad,
      )
      const prod = prodRows[0]
      if (!prod) {
        errores.push(`No se pudo crear "${linea.descripcion}"`)
        continue
      }

      await prisma.$executeRawUnsafe(
        "UPDATE detalle_orden_compra SET producto_id = $1 WHERE id = $2 AND taller_id = $3",
        prod.id,
        linea.id,
        tallerId,
      )
      creados += 1
    }

    for (const linea of lineas.filter((l) => !!l.producto_id)) {
      const prodRows = await prisma.$queryRawUnsafe<Array<{ costo: number; stock_actual: number }>>(
        "SELECT costo, stock_actual FROM productos WHERE id = $1 AND taller_id = $2 LIMIT 1",
        linea.producto_id,
        tallerId,
      )
      const prod = prodRows[0]
      if (!prod) {
        errores.push(`Producto no encontrado para "${linea.descripcion}"`)
        continue
      }

      const costoActual = Number(prod.costo ?? 0)
      const stockActual = Number(prod.stock_actual ?? 0)
      const costoCompra = Number(linea.precio_unitario)
      const cantidad = Number(linea.cantidad)
      const stockTotal = stockActual + cantidad
      const nuevoCosto = stockTotal > 0 ? ((costoActual * stockActual) + (costoCompra * cantidad)) / stockTotal : costoCompra

      await prisma.$executeRawUnsafe(
        "UPDATE productos SET costo = $1, stock_actual = $2 WHERE id = $3 AND taller_id = $4",
        Number(nuevoCosto.toFixed(2)),
        stockTotal,
        linea.producto_id,
        tallerId,
      )
      actualizados += 1
    }

    if (errores.length > 0) {
      await prisma.$executeRawUnsafe(
        "UPDATE ordenes_compra SET errores_recepcion = $1 WHERE id = $2 AND taller_id = $3",
        JSON.stringify(errores),
        ordenId,
        tallerId,
      )
      return { success: false, creados, actualizados, errores }
    }

    await prisma.$executeRawUnsafe(
      "UPDATE ordenes_compra SET estatus='recibida', stock_aplicado=true, errores_recepcion = null WHERE id = $1 AND taller_id = $2",
      ordenId,
      tallerId,
    )

    return { success: true, creados, actualizados, errores: [] }
  } catch (err) {
    return { success: false, creados: 0, actualizados: 0, errores: [err instanceof Error ? err.message : "Error inesperado"] }
  }
}

// Compat helpers used in some legacy paths
export async function getOrdenDetalle(ordenId: string): Promise<{ data: DetalleOrden[]; error: string | null }> {
  const ord = await getOrdenById(ordenId)
  return { data: ord.data?.detalle ?? [], error: ord.error }
}

export async function recibirOrden(ordenId: string): Promise<{ error: string | null }> {
  const res = await recibirOrdenConCreacion(ordenId, null)
  return { error: res.success ? null : res.errores.join("\n") }
}

export async function cancelarOrden(ordenId: string): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe(
      "UPDATE ordenes_compra SET estatus='cancelada' WHERE id=$1 AND taller_id=$2 AND estatus IN ('pendiente','en_transito','borrador')",
      ordenId,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error cancelando orden" }
  }
}
