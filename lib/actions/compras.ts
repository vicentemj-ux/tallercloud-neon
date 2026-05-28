"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** Errores persistidos de intentos de recepcion fallidos */
  errores_recepcion?: string[] | null
  /** Conteo de lineas de detalle (population) */
  articulos_count?: number
}

export interface ComprasStats {
  compradoMes: number
  enTransito: number
  recibidas: number
  proveedoresCount: number
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

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getComprasStats(): Promise<ComprasStats> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const now   = new Date()
  const mesIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  const [mesResult, transitoResult, recibResult, provResult] = await Promise.all([
    supabase
      .from("ordenes_compra")
      .select("total")
      .eq("taller_id", tallerId)
      .eq("estatus", "recibida")
      .gte("fecha_orden", mesIni),
    supabase
      .from("ordenes_compra")
      .select("*", { count: "planned", head: true })
      .eq("taller_id", tallerId)
      .eq("estatus", "en_transito"),
    supabase
      .from("ordenes_compra")
      .select("*", { count: "planned", head: true })
      .eq("taller_id", tallerId)
      .eq("estatus", "recibida"),
    supabase
      .from("proveedores")
      .select("*", { count: "planned", head: true })
      .eq("taller_id", tallerId)
      .eq("activo", true),
  ])

  return {
    compradoMes:      (mesResult.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0),
    enTransito:       transitoResult.count   ?? 0,
    recibidas:        recibResult.count  ?? 0,
    proveedoresCount: provResult.count   ?? 0,
  }
}

// ─── Ordenes ──────────────────────────────────────────────────────────────────

export async function getOrdenes(opts?: {
  search?: string
  estatus?: string
}): Promise<{ data: OrdenCompra[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  let q = supabase
    .from("ordenes_compra")
    .select("id, folio, proveedor_id, proveedor_nombre, estatus, total, notas, fecha_orden, fecha_entrega, stock_aplicado, created_at, custodio, errores_recepcion, detalle_orden_compra(count)")
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .limit(150)

  if (opts?.estatus && opts.estatus !== "todos") q = q.eq("estatus", opts.estatus)
  if (opts?.search?.trim()) {
    q = q.or(`folio.ilike.%${opts.search.trim()}%,proveedor_nombre.ilike.%${opts.search.trim()}%`)
  }

  const { data, error } = await q
  if (error) return { data: [], error: error.message }

  const mapped = (data ?? []).map((row: any) => {
    const count = Array.isArray(row.detalle_orden_compra)
      ? (row.detalle_orden_compra[0]?.count ?? 0)
      : 0
    delete row.detalle_orden_compra
    return { ...row, articulos_count: Number(count) } as OrdenCompra
  })

  return { data: mapped, error: null }
}

export async function getOrdenById(
  ordenId: string
): Promise<{ data: OrdenCompra | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("ordenes_compra")
    .select("id, folio, proveedor_id, proveedor_nombre, estatus, total, notas, fecha_orden, fecha_entrega, stock_aplicado, created_at, custodio, errores_recepcion")
    .eq("id", ordenId)
    .eq("taller_id", tallerId)
    .single()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: "Orden no encontrada." }

  // Traer detalle
  const { data: det, error: detErr } = await supabase
    .from("detalle_orden_compra")
    .select("id, descripcion, cantidad, precio_unitario, subtotal, producto_id")
    .eq("orden_id", ordenId)
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: true })

  if (detErr) return { data: null, error: detErr.message }

  const orden = data as OrdenCompra
  orden.detalle = (det ?? []) as DetalleOrden[]
  return { data: orden, error: null }
}

export async function getOrdenDetalle(
  ordenId: string
): Promise<{ data: DetalleOrden[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("detalle_orden_compra")
    .select("id, descripcion, cantidad, precio_unitario, subtotal, producto_id")
    .eq("orden_id", ordenId)
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as DetalleOrden[], error: null }
}

export async function createOrden(
  input: CreateOrdenInput
): Promise<{ data: OrdenCompra | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorNombre = await getCurrentActorDisplayName()

  if (!input.detalle?.length) return { data: null, error: "Agrega al menos un producto." }
  if (!input.proveedor_nombre.trim()) return { data: null, error: "El proveedor es requerido." }

  const total = input.detalle.reduce(
    (s, d) => s + (Number(d.cantidad) * Number(d.precio_unitario)),
    0
  )

  // Folio: OC-NNN usando el RPC existente
  const { data: folioData } = await supabase.rpc("get_next_folio", {
    p_taller_id: tallerId,
    p_prefix:    "OC",
  })
  const folio = folioData ?? `OC-${Date.now()}`

  const { data: orden, error: ordErr } = await supabase
    .from("ordenes_compra")
    .insert({
      taller_id:        tallerId,
      folio,
      proveedor_id:     input.proveedor_id ?? null,
      proveedor_nombre: input.proveedor_nombre.trim(),
      estatus:          "borrador",
      total,
      notas:            input.notas?.trim() || null,
      fecha_orden:      input.fecha_orden,
      fecha_entrega:    input.fecha_entrega || null,
      custodio:         actorNombre,
    })
    .select()
    .single()

  if (ordErr || !orden) return { data: null, error: ordErr?.message ?? "No se pudo crear la orden." }

  const detalles = input.detalle.map(d => ({
    taller_id:       tallerId,
    orden_id:        (orden as OrdenCompra).id,
    descripcion:     d.descripcion.trim(),
    cantidad:        Number(d.cantidad),
    precio_unitario: Number(d.precio_unitario),
    subtotal:        Number(d.cantidad) * Number(d.precio_unitario),
    producto_id:     d.producto_id ?? null,
  }))

  const { error: detErr } = await supabase.from("detalle_orden_compra").insert(detalles)
  if (detErr) {
    await supabase.from("ordenes_compra").delete().eq("id", (orden as OrdenCompra).id)
    return { data: null, error: detErr.message }
  }

  return { data: orden as OrdenCompra, error: null }
}

export async function emitirOrden(
  ordenId: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { error } = await supabase
    .from("ordenes_compra")
    .update({ estatus: "en_transito" })
    .eq("id", ordenId)
    .eq("taller_id", tallerId)
    .eq("estatus", "borrador")

  return { error: error?.message ?? null }
}

export async function abortarOrden(
  ordenId: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // Solo borradores pueden ser eliminados
  const { error } = await supabase
    .from("ordenes_compra")
    .delete()
    .eq("id", ordenId)
    .eq("taller_id", tallerId)
    .eq("estatus", "borrador")

  return { error: error?.message ?? null }
}

export async function recibirOrden(
  ordenId: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { error } = await supabase.rpc("recibir_orden_compra", {
    p_orden_id:  ordenId,
    p_taller_id: tallerId,
  })

  return { error: error?.message ?? null }
}

export async function cancelarOrden(
  ordenId: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { error } = await supabase
    .from("ordenes_compra")
    .update({ estatus: "cancelada" })
    .eq("id", ordenId)
    .eq("taller_id", tallerId)
    .in("estatus", ["pendiente", "en_transito", "borrador"])

  return { error: error?.message ?? null }
}

// ─── Proveedores ──────────────────────────────────────────────────────────────

export async function getProveedores(): Promise<{ data: Proveedor[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, contacto, telefono, email, notas, activo, created_at")
    .eq("taller_id", tallerId)
    .eq("activo", true)
    .order("nombre", { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as Proveedor[], error: null }
}

export async function createProveedor(
  input: CreateProveedorInput
): Promise<{ data: Proveedor | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  if (!input.nombre?.trim()) return { data: null, error: "El nombre es requerido." }

  const { data, error } = await supabase
    .from("proveedores")
    .insert({
      taller_id: tallerId,
      nombre:    input.nombre.trim(),
      contacto:  input.contacto?.trim() || null,
      telefono:  input.telefono?.trim() || null,
      email:     input.email?.trim() || null,
      notas:     input.notas?.trim() || null,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as Proveedor, error: null }
}

export async function updateProveedor(
  input: UpdateProveedorInput
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  if (!input.nombre?.trim()) return { error: "El nombre es requerido." }

  const { error } = await supabase
    .from("proveedores")
    .update({
      nombre:   input.nombre.trim(),
      contacto: input.contacto?.trim() || null,
      telefono: input.telefono?.trim() || null,
      email:    input.email?.trim() || null,
      notas:    input.notas?.trim() || null,
    })
    .eq("id", input.id)
    .eq("taller_id", tallerId)

  return { error: error?.message ?? null }
}

export async function deleteProveedor(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // Soft delete — mantiene historial en ordenes existentes
  const { error } = await supabase
    .from("proveedores")
    .update({ activo: false })
    .eq("id", id)
    .eq("taller_id", tallerId)

  return { error: error?.message ?? null }
}

// ─── Productos (busqueda para vincular a detalle) ─────────────────────────────

export async function buscarProductosParaCompra(
  query: string
): Promise<{ data: { id: string; nombre: string; stock_actual: number; costo: number; sku: string | null }[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, stock_actual, costo, sku")
    .eq("taller_id", tallerId)
    .ilike("nombre", `%${query}%`)
    .limit(8)

  if (error) return { data: [], error: error.message }
  return {
    data: (data ?? []).map(p => ({
      id:           p.id as string,
      nombre:       p.nombre as string,
      stock_actual: Number(p.stock_actual ?? 0),
      costo:        Number(p.costo ?? 0),
      sku:          (p.sku as string | null) ?? null,
    })),
    error: null,
  }
}

// ─── Recepcion con creacion de productos ──────────────────────────────────────

export interface ProductoNuevoPreview {
  descripcion: string
  cantidad: number
  costo: number
  precioCalculado: number
}

export interface ProductoExistentePreview {
  producto_id: string
  descripcion: string
  cantidad: number
  costoActual: number
  costoCompra: number
  nuevoCostoPonderado: number
}

export interface PreviewRecepcion {
  nuevos: ProductoNuevoPreview[]
  existentes: ProductoExistentePreview[]
  totalNuevos: number
  totalExistentes: number
}

/** Obtiene un preview de que pasara al recibir la orden (productos nuevos vs existentes). */
export async function previewRecepcion(
  ordenId: string
): Promise<{ data: PreviewRecepcion | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // 1. Obtener la orden y validar que esta en_transito/pendiente/parcial
  const { data: orden, error: ordenErr } = await supabase
    .from("ordenes_compra")
    .select("id, estatus, stock_aplicado")
    .eq("id", ordenId)
    .eq("taller_id", tallerId)
    .single()

  if (ordenErr || !orden) {
    return { data: null, error: "Orden no encontrada." }
  }
  if (!["pendiente", "parcial", "en_transito"].includes(orden.estatus) || orden.stock_aplicado) {
    return { data: null, error: "La orden ya fue recibida o cancelada." }
  }

  // 2. Obtener lineas del detalle
  const { data: lineas, error: lineasErr } = await supabase
    .from("detalle_orden_compra")
    .select("id, descripcion, cantidad, precio_unitario, producto_id")
    .eq("orden_id", ordenId)
    .eq("taller_id", tallerId)

  if (lineasErr || !lineas) {
    return { data: null, error: lineasErr?.message ?? "No se pudieron leer las lineas." }
  }

  const nuevosRaw = lineas.filter(l => !l.producto_id)
  const existentesRaw = lineas.filter(l => !!l.producto_id)

  // 3. Para existentes, calcular costo ponderado
  const existentes: ProductoExistentePreview[] = []
  for (const linea of existentesRaw) {
    const { data: prod } = await supabase
      .from("productos")
      .select("costo, stock_actual")
      .eq("id", linea.producto_id)
      .eq("taller_id", tallerId)
      .single()

    const costoActual = Number(prod?.costo ?? 0)
    const stockActual = Number(prod?.stock_actual ?? 0)
    const costoCompra = Number(linea.precio_unitario)
    const cantidad = Number(linea.cantidad)
    const stockTotal = stockActual + cantidad
    const nuevoCostoPonderado = stockTotal > 0
      ? ((costoActual * stockActual) + (costoCompra * cantidad)) / stockTotal
      : costoCompra

    existentes.push({
      producto_id: linea.producto_id!,
      descripcion: linea.descripcion,
      cantidad,
      costoActual,
      costoCompra,
      nuevoCostoPonderado,
    })
  }

  const nuevos: ProductoNuevoPreview[] = nuevosRaw.map(l => ({
    descripcion: l.descripcion,
    cantidad: Number(l.cantidad),
    costo: Number(l.precio_unitario),
    precioCalculado: 0,
  }))

  return {
    data: {
      nuevos,
      existentes,
      totalNuevos: nuevos.length,
      totalExistentes: existentes.length,
    },
    error: null,
  }
}

/** Recibe la orden: crea productos nuevos, actualiza existentes con costo ponderado, suma stock. */
export async function recibirOrdenConCreacion(
  ordenId: string,
  margenPorcentaje: number | null
): Promise<{
  success: boolean
  creados: number
  actualizados: number
  errores: string[]
}> {
  try {
    const { supabase, tallerId } = await createCurrentTenantClient()
    const errores: string[] = []
    let creados = 0
    let actualizados = 0

    // 1. Validar orden
    const { data: orden, error: ordenErr } = await supabase
      .from("ordenes_compra")
      .select("id, estatus, stock_aplicado")
      .eq("id", ordenId)
      .eq("taller_id", tallerId)
      .single()

    if (ordenErr || !orden) {
      return { success: false, creados: 0, actualizados: 0, errores: ["Orden no encontrada."] }
    }
    if (!["pendiente", "parcial", "en_transito"].includes(orden.estatus) || orden.stock_aplicado) {
      return { success: false, creados: 0, actualizados: 0, errores: ["La orden ya fue recibida o cancelada."] }
    }

    // 2. Obtener lineas
    const { data: lineas, error: lineasErr } = await supabase
      .from("detalle_orden_compra")
      .select("id, descripcion, cantidad, precio_unitario, producto_id")
      .eq("orden_id", ordenId)
      .eq("taller_id", tallerId)

    if (lineasErr || !lineas) {
      return { success: false, creados: 0, actualizados: 0, errores: [lineasErr?.message ?? "Error leyendo lineas."] }
    }

    // 3. Procesar productos NUEVOS
    for (const linea of lineas.filter(l => !l.producto_id)) {
      const costo = Number(linea.precio_unitario)
      const cantidad = Number(linea.cantidad)
      const precioVenta = margenPorcentaje != null && margenPorcentaje > 0
        ? costo * (1 + margenPorcentaje / 100)
        : 0

      const { data: nuevoProducto, error: insertError } = await supabase
        .from("productos")
        .insert({
          taller_id:      tallerId,
          nombre:         linea.descripcion.trim(),
          costo,
          precio_venta:   Number(precioVenta.toFixed(2)),
          stock_actual:   cantidad,
          stock_minimo:   1,
          es_equipo:      false,
          sku:            null,
          codigo_barras:  null,
          imagen_url:     null,
          categoria:      null,
          descripcion:    null,
          marca:          null,
          modelo:         null,
          ubicacion:      null,
          imei_serie:     null,
          color:          null,
          condicion:      null,
        })
        .select("id")
        .single()

      if (insertError || !nuevoProducto) {
        errores.push(`No se pudo crear "${linea.descripcion}": ${insertError?.message ?? "Error desconocido"}`)
        continue
      }

      // Vincular la linea al nuevo producto
      const { error: linkError } = await supabase
        .from("detalle_orden_compra")
        .update({ producto_id: nuevoProducto.id })
        .eq("id", linea.id)
        .eq("taller_id", tallerId)

      if (linkError) {
        errores.push(`Producto creado pero no vinculado a linea "${linea.descripcion}"`)
      }

      creados++
    }

    // 4. Procesar productos EXISTENTES (costo ponderado + stock)
    for (const linea of lineas.filter(l => !!l.producto_id)) {
      const { data: prod, error: prodErr } = await supabase
        .from("productos")
        .select("costo, stock_actual")
        .eq("id", linea.producto_id)
        .eq("taller_id", tallerId)
        .single()

      if (prodErr || !prod) {
        errores.push(`Producto no encontrado para "${linea.descripcion}"`)
        continue
      }

      const costoActual = Number(prod.costo ?? 0)
      const stockActual = Number(prod.stock_actual ?? 0)
      const costoCompra = Number(linea.precio_unitario)
      const cantidad = Number(linea.cantidad)
      const stockTotal = stockActual + cantidad

      const nuevoCosto = stockTotal > 0
        ? ((costoActual * stockActual) + (costoCompra * cantidad)) / stockTotal
        : costoCompra

      const { error: updateError } = await supabase
        .from("productos")
        .update({
          costo:        Number(nuevoCosto.toFixed(2)),
          stock_actual: stockTotal,
        })
        .eq("id", linea.producto_id)
        .eq("taller_id", tallerId)

      if (updateError) {
        errores.push(`No se pudo actualizar "${linea.descripcion}": ${updateError.message}`)
        continue
      }

      actualizados++
    }

    // 5. Si hay errores, persistirlos en la orden (para diagnostico posterior) y NO marcar como recibida
    if (errores.length > 0) {
      await supabase
        .from("ordenes_compra")
        .update({ errores_recepcion: JSON.stringify(errores) })
        .eq("id", ordenId)
        .eq("taller_id", tallerId)

      return { success: false, creados, actualizados, errores }
    }

    // 6. Marcar orden como recibida (y limpiar errores si existian)
    const { error: recibirError } = await supabase
      .from("ordenes_compra")
      .update({
        estatus:            "recibida",
        stock_aplicado:     true,
        errores_recepcion:  null,
      })
      .eq("id", ordenId)
      .eq("taller_id", tallerId)

    if (recibirError) {
      errores.push(`Orden procesada pero no se pudo marcar como recibida: ${recibirError.message}`)
      await supabase
        .from("ordenes_compra")
        .update({ errores_recepcion: JSON.stringify(errores) })
        .eq("id", ordenId)
        .eq("taller_id", tallerId)
      return { success: false, creados, actualizados, errores }
    }

    return { success: true, creados, actualizados, errores: [] }
  } catch (err) {
    console.error("[recibirOrdenConCreacion] unexpected error:", err)
    const msg = err instanceof Error ? err.message : "Error inesperado en el servidor."
    return { success: false, creados: 0, actualizados: 0, errores: [msg] }
  }
}
