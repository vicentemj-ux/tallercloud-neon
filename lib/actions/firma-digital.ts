"use server"

import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

const FIRMA_BUCKET = "firmas"

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://tallercloud.net").replace(/\/$/, "")
}

/** URL publica de la pagina de firma (segmento dinamico = token UUID). */
function buildFirmaDigitalPageUrl(token: string): string {
  return `${baseUrl()}/firma-digital/${token}`
}

/**
 * Devuelve un enlace de firma vigente (no usado, no expirado) si existe.
 */
export async function getActiveFirmaDigitalUrl(
  repairId: string,
): Promise<{ url: string; token: string } | { none: true } | { error: string }> {
  if (!repairId) return { error: "Falta el ticket." }

  const supabase = (await createCurrentTenantClient()).supabase
  const tallerId = await getCurrentTallerId()

  const { data: rep, error: repErr } = await supabase
    .from("reparaciones")
    .select("id")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (repErr || !rep) {
    return { error: "No se encontro la reparacion." }
  }

  const admin = await createAdminClient()
  const now = new Date().toISOString()
  const { data: row, error } = await admin
    .from("firma_digital_tokens")
    .select("token")
    .eq("reparacion_id", repairId)
    .eq("taller_id", tallerId)
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[getActiveFirmaDigitalUrl]", error)
    return { error: "No se pudo leer el enlace de firma." }
  }
  if (!row?.token) return { none: true }

  return { token: row.token as string, url: buildFirmaDigitalPageUrl(row.token as string) }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Crea un token de firma para una reparacion (plan PRO).
 * URL publica: /firma-digital/[id] (id = token en la ruta dinamica)
 * @param preferredToken - UUID opcional (p. ej. ya mostrado en el QR antes de guardar el ticket).
 */
export async function createFirmaDigitalToken(
  repairId: string,
  preferredToken?: string | null,
): Promise<{ url: string; token: string } | { error: string }> {
  if (!repairId) return { error: "Falta el ticket." }

  const supabase = (await createCurrentTenantClient()).supabase
  const tallerId = await getCurrentTallerId()

  const { data: rep, error: repErr } = await supabase
    .from("reparaciones")
    .select("id")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (repErr || !rep) {
    return { error: "No se encontro la reparacion." }
  }

  const admin = await createAdminClient()

  let token: string = randomUUID()
  const pref = typeof preferredToken === "string" ? preferredToken.trim() : ""
  if (pref && UUID_RE.test(pref)) {
    const { data: taken } = await admin.from("firma_digital_tokens").select("id").eq("token", pref).maybeSingle()
    if (!taken) {
      token = pref
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: insErr } = await admin.from("firma_digital_tokens").insert({
    token,
    taller_id: tallerId,
    reparacion_id: repairId,
    expires_at: expiresAt,
  })

  if (insErr) {
    console.error("[createFirmaDigitalToken]", insErr)
    return { error: "No se pudo generar el enlace de firma." }
  }

  return { token, url: buildFirmaDigitalPageUrl(token) }
}

/**
 * Guarda la firma (base64 data URL o raw base64) asociada al token.
 * Usa service role para validar token y subir al bucket `firmas`.
 */
export async function saveFirmaSignatureBase64(
  token: string,
  imageBase64: string,
): Promise<{ success: boolean; error?: string }> {
  if (!token || !imageBase64) {
    return { success: false, error: "Datos incompletos." }
  }

  const admin = await createAdminClient()
  const { data: row, error: tokErr } = await admin
    .from("firma_digital_tokens")
    .select("id, taller_id, reparacion_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle()

  if (tokErr || !row) {
    return { success: false, error: "Enlace invalido o expirado." }
  }

  if (row.used_at) {
    return { success: false, error: "Esta firma ya fue registrada." }
  }

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { success: false, error: "El enlace de firma expiro." }
  }

  const tallerId = row.taller_id as string
  const repairId = row.reparacion_id as string

  const raw = imageBase64.includes(",") ? imageBase64.split(",")[1] ?? "" : imageBase64
  let buffer: Buffer
  try {
    buffer = Buffer.from(raw, "base64")
  } catch {
    return { success: false, error: "Imagen no valida." }
  }

  if (buffer.length < 50 || buffer.length > 5 * 1024 * 1024) {
    return { success: false, error: "El archivo de firma no es valido." }
  }

  const path = `${tallerId}/${repairId}/firma-${Date.now()}.png`

  const { error: upErr } = await admin.storage.from(FIRMA_BUCKET).upload(path, buffer, {
    contentType: "image/png",
    upsert: false,
  })

  if (upErr) {
    console.error("[saveFirmaSignatureBase64] upload", upErr)
    return { success: false, error: "No se pudo guardar la firma." }
  }

  const { error: upRep } = await admin
    .from("reparaciones")
    .update({ firma_ingreso_path: path })
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (upRep) {
    console.error("[saveFirmaSignatureBase64] reparaciones", upRep)
    return { success: false, error: "No se pudo vincular la firma al ticket." }
  }

  await admin
    .from("firma_digital_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)

  return { success: true }
}
