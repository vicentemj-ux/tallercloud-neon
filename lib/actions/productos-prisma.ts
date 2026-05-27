"use server"

import { revalidatePath } from "next/cache"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"
import { normalizeInventoryImagePathForDb } from "@/lib/storage"
import { sanitizeFileName, uploadFileToR2 } from "@/lib/r2"

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

export type UploadProductImageResult =
  | { success: true; path: string }
  | { success: false; error: string; errorDebug?: unknown }

function n(v: unknown): number { return Number(v ?? 0) }

export async function getProductos(page = 0, pageSize = 50, search = ""): Promise<{ data: ProductoRow[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const from = page * pageSize
    const pattern = `%${search.trim()}%`

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, taller_id, nombre, sku, codigo_barras, imagen_url, categoria, descripcion, marca, modelo, ubicacion,
              costo, precio_venta, stock_actual, stock_minimo, es_equipo, imei_serie, color, capacidad, procesador, ram, almacenamiento, condicion, created_at
       FROM productos
       WHERE taller_id = $1
         AND ($2 = '' OR nombre ILIKE $3 OR sku ILIKE $3 OR codigo_barras ILIKE $3 OR descripcion ILIKE $3 OR categoria ILIKE $3)
       ORDER BY created_at DESC, id DESC
       OFFSET $4 LIMIT $5`,
      tallerId,
      search.trim(),
      pattern,
      from,
      pageSize,
    )
    const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM productos
       WHERE taller_id = $1
         AND ($2 = '' OR nombre ILIKE $3 OR sku ILIKE $3 OR codigo_barras ILIKE $3 OR descripcion ILIKE $3 OR categoria ILIKE $3)`,
      tallerId,
      search.trim(),
      pattern,
    )

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        taller_id: String(r.taller_id),
        nombre: String(r.nombre ?? ""),
        sku: r.sku == null ? null : String(r.sku),
        codigo_barras: r.codigo_barras == null ? null : String(r.codigo_barras),
        imagen_url: r.imagen_url == null ? null : String(r.imagen_url),
        categoria: r.categoria == null ? null : String(r.categoria),
        descripcion: r.descripcion == null ? null : String(r.descripcion),
        marca: r.marca == null ? null : String(r.marca),
        modelo: r.modelo == null ? null : String(r.modelo),
        ubicacion: r.ubicacion == null ? null : String(r.ubicacion),
        costo: n(r.costo),
        precio_venta: n(r.precio_venta),
        stock_actual: n(r.stock_actual),
        stock_minimo: n(r.stock_minimo),
        es_equipo: Boolean(r.es_equipo),
        imei_serie: r.imei_serie == null ? null : String(r.imei_serie),
        color: r.color == null ? null : String(r.color),
        capacidad: r.capacidad == null ? null : String(r.capacidad),
        procesador: r.procesador == null ? null : String(r.procesador),
        ram: r.ram == null ? null : String(r.ram),
        almacenamiento: r.almacenamiento == null ? null : String(r.almacenamiento),
        condicion: r.condicion == null ? null : String(r.condicion),
        created_at: String(r.created_at),
      })),
      error: null,
      total: totalRows[0]?.total ?? 0,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar inventario", total: 0 }
  }
}

export async function getInventoryOperationalKpis(): Promise<{ valorEnRiesgo: number; rotacionDiasPromedio: number; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const riesgoRows = await prisma.$queryRawUnsafe<Array<{ valor: number }>>(
      `SELECT COALESCE(SUM(COALESCE(costo,0) * COALESCE(stock_actual,0)),0)::float8 AS valor
       FROM productos
       WHERE taller_id = $1 AND COALESCE(stock_actual,0) <= COALESCE(stock_minimo,0)`,
      tallerId,
    )
    return { valorEnRiesgo: Number(riesgoRows[0]?.valor ?? 0), rotacionDiasPromedio: 0, error: null }
  } catch (error) {
    return { valorEnRiesgo: 0, rotacionDiasPromedio: 0, error: error instanceof Error ? error.message : "Error KPI" }
  }
}

export async function createProducto(input: CreateProductoInput): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const nombre = (input.nombre || "").trim()
    if (!nombre) return { success: false, error: "El nombre del producto es obligatorio." }

    const almacStr = (input.almacenamiento || input.capacidad || "").trim() || null
    const payload = {
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

    if (input.id?.trim()) {
      const updated = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE productos SET
           nombre=$1, sku=$2, codigo_barras=$3, imagen_url=$4, categoria=$5, descripcion=$6, marca=$7, modelo=$8, ubicacion=$9,
           costo=$10, precio_venta=$11, stock_actual=$12, stock_minimo=$13, es_equipo=$14, imei_serie=$15, color=$16,
           procesador=$17, ram=$18, almacenamiento=$19, capacidad=$20, condicion=$21
         WHERE id=$22 AND taller_id=$23 RETURNING id`,
        payload.nombre, payload.sku, payload.codigo_barras, payload.imagen_url, payload.categoria, payload.descripcion, payload.marca, payload.modelo, payload.ubicacion,
        payload.costo, payload.precio_venta, payload.stock_actual, payload.stock_minimo, payload.es_equipo, payload.imei_serie, payload.color,
        payload.procesador, payload.ram, payload.almacenamiento, payload.capacidad, payload.condicion,
        input.id.trim(), tallerId,
      )
      if (updated.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO productos (id, taller_id, nombre, sku, codigo_barras, imagen_url, categoria, descripcion, marca, modelo, ubicacion,
            costo, precio_venta, stock_actual, stock_minimo, es_equipo, imei_serie, color, procesador, ram, almacenamiento, capacidad, condicion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          input.id.trim(), tallerId, payload.nombre, payload.sku, payload.codigo_barras, payload.imagen_url, payload.categoria, payload.descripcion, payload.marca, payload.modelo, payload.ubicacion,
          payload.costo, payload.precio_venta, payload.stock_actual, payload.stock_minimo, payload.es_equipo, payload.imei_serie, payload.color,
          payload.procesador, payload.ram, payload.almacenamiento, payload.capacidad, payload.condicion,
        )
      }
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO productos (taller_id, nombre, sku, codigo_barras, imagen_url, categoria, descripcion, marca, modelo, ubicacion,
          costo, precio_venta, stock_actual, stock_minimo, es_equipo, imei_serie, color, procesador, ram, almacenamiento, capacidad, condicion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        tallerId, payload.nombre, payload.sku, payload.codigo_barras, payload.imagen_url, payload.categoria, payload.descripcion, payload.marca, payload.modelo, payload.ubicacion,
        payload.costo, payload.precio_venta, payload.stock_actual, payload.stock_minimo, payload.es_equipo, payload.imei_serie, payload.color,
        payload.procesador, payload.ram, payload.almacenamiento, payload.capacidad, payload.condicion,
      )
    }

    revalidatePath("/dashboard/inventario")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function uploadProductImage(base64Image: string, productId: string): Promise<UploadProductImageResult> {
  try {
    if (!base64Image?.trim()) return { success: false, error: "No hay imagen" }
    const tallerId = await getCurrentTallerId()
    const base64 = base64Image.startsWith("data:image") ? base64Image.split(",")[1] : base64Image
    if (!base64) return { success: false, error: "Formato de imagen no válido" }

    const buffer = Buffer.from(base64, "base64")
    const fileName = sanitizeFileName(`${productId}.webp`)
    const key = `inventario/${tallerId}/${fileName}`

    await uploadFileToR2({ key, body: buffer, contentType: "image/webp" })
    return { success: true, path: key }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al subir imagen", errorDebug: e }
  }
}

export async function bulkImportProductos(rows: BulkImportProductoInput[]): Promise<{ success: boolean; insertedCount: number; skippedCount: number; totalCostoCarga: number; errors?: string[] }> {
  try {
    let insertedCount = 0
    let totalCostoCarga = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const nombre = (row.nombre || "").trim()
      if (!nombre) {
        errors.push(`Fila ${i + 1}: el nombre es obligatorio.`)
        continue
      }
      const costo = Number(row.costo ?? 0)
      const stock = Math.max(0, Math.floor(Number(row.stock_actual ?? 1)))
      const res = await createProducto({
        nombre,
        sku: row.sku,
        categoria: row.categoria,
        codigo_barras: row.codigo_barras,
        costo,
        precio_venta: Number(row.precio_venta ?? 0),
        stock_actual: stock,
        stock_minimo: Math.max(0, Math.floor(Number(row.stock_minimo ?? 5))),
      })
      if (!res.success) {
        errors.push(`Fila ${i + 1}: ${res.error ?? "error"}`)
        continue
      }
      insertedCount += 1
      totalCostoCarga += Math.max(0, costo) * stock
    }

    return {
      success: insertedCount > 0,
      insertedCount,
      skippedCount: rows.length - insertedCount,
      totalCostoCarga,
      errors: errors.length ? errors : undefined,
    }
  } catch (err) {
    return { success: false, insertedCount: 0, skippedCount: rows.length, totalCostoCarga: 0, errors: [err instanceof Error ? err.message : String(err)] }
  }
}

export async function deleteProducto(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe("DELETE FROM productos WHERE id = $1 AND taller_id = $2", id, tallerId)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
