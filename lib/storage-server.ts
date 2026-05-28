"use server"

/**
 * lib/storage-server.ts - Server Actions para Supabase Storage privado.
 * Requiere service_role key - solo ejecutar server-side.
 * Para URLs publicas usa getPublicUrl() de lib/storage.ts.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { extractStoragePath } from "@/lib/storage"

/**
 * Genera una signed URL para un archivo en un bucket PRIVADO.
 * @param bucket     Nombre del bucket
 * @param pathOrUrl  Path del archivo o URL publica/expirada existente
 * @param expiresIn  Segundos de validez (default: 7200 = 2h)
 */
export async function getSignedUrl(
  bucket: string,
  pathOrUrl: string,
  expiresIn = 7200
): Promise<string | null> {
  const supabase = await createAdminClient()
  const path = extractStoragePath(pathOrUrl, bucket)

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) {
    console.error(`[storage] getSignedUrl ${bucket}/${path}:`, error?.message)
    return null
  }

  return data.signedUrl
}

/**
 * Genera signed URLs en bulk para multiples archivos del mismo bucket.
 * Mas eficiente que llamar getSignedUrl() en bucle.
 */
export async function getSignedUrls(
  bucket: string,
  pathsOrUrls: string[],
  expiresIn = 7200
): Promise<string[]> {
  if (!pathsOrUrls.length) return []

  const supabase = await createAdminClient()
  const paths = pathsOrUrls.map((u) => extractStoragePath(u, bucket))

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresIn)

  if (error || !data) {
    console.error(`[storage] getSignedUrls ${bucket}:`, error?.message)
    return []
  }

  return data.filter((item) => !!item.signedUrl).map((item) => item.signedUrl!)
}
