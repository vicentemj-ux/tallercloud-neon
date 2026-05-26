"use server"

import { revalidatePath } from "next/cache"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { createRepair } from "@/lib/actions/repairs"
import { getTallerSettings } from "@/lib/actions/settings"
import { getTallerWhatsAppCountryCode, normalizePhoneForWhatsApp, buildWhatsAppUrl } from "@/lib/whatsapp-utils"

export type CotizacionEstado = "pendiente" | "aceptada" | "rechazada" | "convertida"

export interface CotizacionItemInput {
  descripcion: string
  cantidad: number
  precio_unitario: number
}

export interface CotizacionInput {
  cliente_id?: string | null
  cliente_nombre: string
  cliente_telefono?: string | null
  equipo_tipo: string
  marca: string
  modelo: string
  descripcion?: string
  observaciones?: string | null
  descuento?: number
  fecha_expiracion?: string | null
  items: CotizacionItemInput[]
}

export interface Cotizacion extends Omit<CotizacionInput, "items" | "descuento"> {
  id: string
  taller_id: string
  folio: string
  subtotal: number
  descuento: number
  total: number
  estado: CotizacionEstado
  fecha: string
  creado_por: string | null
  reparacion_id: string | null
  created_at: string
  updated_at: string
  items: CotizacionItem[]
}

export interface CotizacionItem extends CotizacionItemInput {
  id: string
  cotizacion_id: string
  taller_id: string
  total: number
  created_at: string
  updated_at: string
}

function sanitizeItems(items: CotizacionItemInput[]): CotizacionItemInput[] {
  return items
    .map((item) => ({
      descripcion: item.descripcion.trim(),
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
    }))
    .filter((item) => item.descripcion && item.cantidad > 0 && item.precio_unitario >= 0)
}

function computeTotals(items: CotizacionItemInput[], descuentoRaw?: number) {
  const subtotal = items.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0)
  const descuento = Math.min(Math.max(Number(descuentoRaw ?? 0), 0), subtotal)
  const total = Math.max(0, subtotal - descuento)
  return {
    subtotal: Number(subtotal.toFixed(2)),
    descuento: Number(descuento.toFixed(2)),
    total: Number(total.toFixed(2)),
  }
}

function mapCotizacionRow(row: any, items: any[]): Cotizacion {
  return {
    id: row.id,
    taller_id: row.taller_id,
    folio: row.folio,
    cliente_id: row.cliente_id,
    cliente_nombre: row.cliente_nombre,
    cliente_telefono: row.cliente_telefono,
    equipo_tipo: row.equipo_tipo,
    marca: row.marca,
    modelo: row.modelo,
    descripcion: row.descripcion,
    observaciones: row.observaciones,
    subtotal: Number(row.subtotal ?? 0),
    descuento: Number(row.descuento ?? 0),
    total: Number(row.total ?? 0),
    estado: row.estado as CotizacionEstado,
    fecha: row.fecha,
    fecha_expiracion: row.fecha_expiracion,
    creado_por: row.creado_por,
    reparacion_id: row.reparacion_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: (items ?? []).map((item) => ({
      id: item.id,
      cotizacion_id: item.cotizacion_id,
      taller_id: item.taller_id,
      descripcion: item.descripcion,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
      total: Number(item.total),
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
  }
}

export async function getCotizaciones(params?: {
  search?: string
  estado?: "todas" | CotizacionEstado
}): Promise<{ data: Cotizacion[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  let query = supabase
    .from("cotizaciones")
    .select("*")
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (params?.estado && params.estado !== "todas") {
    query = query.eq("estado", params.estado)
  }

  if (params?.search?.trim()) {
    const q = params.search.trim()
    query = query.or(`cliente_nombre.ilike.%${q}%,marca.ilike.%${q}%,modelo.ilike.%${q}%,folio.ilike.%${q}%`)
  }

  const { data: rows, error } = await query
  if (error) return { data: [], error: error.message }

  const cotizaciones = rows ?? []
  if (!cotizaciones.length) return { data: [], error: null }

  const ids = cotizaciones.map((cot) => cot.id)
  const { data: itemsRows, error: itemsError } = await supabase
    .from("cotizacion_items")
    .select("*")
    .eq("taller_id", tallerId)
    .in("cotizacion_id", ids)
    .order("created_at", { ascending: true })

  if (itemsError) return { data: [], error: itemsError.message }

  const itemsByCot = new Map<string, any[]>()
  for (const item of itemsRows ?? []) {
    const arr = itemsByCot.get(item.cotizacion_id) ?? []
    arr.push(item)
    itemsByCot.set(item.cotizacion_id, arr)
  }

  return {
    data: cotizaciones.map((row) => mapCotizacionRow(row, itemsByCot.get(row.id) ?? [])),
    error: null,
  }
}

export async function createCotizacion(input: CotizacionInput): Promise<{ data: Cotizacion | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorNombre = await getCurrentActorDisplayName()

  if (!input.cliente_nombre.trim()) return { data: null, error: "El nombre del cliente es requerido." }
  const cleanItems = sanitizeItems(input.items)
  if (!cleanItems.length) return { data: null, error: "Debes agregar al menos un item." }

  const totals = computeTotals(cleanItems, input.descuento)
  const { data: folioData } = await supabase.rpc("get_next_folio", {
    p_taller_id: tallerId,
    p_prefix: "COT",
  })
  const folio = folioData ?? `COT-${Date.now()}`

  const { data: cotRow, error: cotError } = await supabase
    .from("cotizaciones")
    .insert({
      taller_id: tallerId,
      folio,
      cliente_id: input.cliente_id ?? null,
      cliente_nombre: input.cliente_nombre.trim(),
      cliente_telefono: input.cliente_telefono?.trim() || null,
      equipo_tipo: input.equipo_tipo.trim() || "Celular",
      marca: input.marca.trim(),
      modelo: input.modelo.trim(),
      descripcion: input.descripcion?.trim() || "",
      observaciones: input.observaciones?.trim() || null,
      subtotal: totals.subtotal,
      descuento: totals.descuento,
      total: totals.total,
      estado: "pendiente",
      fecha_expiracion: input.fecha_expiracion || null,
      creado_por: actorNombre,
    })
    .select("*")
    .single()

  if (cotError || !cotRow) return { data: null, error: cotError?.message ?? "No se pudo crear la cotizacion." }

  const itemsPayload = cleanItems.map((item) => ({
    taller_id: tallerId,
    cotizacion_id: cotRow.id,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    total: Number((item.cantidad * item.precio_unitario).toFixed(2)),
  }))

  const { data: itemsRows, error: itemsError } = await supabase
    .from("cotizacion_items")
    .insert(itemsPayload)
    .select("*")

  if (itemsError) {
    await supabase.from("cotizaciones").delete().eq("id", cotRow.id).eq("taller_id", tallerId)
    return { data: null, error: itemsError.message }
  }

  revalidatePath("/dashboard/cotizaciones")
  return { data: mapCotizacionRow(cotRow, itemsRows ?? []), error: null }
}

export async function updateCotizacion(
  id: string,
  input: CotizacionInput,
): Promise<{ data: Cotizacion | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const cleanItems = sanitizeItems(input.items)
  if (!input.cliente_nombre.trim()) return { data: null, error: "El nombre del cliente es requerido." }
  if (!cleanItems.length) return { data: null, error: "Debes agregar al menos un item." }

  const totals = computeTotals(cleanItems, input.descuento)

  const { data: current, error: currentError } = await supabase
    .from("cotizaciones")
    .select("estado")
    .eq("id", id)
    .eq("taller_id", tallerId)
    .single()

  if (currentError || !current) return { data: null, error: "Cotizacion no encontrada." }
  if (current.estado === "convertida") return { data: null, error: "No puedes editar una cotizacion convertida." }

  const { data: updatedRow, error: updateError } = await supabase
    .from("cotizaciones")
    .update({
      cliente_id: input.cliente_id ?? null,
      cliente_nombre: input.cliente_nombre.trim(),
      cliente_telefono: input.cliente_telefono?.trim() || null,
      equipo_tipo: input.equipo_tipo.trim() || "Celular",
      marca: input.marca.trim(),
      modelo: input.modelo.trim(),
      descripcion: input.descripcion?.trim() || "",
      observaciones: input.observaciones?.trim() || null,
      subtotal: totals.subtotal,
      descuento: totals.descuento,
      total: totals.total,
      fecha_expiracion: input.fecha_expiracion || null,
    })
    .eq("id", id)
    .eq("taller_id", tallerId)
    .select("*")
    .single()

  if (updateError || !updatedRow) return { data: null, error: updateError?.message ?? "No se pudo actualizar la cotizacion." }

  const { error: deleteItemsError } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id)
    .eq("taller_id", tallerId)
  if (deleteItemsError) return { data: null, error: deleteItemsError.message }

  const { data: itemsRows, error: itemsError } = await supabase
    .from("cotizacion_items")
    .insert(
      cleanItems.map((item) => ({
        taller_id: tallerId,
        cotizacion_id: id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        total: Number((item.cantidad * item.precio_unitario).toFixed(2)),
      })),
    )
    .select("*")
  if (itemsError) return { data: null, error: itemsError.message }

  revalidatePath("/dashboard/cotizaciones")
  return { data: mapCotizacionRow(updatedRow, itemsRows ?? []), error: null }
}

export async function setCotizacionEstado(id: string, estado: CotizacionEstado): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const { error } = await supabase
    .from("cotizaciones")
    .update({ estado })
    .eq("id", id)
    .eq("taller_id", tallerId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/cotizaciones")
  return { error: null }
}

export async function deleteCotizacion(id: string): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const { error } = await supabase
    .from("cotizaciones")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/cotizaciones")
  return { error: null }
}

export async function buildCotizacionWhatsAppLink(cotizacion: Cotizacion): Promise<{ url: string | null; error: string | null }> {
  const { settings } = await getTallerSettings()
  const cc = getTallerWhatsAppCountryCode(settings?.pais)
  const digits = normalizePhoneForWhatsApp(cotizacion.cliente_telefono, cc)
  if (!digits) return { url: null, error: "No hay telefono valido para WhatsApp." }

  const lines = [
    `Hola ${cotizacion.cliente_nombre}, te compartimos tu cotizacion ${cotizacion.folio}.`,
    `Equipo: ${cotizacion.equipo_tipo} ${cotizacion.marca} ${cotizacion.modelo}`.trim(),
    `Total: $${cotizacion.total.toLocaleString("es-419", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "Si estas de acuerdo respondemos para continuar con tu orden.",
  ]
  const url = buildWhatsAppUrl(digits, lines.join("\n"))
  return { url, error: null }
}

export async function convertirCotizacionAReparacion(cotizacionId: string): Promise<{
  success: boolean
  error: string | null
  reparacionId?: string
  folioReparacion?: string
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: cot, error: cotError } = await supabase
    .from("cotizaciones")
    .select("*")
    .eq("id", cotizacionId)
    .eq("taller_id", tallerId)
    .single()

  if (cotError || !cot) return { success: false, error: "Cotizacion no encontrada." }
  if ((cot.estado as CotizacionEstado) === "convertida") return { success: false, error: "Esta cotizacion ya fue convertida." }

  const repair = await createRepair({
    customerName: cot.cliente_nombre,
    customerPhone: cot.cliente_telefono || "",
    tipo_equipo: cot.equipo_tipo || "Celular",
    deviceBrand: cot.marca || "Sin marca",
    deviceModel: cot.modelo || "Sin modelo",
    reportedFault: cot.descripcion || "Diagnostico pendiente segun cotizacion.",
    estimatedPrice: String(cot.total ?? 0),
    deposit: "0",
  })

  if (!repair.success || !repair.repairId) {
    return { success: false, error: repair.error ?? "No se pudo convertir la cotizacion a reparacion." }
  }

  const { error: updateError } = await supabase
    .from("cotizaciones")
    .update({
      estado: "convertida",
      reparacion_id: repair.repairId,
    })
    .eq("id", cotizacionId)
    .eq("taller_id", tallerId)
    .neq("estado", "convertida")

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  revalidatePath("/dashboard/cotizaciones")
  return {
    success: true,
    error: null,
    reparacionId: repair.repairId,
    folioReparacion: repair.folio,
  }
}
