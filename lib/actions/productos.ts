"use server"

/** Todas las consultas usan la tabla `productos` (inventario); no hay tabla `inventario` en este proyecto. */

import { revalidatePath } from "next/cache"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { BUCKETS, normalizeInventoryImagePathForDb } from "@/lib/storage"

const createClient = async () => (await createCurrentTenantClient()).supabase

export interface ProductoRow {
  id: string
  taller_id: string
  nombre: string
  sku: string | null
  codigo_barras: string | null
  imagen_url: string | null
  categoria: string | null
  descripcion: string | null
  marca?: string | null
  modelo?: string | null
  ubicacion?: string | null
  costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  es_equipo: boolean
  imei_serie: string | null
  color: string | null
  /** @deprecated Preferir almacenamiento */
  capacidad?: string | null
  procesador?: string | null
  ram?: string | null
  almacenamiento?: string | null
  condicion: string | null
  created_at: string
}

export interface CreateProductoInput {
  id?: string
  nombre: string
  sku?: string
  codigo_barras?: string
  /** Path relativo en el bucket de inventario (env `NEXT_PUBLIC_SUPABASE_INVENTORY_BUCKET`, ej. `inventario`) o URL absoluta. */
  imagen_url?: string
  categoria?: string
  descripcion?: string
  marca?: string
  modelo?: string
  ubicacion?: string
  costo?: number
  precio_venta?: number
  stock_actual?: number
  stock_minimo?: number
  es_equipo?: boolean
  imei_serie?: string
  color?: string
  capacidad?: string
  procesador?: string
  ram?: string
  almacenamiento?: string
  condicion?: string
}

export interface BulkImportProductoInput {
  nombre: string
  sku?: string
  categoria?: string
  codigo_barras?: string
  costo?: number | string
  precio_venta?: number | string
  stock_actual?: number | string
  stock_minimo?: number | string
}

export async function getProductos(
  page = 0,
  pageSize = 50,
  search = ""
): Promise<{ data: ProductoRow[]; error: string | null; total: number }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("productos")
    .select("id, taller_id, nombre, sku, codigo_barras, imagen_url, categoria, descripcion, marca, modelo, ubicacion, costo, precio_venta, stock_actual, stock_minimo, es_equipo, imei_serie, color, capacidad, procesador, ram, almacenamiento, condicion, created_at", { count: "exact" })
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (search.trim()) {
    const q = search.trim().replace(/%/g, "\\%")
    const p = `%${q}%`
    query = query.or(
      [
        `nombre.ilike.${p}`,
        `sku.ilike.${p}`,
        `codigo_barras.ilike.${p}`,
        `descripcion.ilike.${p}`,
        `marca.ilike.${p}`,
        `modelo.ilike.${p}`,
        `ubicacion.ilike.${p}`,
        `procesador.ilike.${p}`,
        `ram.ilike.${p}`,
        `almacenamiento.ilike.${p}`,
        `capacidad.ilike.${p}`,
        `color.ilike.${p}`,
        `condicion.ilike.${p}`,
        `imei_serie.ilike.${p}`,
        `categoria.ilike.${p}`,
      ].join(",")
    )
  }

  const { data, error, count } = await query

  if (error) {
    console.error("Error fetching productos:", error)
    return { data: [], error: error.message, total: 0 }
  }
  return { data: (data || []) as ProductoRow[], error: null, total: count ?? 0 }
}

/**
 * KPIs de inventario (todos los productos del taller, no solo la pagina actual):
 * - valorEnRiesgo: Σ (costo × stock) donde stock ≤ minimo (costo = costo de adquisicion en BD).
 * - rotacionDiasPromedio: promedio en dias entre alta del producto y fecha de venta (ultimas 20 lineas PDV con producto).
 */
export async function getInventoryOperationalKpis(): Promise<{
  valorEnRiesgo: number
  rotacionDiasPromedio: number
  error: string | null
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  if (!tallerId?.trim()) {
    return { valorEnRiesgo: 0, rotacionDiasPromedio: 0, error: "Sin taller" }
  }

  const { data, error } = await supabase.rpc("get_inventory_operational_kpis", {
    p_taller_id: tallerId,
  })

  if (error) {
    console.error("[getInventoryOperationalKpis]", error)
    return { valorEnRiesgo: 0, rotacionDiasPromedio: 0, error: error.message }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { valor_riesgo?: number | string; rotacion_dias_promedio?: number | string }
    | null
    | undefined

  return {
    valorEnRiesgo: Number(row?.valor_riesgo ?? 0),
    rotacionDiasPromedio: Number(row?.rotacion_dias_promedio ?? 0),
    error: null,
  }
}

export async function createProducto(
  input: CreateProductoInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  if (!tallerId?.trim()) {
    const msg = "No se pudo obtener el taller (taller_id). Inicia sesion de nuevo."
    console.error("[createProducto] taller_id ausente")
    throw new Error(msg)
  }

  const nombre = (input.nombre || "").trim()
  if (!nombre) {
    return { success: false, error: "El nombre del producto es obligatorio." }
  }

  const almacStr =
    (input.almacenamiento || input.capacidad || "").trim() || null

  const formData = {
    taller_id: tallerId,
    nombre,
    sku: (input.sku || "").trim() || null,
    codigo_barras: (input.codigo_barras || "").trim() || null,
    imagen_url: normalizeInventoryImagePathForDb(input.imagen_url),
    categoria: (input.categoria || "").trim() || null,
    descripcion: (input.descripcion || "").trim() || null,
    marca: (input.marca || "").trim() || null,
    modelo: (input.modelo || "").trim() || null,
    ubicacion: (input.ubicacion || "").trim() || null,
    costo: Number.isFinite(Number(input.costo)) ? Math.max(0, Number(input.costo)) : 0,
    precio_venta: Number.isFinite(Number(input.precio_venta)) ? Math.max(0, Number(input.precio_venta)) : 0,
    stock_actual: input.stock_actual != null ? Math.max(0, Math.floor(Number(input.stock_actual))) : 1,
    stock_minimo: input.stock_minimo != null ? Math.max(0, Math.floor(Number(input.stock_minimo))) : 5,
    es_equipo: Boolean(input.es_equipo),
    imei_serie: input.es_equipo && (input.imei_serie || "").trim() ? (input.imei_serie || "").trim() : null,
    color: input.es_equipo && (input.color || "").trim() ? (input.color || "").trim() : null,
    procesador: input.es_equipo && (input.procesador || "").trim() ? (input.procesador || "").trim() : null,
    ram: input.es_equipo && (input.ram || "").trim() ? (input.ram || "").trim() : null,
    almacenamiento: input.es_equipo ? almacStr : null,
    capacidad: input.es_equipo ? almacStr : null,
    condicion: (input.condicion || "").trim() || null,
  }

  // Validacion de unicidad de codigo de barras (manual o autogenerado)
  if (formData.codigo_barras) {
    const { data: existing, error: lookupError } = await supabase
      .from("productos")
      .select("id")
      .eq("taller_id", tallerId)
      .eq("codigo_barras", formData.codigo_barras)
      .maybeSingle()

    if (lookupError && lookupError.code !== "PGRST116") {
      console.error("ERROR_SUPABASE: error verificando codigo_barras unico:", lookupError)
      return { success: false, error: "No se pudo validar el codigo de barras. Intentalo de nuevo." }
    }

    if (existing && (!input.id || existing.id !== input.id)) {
      return {
        success: false,
        error: "Error: El codigo de barras ya esta asignado a otro producto.",
      }
    }
  }

  /** UUID de borrador (modal nuevo producto): no existe fila → hay que INSERT con ese id, no UPDATE. */
  const hasId = Boolean(input.id?.trim())

  try {
    if (hasId) {
      const { data: updated, error: upErr } = await supabase
        .from("productos")
        .update(formData)
        .eq("id", input.id!)
        .eq("taller_id", tallerId)
        .select("id")

      if (upErr) {
        console.error("[createProducto] update error:", upErr)
        throw new Error(upErr.message)
      }

      if (updated && updated.length > 0) {
        revalidatePath("/dashboard/inventario")
        return { success: true }
      }

      // Nuevo producto con UUID de borrador (imagen previa): UPDATE no afecto filas → INSERT con id fijo
      const { data: insertedDraft, error: insDraftErr } = await supabase
        .from("productos")
        .insert({ ...formData, id: input.id! })
        .select("id")
        .single()

      if (insDraftErr) {
        console.error("[createProducto] insert (borrador) error:", insDraftErr)
        throw new Error(insDraftErr.message)
      }
      revalidatePath("/dashboard/inventario")
      return { success: true }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("productos")
      .insert(formData)
      .select("id")
      .single()

    if (insErr) {
      console.error("[createProducto] insert error:", insErr)
      throw new Error(insErr.message)
    }
    revalidatePath("/dashboard/inventario")
    return { success: true }
  } catch (err) {
    console.error("[createProducto] fallo:", err)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

const PRODUCT_PHOTOS_BUCKET = BUCKETS.INVENTORY

/** Limite recomendado en cliente (browser-image-compression); si supera esto, el fallo puede ser "Payload too large" en API. */
const MAX_INVENTORY_IMAGE_BYTES = 6 * 1024 * 1024

export type UploadProductImageResult =
  | { success: true; path: string }
  | { success: false; error: string; errorDebug?: unknown }

/**
 * Sube una imagen en base64 al bucket de inventario.
 * Devuelve el **path relativo** para `productos.imagen_url` (URL publica via `getInventoryPublicUrl()` en UI).
 * No lanza: siempre devuelve `{ success, ... }`.
 */
export async function uploadProductImage(
  base64Image: string,
  productId: string
): Promise<UploadProductImageResult> {
  let admin: Awaited<ReturnType<typeof createAdminClient>> | undefined
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
      return {
        success: false,
        error:
          "Falta NEXT_PUBLIC_SUPABASE_URL en el servidor. Configurala en Vercel (Settings → Environment Variables) y vuelve a desplegar.",
      }
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return {
        success: false,
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Anadela en Vercel (Settings → Environment Variables), marca Production/Preview segun corresponda, y vuelve a desplegar.",
      }
    }

    if (!base64Image?.trim()) {
      return { success: false, error: "No hay imagen" }
    }
    const rawProductId = (productId ?? "").trim()
    if (!rawProductId) {
      return { success: false, error: "ID de producto requerido para la imagen" }
    }

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(rawProductId)) {
      return { success: false, error: "ID de producto invalido" }
    }

    const tallerId = await getCurrentTallerId()
    if (!tallerId) {
      return {
        success: false,
        error: "No se pudo identificar el taller. Cierra sesion e inicia de nuevo.",
      }
    }

    // Verificar que el producto pertenezca al tenant antes de subir
    const { supabase } = await createCurrentTenantClient()
    const { data: product } = await supabase
      .from("productos")
      .select("id")
      .eq("id", rawProductId)
      .eq("taller_id", tallerId)
      .maybeSingle()
    if (!product) {
      return { success: false, error: "Producto no encontrado o no pertenece al taller" }
    }

    admin = await createAdminClient()
    if (!admin) {
      console.error("[uploadProductImage] createAdminClient returned undefined. Check Supabase env vars.")
      return { success: false, error: "Error de configuracion del servidor. Contacta soporte." }
    }

    const base64 = base64Image.startsWith("data:image") ? base64Image.split(",")[1] : base64Image
    if (!base64) {
      return { success: false, error: "Formato de imagen no valido" }
    }

    const buffer = Buffer.from(base64, "base64")
    if (buffer.length > MAX_INVENTORY_IMAGE_BYTES) {
      console.error("[uploadProductImage] Payload too large", {
        bucket: PRODUCT_PHOTOS_BUCKET,
        bytes: buffer.length,
        maxBytes: MAX_INVENTORY_IMAGE_BYTES,
        tallerId,
      })
      return {
        success: false,
        error: `La imagen es demasiado grande (${Math.round(buffer.length / 1024)} KB). Comprime a menos de 6 MB.`,
      }
    }

    const blob = new Blob([buffer], { type: "image/webp" })
    const safeProductId = rawProductId.toLowerCase()
    const filePath = `${tallerId}/${safeProductId}.webp`

    const { error, data } = await admin.storage.from(PRODUCT_PHOTOS_BUCKET).upload(filePath, blob, {
      contentType: "image/webp",
      upsert: true,
    })

    if (error) {
      const storageErr = error as Error & {
        statusCode?: string
        error?: string
        message?: string
      }
      const hint =
        (error.message || "").toLowerCase().includes("bucket") ||
        (error.message || "").toLowerCase().includes("not found")
          ? "Bucket not found o nombre incorrecto — crea/valida el bucket de inventario en Supabase."
          : (error.message || "").toLowerCase().includes("payload") ||
              (error.message || "").toLowerCase().includes("too large") ||
              storageErr.statusCode === "413"
            ? "Payload too large — reduce tamano en el cliente o sube el limite del bucket."
            : (error.message || "").toLowerCase().includes("row-level security") ||
                (error.message || "").toLowerCase().includes("policy") ||
                (error.message || "").toLowerCase().includes("denied")
              ? "RLS / politicas de Storage — revisa las politicas del bucket de inventario."
              : null

      let serialized = ""
      try {
        serialized = JSON.stringify(error, Object.getOwnPropertyNames(error))
      } catch {
        serialized = String(error)
      }
      console.error("[uploadProductImage] storage.from('" + PRODUCT_PHOTOS_BUCKET + "').upload() failed", {
        bucket: PRODUCT_PHOTOS_BUCKET,
        filePath,
        byteSize: buffer.length,
        tallerId,
        message: error.message,
        name: storageErr.name,
        statusCode: storageErr.statusCode,
        error: storageErr.error,
        hint,
        fullError: serialized,
      })

      return {
        success: false,
        error: error?.message || "Error al subir la imagen",
        errorDebug: {
          name: storageErr.name,
          message: error?.message,
          statusCode: storageErr.statusCode,
          code: storageErr.error,
          hint,
          fullError: serialized,
          bucket: PRODUCT_PHOTOS_BUCKET,
          filePath,
        },
      }
    }

    return { success: true, path: filePath }
  } catch (e) {
    console.error("[uploadProductImage] unexpected error:", e)
    console.error("- admin client type:", typeof admin)
    console.error("- admin.storage exists:", !!admin?.storage)
    console.error("- bucket:", PRODUCT_PHOTOS_BUCKET)
    const msg =
      e instanceof Error ? e.message : "Error inesperado al subir la imagen. Intenta de nuevo."
    return {
      success: false,
      error: msg,
      errorDebug: e,
    }
  }
}

export async function bulkImportProductos(
  rows: BulkImportProductoInput[]
): Promise<{
  success: boolean
  insertedCount: number
  skippedCount: number
  totalCostoCarga: number
  errors?: string[]
}> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()

    if (!tallerId) {
      const msg = "No se pudo obtener el taller (taller_id). Inicia sesion de nuevo."
      console.error("ERROR_SUPABASE: taller_id faltante —", msg)
      return { success: false, insertedCount: 0, skippedCount: rows.length, totalCostoCarga: 0, errors: [msg] }
    }

    const datos: Record<string, unknown>[] = []
    const errors: string[] = []

    rows.forEach((row, index) => {
      const nombre = (row.nombre || "").trim()
      if (!nombre) {
        errors.push(`Fila ${index + 1}: el nombre es obligatorio.`)
        return
      }

      const parseNumber = (val: number | string | undefined, field: string) => {
        if (val === undefined || val === null || val === "") return undefined
        const n = Number(val)
        if (Number.isNaN(n)) {
          errors.push(`Fila ${index + 1}: el campo ${field} no es un numero valido.`)
          return undefined
        }
        return n
      }

      const costo = parseNumber(row.costo, "costo")
      const precioVenta = parseNumber(row.precio_venta, "precio_venta")
      const stockActual = parseNumber(row.stock_actual, "stock_actual")
      const stockMinimo = parseNumber(row.stock_minimo, "stock_minimo")

      datos.push({
        taller_id: tallerId,
        nombre,
        sku: (row.sku || "").trim() || null,
        categoria: (row.categoria || "").trim() || null,
        codigo_barras: (row.codigo_barras || "").trim() || null,
        costo: costo != null ? Math.max(0, Number.isFinite(Number(costo)) ? Number(costo) : 0) : 0,
        precio_venta: precioVenta != null ? Math.max(0, Number.isFinite(Number(precioVenta)) ? Number(precioVenta) : 0) : 0,
        stock_actual: stockActual != null ? Math.max(0, Math.floor(Number(stockActual))) : 1,
        stock_minimo: stockMinimo != null ? Math.max(0, Math.floor(Number(stockMinimo))) : 5,
        es_equipo: false,
        imei_serie: null,
        color: null,
      })
    })

    if (!datos.length) {
      const msg = "No hay filas validas para importar."
      console.error("ERROR_SUPABASE: bulk import sin filas validas —", msg)
      return { success: false, insertedCount: 0, skippedCount: rows.length, totalCostoCarga: 0, errors: [...errors, msg] }
    }

    // Pre-fetch todos los codigos de barras existentes en 1 query
    // en lugar de validar uno por uno dentro del loop (PERF-16)
    const codigosEnImport = datos
      .map((d) => d.codigo_barras as string | null)
      .filter((c): c is string => !!c)

    let codigosExistentes = new Set<string>()
    if (codigosEnImport.length > 0) {
      const { data: existentes } = await supabase
        .from("productos")
        .select("codigo_barras")
        .eq("taller_id", tallerId)
        .in("codigo_barras", codigosEnImport)
      codigosExistentes = new Set((existentes || []).map((r: { codigo_barras: string }) => r.codigo_barras))
    }

    const datosFiltrados = datos.filter((d, i) => {
      if (d.codigo_barras && codigosExistentes.has(d.codigo_barras as string)) {
        errors.push(`Fila ${i + 1}: codigo de barras "${d.codigo_barras}" ya existe — omitido.`)
        return false
      }
      return true
    })

    const totalCostoCarga = datosFiltrados.reduce((sum, row) => {
      const costo = Number(row.costo ?? 0)
      const stock = Number(row.stock_actual ?? 0)
      return sum + costo * stock
    }, 0)

    const { error } = await supabase.from("productos").insert(datosFiltrados)

    if (error) {
      console.error("ERROR_SUPABASE (bulkImportProductos):", error)
      return {
        success: false,
        insertedCount: 0,
        skippedCount: rows.length,
        totalCostoCarga: 0,
        errors: [...errors, error.message],
      }
    }

    return {
      success: true,
      insertedCount: datosFiltrados.length,
      skippedCount: rows.length - datosFiltrados.length,
      totalCostoCarga,
      errors: errors.length ? errors : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("ERROR_SUPABASE (bulkImportProductos):", err)
    return { success: false, insertedCount: 0, skippedCount: rows.length, totalCostoCarga: 0, errors: [message] }
  }
}

export async function deleteProducto(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()

    if (!tallerId) {
      const msg = "No se pudo obtener el taller (taller_id). Inicia sesion de nuevo."
      console.error("ERROR_SUPABASE: taller_id faltante —", msg)
      return { success: false, error: msg }
    }

    if (!id) return { success: false, error: "ID de producto no valido." }

    const { error } = await supabase.from("productos").delete().eq("id", id).eq("taller_id", tallerId)

    if (error) {
      console.error("ERROR_SUPABASE:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("ERROR_SUPABASE:", err)
    return { success: false, error: message }
  }
}
