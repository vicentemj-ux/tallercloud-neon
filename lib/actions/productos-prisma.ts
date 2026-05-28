"use server"

import { revalidatePath } from "next/cache"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"
import { normalizeInventoryImagePathForDb, getInventoryPublicUrl } from "@/lib/storage"
import { sanitizeFileName, uploadFileToR2 } from "@/lib/r2"
import type { Prisma } from "@prisma/client"

// ─── Public types (snake_case for UI backward compat) ────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  return Number(v ?? 0)
}

function mapToRow(p: {
  id: string
  tenantId: string
  nombre: string
  sku: string | null
  codigoBarras: string | null
  imagenUrl: string | null
  categoria: string | null
  descripcion: string | null
  marca: string | null
  modelo: string | null
  ubicacion: string | null
  costo: Prisma.Decimal
  precioVenta: Prisma.Decimal
  stockActual: number
  stockMinimo: number
  esEquipo: boolean
  imeiSerie: string | null
  color: string | null
  capacidad: string | null
  procesador: string | null
  ram: string | null
  almacenamiento: string | null
  condicion: string | null
  createdAt: Date
}): ProductoRow {
  return {
    id: p.id,
    taller_id: p.tenantId,
    nombre: p.nombre,
    sku: p.sku,
    codigo_barras: p.codigoBarras,
    imagen_url: getInventoryPublicUrl(p.imagenUrl),
    categoria: p.categoria,
    descripcion: p.descripcion,
    marca: p.marca,
    modelo: p.modelo,
    ubicacion: p.ubicacion,
    costo: Number(p.costo),
    precio_venta: Number(p.precioVenta),
    stock_actual: p.stockActual,
    stock_minimo: p.stockMinimo,
    es_equipo: p.esEquipo,
    imei_serie: p.imeiSerie,
    color: p.color,
    capacidad: p.capacidad,
    procesador: p.procesador,
    ram: p.ram,
    almacenamiento: p.almacenamiento,
    condicion: p.condicion,
    created_at: p.createdAt.toISOString(),
  }
}

function buildData(input: CreateProductoInput, tenantId: string) {
  const esEquipo = Boolean(input.es_equipo)
  const almacStr = (input.almacenamiento || input.capacidad || "").trim() || null
  return {
    tenantId,
    nombre: (input.nombre || "").trim(),
    sku: (input.sku || "").trim() || null,
    codigoBarras: (input.codigo_barras || "").trim() || null,
    imagenUrl: normalizeInventoryImagePathForDb(input.imagen_url),
    categoria: (input.categoria || "").trim() || null,
    descripcion: (input.descripcion || "").trim() || null,
    marca: (input.marca || "").trim() || null,
    modelo: (input.modelo || "").trim() || null,
    ubicacion: (input.ubicacion || "").trim() || null,
    costo: Number.isFinite(Number(input.costo)) ? Math.max(0, Number(input.costo)) : 0,
    precioVenta: Number.isFinite(Number(input.precio_venta)) ? Math.max(0, Number(input.precio_venta)) : 0,
    stockActual: input.stock_actual != null ? Math.max(0, Math.floor(Number(input.stock_actual))) : 1,
    stockMinimo: input.stock_minimo != null ? Math.max(0, Math.floor(Number(input.stock_minimo))) : 5,
    esEquipo,
    imeiSerie: esEquipo && (input.imei_serie || "").trim() ? (input.imei_serie || "").trim() : null,
    color: esEquipo && (input.color || "").trim() ? (input.color || "").trim() : null,
    procesador: esEquipo && (input.procesador || "").trim() ? (input.procesador || "").trim() : null,
    ram: esEquipo && (input.ram || "").trim() ? (input.ram || "").trim() : null,
    almacenamiento: esEquipo ? almacStr : null,
    capacidad: esEquipo ? almacStr : null,
    condicion: (input.condicion || "").trim() || null,
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getProductos(
  page = 0,
  pageSize = 50,
  search = "",
): Promise<{ data: ProductoRow[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getCurrentTallerId()
    const q = search.trim()
    const where: Prisma.ProductoWhereInput = { tenantId }
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { codigoBarras: { contains: q, mode: "insensitive" } },
        { descripcion: { contains: q, mode: "insensitive" } },
        { categoria: { contains: q, mode: "insensitive" } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.producto.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.producto.count({ where }),
    ])

    return { data: data.map(mapToRow), error: null, total }
  } catch (error) {
    console.error("[productos-prisma] getProductos:", error)
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar inventario", total: 0 }
  }
}

export async function getInventoryOperationalKpis(): Promise<{
  valorEnRiesgo: number
  rotacionDiasPromedio: number
  error: string | null
}> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getCurrentTallerId()

    const rows = await prisma.$queryRawUnsafe<Array<{ valor: number }>>(
      `SELECT COALESCE(SUM(COALESCE(costo,0) * COALESCE(stock_actual,0)),0)::float8 AS valor
       FROM productos
       WHERE taller_id = $1 AND COALESCE(stock_actual,0) <= COALESCE(stock_minimo,0)`,
      tenantId,
    )

    return { valorEnRiesgo: Number(rows[0]?.valor ?? 0), rotacionDiasPromedio: 0, error: null }
  } catch (error) {
    return { valorEnRiesgo: 0, rotacionDiasPromedio: 0, error: error instanceof Error ? error.message : "Error KPI" }
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createProducto(
  input: CreateProductoInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getCurrentTallerId()
    const nombre = (input.nombre || "").trim()
    if (!nombre) return { success: false, error: "El nombre del producto es obligatorio." }

    const data = buildData(input, tenantId)

    if (input.id?.trim()) {
      await prisma.producto.upsert({
        where: { id: input.id.trim() },
        create: { id: input.id.trim(), ...data },
        update: data,
      })
    } else {
      await prisma.producto.create({ data })
    }

    revalidatePath("/dashboard/inventario")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function uploadProductImage(
  base64Image: string,
  productId: string,
  mimeType?: string,
): Promise<UploadProductImageResult> {
  try {
    if (!base64Image?.trim()) return { success: false, error: "No hay imagen" }
    const tenantId = await getCurrentTallerId()
    const base64 = base64Image.startsWith("data:image") ? base64Image.split(",")[1] : base64Image
    if (!base64) return { success: false, error: "Formato de imagen no valido" }

    const buffer = Buffer.from(base64, "base64")
    const effectiveMime = mimeType || "image/webp"
    const ext = effectiveMime.includes("jpeg") || effectiveMime.includes("jpg")
      ? "jpg"
      : effectiveMime.includes("png")
        ? "png"
        : "webp"
    const fileName = sanitizeFileName(`${productId}.${ext}`)
    const key = `inventario/${tenantId}/${fileName}`

    await uploadFileToR2({ key, body: buffer, contentType: effectiveMime })
    return { success: true, path: key }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al subir imagen", errorDebug: e }
  }
}

export async function bulkImportProductos(
  rows: BulkImportProductoInput[],
): Promise<{
  success: boolean
  insertedCount: number
  skippedCount: number
  totalCostoCarga: number
  errors?: string[]
}> {
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
    return {
      success: false,
      insertedCount: 0,
      skippedCount: rows.length,
      totalCostoCarga: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    }
  }
}

export async function deleteProducto(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getCurrentTallerId()
    await prisma.producto.deleteMany({ where: { id, tenantId } })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
