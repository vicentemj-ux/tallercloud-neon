import type { ProductoRow } from "@/lib/actions/productos-prisma"

/**
 * Etiqueta de exhibiciÃ³n: categorÃ­a de equipo (telÃ©fonos, etc.).
 * En BD suele usarse "EQUIPOS"; se acepta tambiÃ©n "EQUIPO" por compatibilidad.
 */
export function isEquipoExhibitionCategory(producto: { categoria?: string | null }): boolean {
  const c = producto.categoria?.trim().toUpperCase() ?? ""
  return c === "EQUIPO" || c === "EQUIPOS"
}

/** Modelo comercial: nombre del artÃ­culo en inventario. */
export function getProductoModelo(producto: Pick<ProductoRow, "nombre">): string {
  return (producto.nombre ?? "").trim() || "â€”"
}

/** Almacenamiento / capacidad (prioriza columna nueva `almacenamiento`). */
export function getProductoCapacidad(producto: Pick<ProductoRow, "capacidad" | "almacenamiento">): string {
  const a = (producto.almacenamiento ?? "").trim()
  if (a) return a
  return (producto.capacidad ?? "").trim()
}

/** LÃ­nea descripciÃ³n / estado: condiciÃ³n + descripciÃ³n (sin IMEI ni serie). */
export function getProductoDescripcionEstado(
  producto: Pick<ProductoRow, "descripcion" | "condicion">
): string {
  const parts = [producto.condicion?.trim(), producto.descripcion?.trim()].filter(Boolean) as string[]
  return parts.join(" Â· ") || "â€”"
}

const MAX_CARTEL_FEATURES = 10

/**
 * Lista corta de viÃ±etas para el cartel de exhibiciÃ³n (4Ã—6).
 * Prioriza datos estructurados y parte la descripciÃ³n libre en lÃ­neas.
 */
export function buildCartelFeatures(producto: ProductoRow): string[] {
  const out: string[] = []

  if (producto.categoria?.trim()) {
    out.push(producto.categoria.trim())
  }
  if (producto.es_equipo) {
    if (producto.marca?.trim()) out.push(`Marca: ${producto.marca.trim()}`)
    if (producto.modelo?.trim()) out.push(`Modelo: ${producto.modelo.trim()}`)
    if (producto.color?.trim()) out.push(`Color: ${producto.color.trim()}`)
    if (producto.procesador?.trim()) out.push(`Procesador: ${producto.procesador.trim()}`)
    if (producto.ram?.trim()) out.push(`RAM: ${producto.ram.trim()}`)
    const cap = getProductoCapacidad(producto)
    if (cap) out.push(`Almacenamiento: ${cap}`)
    if (producto.condicion?.trim()) out.push(`CondiciÃ³n: ${producto.condicion.trim()}`)
  }
  if (producto.sku?.trim()) {
    out.push(`SKU: ${producto.sku.trim()}`)
  }

  const desc = producto.descripcion?.trim()
  if (desc) {
    const chunks = desc
      .split(/(?:\r?\n|[â€¢Â·;])+/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const c of chunks) {
      if (out.length >= MAX_CARTEL_FEATURES) break
      if (!out.includes(c)) out.push(c)
    }
  }

  if (out.length === 0) {
    out.push("Especificaciones disponibles en tienda")
  }

  return out.slice(0, MAX_CARTEL_FEATURES)
}

