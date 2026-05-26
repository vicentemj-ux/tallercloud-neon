/**
 * lib/storage.ts — Constantes y utilidades puras de Supabase Storage.
 * Sin "use server" — importable desde cualquier contexto (cliente, servidor, actions).
 *
 * Para signed URLs (requieren service_role), usa lib/storage-server.ts.
 */

// ─── Constantes de buckets ────────────────────────────────────────────────────
/**
 * Fotos del módulo Inventario (tabla **`productos`**).
 * Debe coincidir con el bucket en Supabase; override con `NEXT_PUBLIC_SUPABASE_INVENTORY_BUCKET`
 * (p. ej. `inventario` o `product-photos`).
 */
export const INVENTORY_PRODUCT_IMAGES_BUCKET: string =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_INVENTORY_BUCKET?.trim()) ||
  "inventario"

export const BUCKETS = {
  REPAIR_PHOTOS: "repair-photos", // privado → signed URLs
  /** @alias INVENTORY_PRODUCT_IMAGES_BUCKET — fotos en `productos.imagen_url` */
  INVENTORY: INVENTORY_PRODUCT_IMAGES_BUCKET,
  CATALOG: "catalogo", // público → getPublicUrl
  TALLER: "taller", // público → getPublicUrl (logos)
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]

// ─── Helpers puros ────────────────────────────────────────────────────────────

/**
 * Extrae el path relativo de un URL de Supabase Storage.
 * Soporta URLs públicas, signed URLs y paths bare.
 */
export function extractStoragePath(urlOrPath: string, bucket: string): string {
  if (!urlOrPath.startsWith("http")) return urlOrPath

  const publicMarker = `/object/public/${bucket}/`
  const signedMarker = `/object/sign/${bucket}/`

  let idx = urlOrPath.indexOf(publicMarker)
  if (idx !== -1) return urlOrPath.slice(idx + publicMarker.length)

  idx = urlOrPath.indexOf(signedMarker)
  if (idx !== -1) return urlOrPath.slice(idx + signedMarker.length).split("?")[0]

  return urlOrPath
}

/**
 * Construye la URL pública de un archivo en un bucket PÚBLICO.
 * Puro — no hace ninguna llamada de red ni usa claves privadas.
 * Para buckets privados usa getSignedUrl() de lib/storage-server.ts.
 */
export function getPublicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const clean = path.replace(/^\/+/, "")
  return `${base}/storage/v1/object/public/${bucket}/${clean}`
}

export function getInventoryCanonicalImagePath(tallerId: string, productId: string): string {
  return `${tallerId}/${productId}.webp`
}

export function getInventoryCanonicalImageUrl(tallerId: string, productId: string): string {
  return getPublicUrl(INVENTORY_PRODUCT_IMAGES_BUCKET, getInventoryCanonicalImagePath(tallerId, productId))
}

/**
 * URL lista para `<img>` / `next/image` a partir de lo guardado en `productos.imagen_url`.
 * - Si ya es una URL absoluta (http/https), se devuelve tal cual (no se concatena dos veces).
 * - Si es un path relativo del bucket (ej. `{taller_id}/producto-….jpg`), se antepone el prefijo público de Supabase.
 *
 * Recomendación: guardar en BD solo el path relativo (ver `normalizeInventoryImagePathForDb`).
 */
export function getInventoryPublicUrl(stored: string | null | undefined): string | null {
  if (stored == null) return null
  const s = String(stored).trim()
  if (s === "") return null
  if (s.startsWith("http://") || s.startsWith("https://")) {
    // Si viene hardcodeada/legacy en BD (ej. bucket inventario), la reescribimos al bucket oficial.
    const normalizedPath = normalizeInventoryImagePathForDb(s)
    if (normalizedPath) return getPublicUrl(INVENTORY_PRODUCT_IMAGES_BUCKET, normalizedPath)
    return s
  }
  return getPublicUrl(INVENTORY_PRODUCT_IMAGES_BUCKET, s)
}

/**
 * Normaliza el valor antes de guardar en `imagen_url`: solo path dentro del bucket de fotos.
 * Si llega una URL pública completa, extrae el path (bucket oficial y legados `inventario` / `productos`).
 */
export function normalizeInventoryImagePathForDb(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim()
  if (!s) return null
  if (s.startsWith("http://") || s.startsWith("https://")) {
    const bucketsToTry = Array.from(
      new Set([INVENTORY_PRODUCT_IMAGES_BUCKET, "inventario", "productos"])
    )
    for (const bucket of bucketsToTry) {
      const path = extractStoragePath(s, bucket)
      if (!path.startsWith("http")) {
        const cleaned = path.replace(/^\/+/, "")
        if (cleaned) return cleaned
      }
    }
    return null
  }
  return s.replace(/^\/+/, "")
}
