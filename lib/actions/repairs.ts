"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { createClient as createSsrClient } from "@/lib/supabase/server"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { BUCKETS } from "@/lib/storage"
import { getSignedUrls } from "@/lib/storage-server"
import type { ReparacionGasto } from "@/lib/actions/gastos"
import {
  mapRecordToSecurityDisplay,
  normalizeSecurityForDb,
  type SecurityTab,
} from "@/lib/reparaciones/security"
import {
  type ChecklistIngreso,
  checklistIngresoToJson,
  parseChecklistIngreso,
} from "@/lib/reparaciones/checklist-ingreso"
import {
  checklistProToJson,
  hasMeaningfulChecklistProData,
  parseChecklistPro,
  passesHealthCheckRequirement,
  type ChecklistProData,
} from "@/lib/reparaciones/checklist-pro"
import { getAjustesTallerFlujoPro } from "@/lib/actions/flujo-pro"
import { createRepairInputSchema, formatCreateRepairValidationError } from "@/lib/validations/repair-create"
import { crearVenta, getCajaAbierta } from "@/lib/actions/ventas"
import { setServiciosReparacion } from "@/lib/actions/servicios"

const createClient = async () => (await createCurrentTenantClient()).supabase

/**
 * Verifica si el usuario actual es el propietario del taller (no un técnico/empleado).
 * Útil para restringir mutaciones críticas (presupuesto, estado, etc.).
 */
async function isCurrentUserOwner(tallerId: string): Promise<boolean> {
  try {
    const { createClient } = await import("@supabase/supabase-js")
    const ssr = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: { session } } = await ssr.auth.getSession()
    return session?.user?.id === tallerId
  } catch {
    return false
  }
}

/** Nombre visible del usuario Auth que registró la orden (propietario = taller_id, miembro = miembros_taller, etc.). */
async function resolveUsuarioRecepcionNombre(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tallerId: string,
  authUserId: string
): Promise<string | null> {
  if (!authUserId) return null
  if (authUserId === tallerId) {
    const { data: tu } = await supabase
      .from("taller_users")
      .select("nombre_propietario, email, nombre_taller")
      .eq("id", tallerId)
      .maybeSingle()
    const r = tu as {
      nombre_propietario?: string | null
      email?: string | null
      nombre_taller?: string | null
    } | null
    return (
      r?.nombre_propietario?.trim() ||
      r?.email?.trim() ||
      r?.nombre_taller?.trim() ||
      null
    )
  }
  const { data: m } = await supabase
    .from("miembros_taller")
    .select("nombre")
    .eq("taller_id", tallerId)
    .eq("auth_user_id", authUserId)
    .eq("activo", true)
    .maybeSingle()
  const nm = (m as { nombre?: string | null } | null)?.nombre?.trim()
  if (nm) return nm
  try {
    const admin = await createAdminClient()
    const { data: u, error } = await admin.auth.admin.getUserById(authUserId)
    if (error || !u.user) return null
    const meta = u.user.user_metadata as { full_name?: string } | undefined
    return meta?.full_name?.trim() || u.user.email?.trim() || null
  } catch {
    return null
  }
}

/** Zero-pad number to fixed width (e.g. 1 -> "001", 12 -> "012") */
function zfill(num: number, width: number): string {
  return String(num).padStart(width, "0")
}

/** Mensaje legible para fallos de insert/update de PostgREST (debug en producción). */
function formatPostgrestError(err: {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}): string {
  const parts: string[] = [err.message]
  if (err.code) parts.push(`[${err.code}]`)
  if (err.details) parts.push(String(err.details))
  if (err.hint) parts.push(`Sugerencia: ${err.hint}`)
  return parts.join(" · ")
}

/** Evita tragar `redirect()` de Next (lanza con digest NEXT_REDIRECT). */
function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false
  const d = (e as { digest?: unknown }).digest
  return typeof d === "string" && d.includes("NEXT_REDIRECT")
}

/** Mensaje útil cuando Next oculta el detalle en producción (Server Actions). */
function sanitizeUnexpectedRepairError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (
    msg.includes("An error occurred in the Server Components render") ||
    msg.includes("omitted in production")
  ) {
    return "Error al registrar. Si subiste fotos, cierra sesión y vuelve a entrar, o intenta sin fotos."
  }
  return msg || "Error inesperado al registrar la reparación."
}

export interface CreateRepairInput {
  /** Si se omite o está vacío, el trigger en BD asigna folio desde configuracion_taller. */
  folio?: string | null
  customerName: string
  customerPhone: string
  customerEmail?: string
  tipo_equipo?: string
  deviceBrand: string
  deviceModel: string
  deviceSerial?: string
  deviceColor?: string
  reportedFault: string
  estimatedPrice?: string
  deposit?: string
  clienteId?: string
  technician?: string
  pinContrasena?: string
  patronDesbloqueo?: string
  /** v2: none | pin | password | pattern */
  securityType?: string
  securityValue?: string
  /** Notas internas del taller (no visibles para el cliente en tracking) */
  notasInternas?: string
  /** Checklist de ingreso (recepción) — JSON en BD */
  checklistIngreso?: ChecklistIngreso | null
  /** Health check PRO — JSON en `checklist_pro` (alias camelCase) */
  checklistPro?: ChecklistProData | null
  /** Salida Zod / API (snake_case) */
  checklist_pro?: unknown | null
  photos?: string[] // Array of base64 or URLs, or we'll handle File separately
  /** Método de pago del anticipo inicial (efectivo | tarjeta | transferencia). Default "efectivo". */
  metodoPagoAnticipo?: string | null
  /** Servicios adicionales del catálogo */
  servicios?: { servicio_id: string; cantidad?: number }[]
}

const MAX_REPAIR_IMAGE_BYTES = 6 * 1024 * 1024

type UploadRepairPhotosResult = { urls: string[]; error?: string }

// Upload repair photos to Supabase Storage (server-only via adminClient).
// La seguridad de tenant ya está garantizada: tallerId proviene de la cookie del middleware
// validada por createCurrentTenantClient(). No se usa ssrClient.auth.getUser() porque
// TallerCloud usa JWT propio (no Supabase Auth estándar) y esa llamada devuelve user=null.
async function uploadRepairPhotos(
  repairId: string,
  photoDataArray: string[],
  tallerId: string
): Promise<UploadRepairPhotosResult> {
  if (!photoDataArray || photoDataArray.length === 0) return { urls: [] }
  if (!tallerId) return { urls: [], error: "No se pudo identificar el taller. Recarga la página." }

  // Verificar que la reparación pertenezca al tenant antes de subir fotos
  const { supabase } = await createCurrentTenantClient()
  const { data: repair } = await supabase
    .from("reparaciones")
    .select("id")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .maybeSingle()
  if (!repair) {
    return { urls: [], error: "Reparación no encontrada o no pertenece al taller" }
  }

  const admin = await createAdminClient()
  const ts = Date.now()

  const results = await Promise.allSettled(
    photoDataArray.map(async (photoData, i) => {
      if (!photoData.startsWith("data:image")) return null

      const base64 = photoData.split(",")[1]
      let byteCharacters: string
      try {
        byteCharacters = atob(base64)
      } catch {
        console.error(`[uploadRepairPhotos] Foto ${i}: base64 inválido`)
        return null
      }
      const byteArray = new Uint8Array(byteCharacters.length)
      for (let j = 0; j < byteCharacters.length; j++) {
        byteArray[j] = byteCharacters.charCodeAt(j)
      }
      if (byteArray.byteLength > MAX_REPAIR_IMAGE_BYTES) {
        console.error(`[uploadRepairPhotos] Foto ${i} excede tamaño máximo`, {
          bytes: byteArray.byteLength,
          maxBytes: MAX_REPAIR_IMAGE_BYTES,
        })
        return null
      }
      const blob = new Blob([byteArray], { type: "image/webp" })
      const safeId = String(repairId).replace(/[^a-zA-Z0-9_-]/g, "")
      const filePath = `${tallerId}/${safeId}/${safeId}-photo-${i}-${ts}.webp`

      const { error } = await admin.storage
        .from(BUCKETS.REPAIR_PHOTOS)
        .upload(filePath, blob, { contentType: "image/webp", upsert: true })

      if (error) {
        console.error(`Error uploading photo ${i}:`, error)
        return null
      }

      // Guardar path relativo para signed URLs posteriores.
      return filePath
    })
  )

  const urls = results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((v): v is string => v !== null)

  return { urls }
}

// Search client by phone for current taller
export async function searchClientByPhone(phone: string) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()
  
  // Clean phone: remove all non-numeric characters
  const cleanedPhone = phone.replace(/\D/g, "")

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, correo")
    .eq("taller_id", tallerId)
    .eq("telefono", cleanedPhone)
    .single()

  if (error?.code === "PGRST116") {
    // No rows found
    return { client: null, error: null }
  }

  if (error) {
    console.error("Error searching client:", error)
    return { client: null, error: "Error al buscar cliente" }
  }

  return {
    client: {
      id: data.id,
      nombre: data.nombre,
      telefono: data.telefono,
      correo: data.correo,
    },
    error: null,
  }
}

// Create or update client for current taller
export async function createOrUpdateClient(
  phone: string,
  name: string,
  email: string
) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()
  
  // Clean phone: remove all non-numeric characters
  const cleanedPhone = phone.replace(/\D/g, "")

  // First, search if client exists by phone AND taller_id
  const { data: existing } = await supabase
    .from("clientes")
    .select("id")
    .eq("taller_id", tallerId)
    .eq("telefono", cleanedPhone)
    .single()

  if (existing) {
    // Update existing client
    const { data, error } = await supabase
      .from("clientes")
      .update({
        nombre: name,
        correo: email || null,
      })
      .eq("id", existing.id)
      .eq("taller_id", tallerId)
      .select("id, nombre, telefono, correo")
      .single()

    if (error) {
      console.error("Error updating client:", error)
      return { client: null, error: "No se pudo actualizar el cliente" }
    }

    return { client: data, error: null }
  }

  // Create new client with cleaned phone and taller_id
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      taller_id: tallerId,
      nombre: name,
      telefono: cleanedPhone,
      correo: email || null,
    })
    .select("id, nombre, telefono, correo")
    .single()

  if (error) {
    console.error("Error creating client:", error)
    console.error("Error details:", error)
    return { client: null, error: "No se pudo registrar al cliente" }
  }

  return { client: data, error: null }
}

export async function createRepair(input: CreateRepairInput) {
  try {
    return await createRepairInner(input)
  } catch (e) {
    if (isNextRedirectError(e)) throw e
    console.error("[createRepair] no controlado:", e)
    return { success: false, error: sanitizeUnexpectedRepairError(e) }
  }
}

async function createRepairInner(input: CreateRepairInput) {
  const parsed = createRepairInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: formatCreateRepairValidationError(parsed.error),
    }
  }
  const data = parsed.data as CreateRepairInput

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // El anticipo se guarda en la tabla reparaciones (campo anticipo).
  // El registro de abonos en caja se maneja por separado para evitar
  // errores de colisión - el usuario puede registrar el abono después
  // desde el módulo de caja o desde la ficha del ticket.

  let clientId = data.clienteId

  if (!clientId) {
    // If no clienteId provided, create or find client
    const { client, error: clientError } = await createOrUpdateClient(
      data.customerPhone,
      data.customerName,
      data.customerEmail || ""
    )

    if (clientError || !client) {
      console.error("Error with client:", clientError)
      return { success: false, error: "No se pudo registrar al cliente." }
    }

    clientId = client.id
  } else {
    // Verify that the clienteId exists AND belongs to current taller
    const { data: clientData, error: verifyError } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", clientId)
      .eq("taller_id", tallerId)
      .single()

    if (verifyError || !clientData) {
      console.error("Client not found:", verifyError)
      return { success: false, error: "Cliente no encontrado." }
    }
  }

  const explicitFolio =
    typeof data.folio === "string" && data.folio.trim() !== "" ? data.folio.trim() : undefined

  const secDb = normalizeSecurityForDb({
    securityType: data.securityType,
    securityValue: data.securityValue,
    pinContrasena: data.pinContrasena,
    patronDesbloqueo: data.patronDesbloqueo,
  })

  // Calcular precio estimado: suma de servicios + precio manual
  let precioEstimadoNum = data.estimatedPrice ? parseFloat(data.estimatedPrice) : 0
  const serviciosSeleccionados = data.servicios ?? []
  let serviciosTotal = 0

  if (serviciosSeleccionados.length > 0) {
    // Obtener precios del catálogo para calcular total
    const svcIds = serviciosSeleccionados.map((s) => s.servicio_id)
    const { data: catRows } = await supabase
      .from("catalogo_servicios")
      .select("id, precio")
      .in("id", svcIds)
      .eq("taller_id", tallerId)
    const priceMap = new Map<string, number>()
    for (const row of (catRows ?? []) as { id: string; precio: number }[]) {
      priceMap.set(row.id, Number(row.precio))
    }
    serviciosTotal = serviciosSeleccionados.reduce((sum, s) => {
      const p = priceMap.get(s.servicio_id) ?? 0
      return sum + p * (s.cantidad ?? 1)
    }, 0)
  }

  const precioFinal = serviciosTotal + precioEstimadoNum

  const insertPayload: Record<string, unknown> = {
    taller_id: tallerId,
    cliente_id: clientId,
    marca: data.deviceBrand,
    modelo: data.deviceModel,
    numero_serie: data.deviceSerial || null,
    color: data.deviceColor?.trim() || null,
    falla: data.reportedFault,
    precio_estimado: precioFinal > 0 ? precioFinal : null,
    anticipo: data.deposit ? parseFloat(data.deposit) : null,
    estatus: "Recibido",
    tecnico: data.technician || "Sin asignar",
    tipo_equipo: data.tipo_equipo || "Celular",
    security_type: secDb.security_type,
    security_value: secDb.security_value,
    pin_contrasena: secDb.pin_contrasena,
    patron_desbloqueo: secDb.patron_desbloqueo,
    fotos: [],
    notas_internas: data.notasInternas?.trim() ? data.notasInternas.trim() : null,
    checklist_ingreso:
      data.checklistIngreso != null
        ? checklistIngresoToJson(data.checklistIngreso)
        : null,
  }

  const checklistProRaw = data.checklist_pro ?? data.checklistPro
  if (checklistProRaw != null) {
    const cp = parseChecklistPro(
      typeof checklistProRaw === "object" ? checklistProRaw : { funcional: {} },
    )
    if (cp && hasMeaningfulChecklistProData(cp)) {
      insertPayload.checklist_pro = checklistProToJson(cp)
    }
  }

  if (explicitFolio) {
    insertPayload.folio = explicitFolio
  }

  const ssrClient = await createSsrClient()
  const {
    data: { user: authUser },
  } = await ssrClient.auth.getUser()
  if (authUser?.id) {
    insertPayload.usuario_recepcion_id = authUser.id
  }

  // Insert: folio lo asigna el trigger si no viene en insertPayload; historial basal vía trigger DB
  const { data: inserted, error: repairError } = await supabase
    .from("reparaciones")
    .insert(insertPayload)
    .select("id, folio")
    .single()

  if (repairError) {
    console.error("Error creating repair:", repairError)
    return { success: false, error: formatPostgrestError(repairError) }
  }

  const repairId = inserted?.id as string | undefined
  const assignedFolio = inserted?.folio as string | undefined

  /** Primer evento de auditoría (misma migración que retira el trigger basal). */
  if (repairId) {
    const actorNombre = await getCurrentActorDisplayName()
    const { error: histErr } = await supabase.from("historial_reparacion").insert({
      reparacion_id: repairId,
      taller_id: tallerId,
      usuario_id: tallerId,
      estado_anterior: null,
      estado_nuevo: "Recibido",
      nota_tecnica: `Equipo Recibido - Orden Generada por ${actorNombre}`,
      actor_nombre: actorNombre,
    })
    if (histErr) {
      console.error("[createRepair] historial_reparacion insert:", histErr)
    }
  }

  // Guardar servicios vinculados
  if (repairId && serviciosSeleccionados.length > 0) {
    const { error: svcErr } = await setServiciosReparacion(repairId, serviciosSeleccionados)
    if (svcErr) {
      console.error("[createRepair] setServiciosReparacion:", svcErr)
    }
  }

  // Fotos: subir después de tener el folio definitivo (rutas en storage)
  let uploadedPhotoUrls: string[] = []
  if (data.photos && data.photos.length > 0 && assignedFolio) {
    const up = await uploadRepairPhotos(repairId!, data.photos, tallerId)
    if (up.error) {
      console.error("[createRepair] uploadRepairPhotos:", up.error)
    }
    uploadedPhotoUrls = up.urls
    if (uploadedPhotoUrls.length > 0 && repairId) {
      const { error: upErr } = await supabase
        .from("reparaciones")
        .update({ fotos: uploadedPhotoUrls })
        .eq("id", repairId)
        .eq("taller_id", tallerId)
      if (upErr) {
        console.error("Error updating repair photos:", upErr)
      }
    }
  }

  return {
    success: true,
    repairId,
    folio: assignedFolio,
  }
}

/** Alias en español (misma acción que `createRepair`). */
export const crearReparacion = createRepair

/** Actualiza el arreglo de URLs públicas de fotos (tras subida desde cliente o servidor). */
export async function updateRepairFotos(repairId: string, fotos: string[]) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()
  const { error } = await supabase
    .from("reparaciones")
    .update({ fotos })
    .eq("id", repairId)
    .eq("taller_id", tallerId)
  if (error) {
    console.error("updateRepairFotos:", error)
    return { success: false, error: error.message }
  }
  return { success: true as const }
}

/**
 * Genera signed URLs para las fotos de evidencia de una reparación pública.
 * Re-valida los últimos 4 dígitos del teléfono antes de emitir las URLs.
 * Las URLs expiran en 2 horas — seguras para compartir en tracking público.
 */
/**
 * Devuelve el nombre público del taller asociado a una reparación.
 * Solo expone nombre (dato no sensible). No requiere validación de teléfono.
 */
export async function getTrackingTallerInfo(
  ticketId: string
): Promise<{ name: string } | null> {
  if (!ticketId) return null

  // Usar cliente anónimo con RPC pública en lugar de admin client
  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data } = await supabase
    .rpc("get_tracking_taller_info", { p_ticket_id: ticketId })
    .maybeSingle()

  if (!data) return null

  return { name: (data as { nombre_taller?: string | null }).nombre_taller || "Mi Taller" }
}

export async function getTrackingPhotoUrls(
  ticketId: string,
  last4: string
): Promise<string[]> {
  if (!ticketId || !last4 || last4.length !== 4) return []

  // Usar RPC pública en lugar de admin client para obtener datos de tracking
  const ssr = await createSsrClient()
  const { data: repair } = await ssr
    .rpc("get_tracking_info", {
      p_ticket_id: ticketId,
      p_last4: last4.trim(),
    })
    .maybeSingle()

  if (!repair) return []

  // Normalizar fotos: puede ser string[] (text[]) o null
  const fotosRaw = (repair as Record<string, unknown>).fotos as string[] | string | null
  let photoEntries: string[] = []

  if (Array.isArray(fotosRaw)) {
    photoEntries = fotosRaw.filter(Boolean)
  } else if (typeof fotosRaw === "string" && fotosRaw) {
    // Formato PostgreSQL array literal: {url1,url2}
    if (fotosRaw.startsWith("{")) {
      photoEntries = fotosRaw
        .slice(1, -1)
        .split(",")
        .map((s) => s.replace(/^"|"$/g, "").trim())
        .filter(Boolean)
    } else {
      try {
        const parsed = JSON.parse(fotosRaw)
        photoEntries = Array.isArray(parsed) ? parsed.filter(Boolean) : []
      } catch {
        photoEntries = [fotosRaw]
      }
    }
  }

  if (!photoEntries.length) return []

  return getSignedUrls(BUCKETS.REPAIR_PHOTOS, photoEntries, 7200)
}

export interface RepairOrder {
  id: string
  folio: string
  customer: string
  phone: string
  device: string
  tipo_equipo: string
  status: "Recibido" | "Diagnostico" | "En Reparacion" | "Listo" | "Entregado"
  date: string
  problem: string
  price: string
  technician: string
}

export async function getRepairs(): Promise<{ data: RepairOrder[]; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("reparaciones")
    .select(`
      id,
      folio,
      marca,
      modelo,
      tipo_equipo,
      estatus,
      created_at,
      falla,
      precio_estimado,
      tecnico,
      clientes ( nombre, telefono )
    `)
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching repairs:", error)
    return { data: [], error: "No se pudieron cargar las reparaciones." }
  }

  const repairs: RepairOrder[] = (data || []).map((r: Record<string, unknown>) => {
    const cliente = r.clientes as { nombre: string; telefono: string } | null
    return {
      id: r.id as string,
      folio: r.folio as string,
      customer: cliente?.nombre || "Sin nombre",
      phone: cliente?.telefono || "",
      device: `${r.marca} ${r.modelo}`,
      tipo_equipo: (r.tipo_equipo as string) || "",
      status: (r.estatus as RepairOrder["status"]) || "Recibido",
      date: new Date(r.created_at as string).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      problem: (r.falla as string) || "",
      price: r.precio_estimado
        ? `$${Number(r.precio_estimado).toLocaleString("es-MX")}`
        : "Pendiente",
      technician: (r.tecnico as string) || "Pendiente",
    }
  })

  return { data: repairs, error: null }
}

export async function getReparacionesListas(): Promise<{ data: RepairOrder[]; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("reparaciones")
    .select(`
      id,
      folio,
      marca,
      modelo,
      tipo_equipo,
      estatus,
      created_at,
      falla,
      precio_estimado,
      tecnico,
      clientes ( nombre, telefono )
    `)
    .eq("taller_id", tallerId)
    .eq("estatus", "Listo")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching reparaciones listas:", error)
    return { data: [], error: "No se pudieron cargar las reparaciones listas." }
  }

  const repairs: RepairOrder[] = (data || []).map((r: Record<string, unknown>) => {
    const cliente = r.clientes as { nombre: string; telefono: string } | null
    return {
      id: r.id as string,
      folio: r.folio as string,
      customer: cliente?.nombre || "Sin nombre",
      phone: cliente?.telefono || "",
      device: `${r.marca} ${r.modelo}`,
      tipo_equipo: (r.tipo_equipo as string) || "",
      status: (r.estatus as RepairOrder["status"]) || "Recibido",
      date: new Date(r.created_at as string).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      problem: (r.falla as string) || "",
      price: r.precio_estimado
        ? `$${Number(r.precio_estimado).toLocaleString("es-MX")}`
        : "Pendiente",
      technician: (r.tecnico as string) || "Pendiente",
    }
  })

  return { data: repairs, error: null }
}

export interface DashboardStats {
  enProceso: number
  listos: number
  ventasMes: number
  urgentes: number
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Mapea la fila de `get_dashboard_stats` al shape del Dashboard.
 * La RPC actual devuelve: `en_proceso_count`, `listos_count`, `ingresos_brutos_mes`, `urgentes_count`.
 * Se mantienen fallbacks a los nombres legacy (`en_proceso`, `ventas_pdv` + `cobros_rep`, …).
 */
function mapDashboardStatsRow(row: Record<string, unknown>): DashboardStats {
  const enProceso = num(
    row.en_proceso_count ?? row.en_proceso
  )
  const listos = num(row.listos_count ?? row.listos)
  const urgentes = num(row.urgentes_count ?? row.urgentes)

  const ingresosSingle = row.ingresos_brutos_mes ?? row.ingresos_brutos ?? row.ventas_mes
  const ventasMes =
    ingresosSingle !== undefined && ingresosSingle !== null
      ? num(ingresosSingle)
      : num(row.ventas_pdv) + num(row.cobros_rep)

  return {
    enProceso,
    listos,
    ventasMes,
    urgentes,
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Solo p_taller_id: fechas y TZ los calcula la RPC en PostgreSQL.
  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_taller_id: tallerId,
  })

  if (error || !data || data.length === 0) {
    console.error("[getDashboardStats] rpc error:", error?.message)
    return { enProceso: 0, listos: 0, ventasMes: 0, urgentes: 0 }
  }

  return mapDashboardStatsRow(data[0] as Record<string, unknown>)
}

export interface BitacoraRepair {
  id: string
  folio: string
  clienteName: string
  clientePhone: string
  deviceBrand: string
  deviceModel: string
  tipo_equipo?: string | null
  estimatedPrice: number | null
  /** Running total of all payments (anticipo field in reparaciones, updated on every abono) */
  anticipo: number
  status: "Recibido" | "Diagnostico" | "En Reparacion" | "Listo" | "Entregado" | "Cancelado" | "Sin Reparacion" | "Reingreso"
  createdAt: string
  /** ISO; misma base que usa el dashboard para urgentes (7+ días sin movimiento). */
  updatedAtRaw?: string | null
  tecnico?: string
  falla?: string | null
  /** Seguridad v2 — viaja en la lista para que la etiqueta siempre tenga el dato */
  securityType?: string | null
  securityValue?: string | null
  pinContrasena?: string | null
}

/** Full repair detail for the detail modal (includes pin, pattern, photos, deposit) */
export interface RepairDetail extends Omit<BitacoraRepair, "status"> {
  /** Estado guardado en el ticket; undefined cuando no hay estado en BD (no auto-seleccionar DIAGNÓSTICO) */
  status?: BitacoraRepair["status"]
  pinContrasena?: string | null
  patronDesbloqueo?: string | null
  /** Seguridad v2 */
  securityType?: SecurityTab | null
  securityValue?: string | null
  fotos?: string[] | null
  /** Signed URLs for display (2h expiry). Use `fotos` for DB operations. */
  fotosSignedUrls?: string[] | null
  falla?: string | null
  /** ISO date string for timeline/header (Registrado el) */
  createdAtRaw?: string | null
  tipo_equipo?: string | null
  imei?: string | null
  color?: string | null
  clienteEmail?: string | null
  /** Total cobrable (BD); si no viene, usar estimatedPrice */
  costoTotal?: number | null
  /** Saldo pendiente costo_total - anticipo (BD) */
  restante?: number | null
  /** Quién abrió el ticket (sesión al crear); resuelto vía usuario_recepcion_id + miembros / taller_users. */
  creadoPorNombre?: string | null
  /** Notas internas (solo taller) */
  notasInternas?: string | null
  /** Checklist de ingreso (recepción) */
  checklistIngreso?: ChecklistIngreso | null
  /** Diagnóstico PRO (health check) */
  checklistPro?: ChecklistProData | null
}

/** Mapea una fila de `reparaciones` (+ `clientes` anidado) a `RepairDetail`. */
function mapReparacionRecordToRepairDetail(
  rec: Record<string, unknown>,
  fotosSignedUrls: string[] | null
): RepairDetail {
  const clientes = rec.clientes as { nombre?: string; telefono?: string; correo?: string } | null
  const clienteName = clientes?.nombre != null && String(clientes.nombre).trim() !== "" ? String(clientes.nombre) : null
  const clientePhone = clientes?.telefono != null ? String(clientes.telefono) : ""

  const rawEstatus = (rec.estatus ?? rec.estado) as string | null | undefined
  const statusVal = rawEstatus != null && String(rawEstatus).trim() !== "" ? (rawEstatus as BitacoraRepair["status"]) : undefined

  const rawFotos = Array.isArray(rec.fotos) ? (rec.fotos as string[]) : null

  const sec = mapRecordToSecurityDisplay(rec)

  return {
    id: rec.id as string,
    folio: rec.folio as string,
    clienteName: clienteName ?? "—",
    clientePhone,
    deviceBrand: (rec.marca as string) || "N/A",
    deviceModel: (rec.modelo as string) || "N/A",
    estimatedPrice: rec.precio_estimado as number | null,
    status: statusVal,
    createdAt: new Date(rec.created_at as string).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    createdAtRaw: (rec.created_at as string) || null,
    tecnico: (rec.tecnico as string) || "No asignado",
    pinContrasena: sec.pinContrasena,
    patronDesbloqueo: sec.patronDesbloqueo,
    securityType: sec.securityType,
    securityValue: sec.securityValue,
    fotos: rawFotos,
    fotosSignedUrls,
    anticipo: rec.anticipo != null ? Number(rec.anticipo) : 0,
    falla: (rec.falla as string) || null,
    tipo_equipo: (rec.tipo_equipo as string) || null,
    imei: (rec.numero_serie as string) || null,
    color: (rec.color as string) || null,
    notasInternas: rec.notas_internas != null ? String(rec.notas_internas) : null,
    checklistIngreso: parseChecklistIngreso(rec.checklist_ingreso) ?? null,
    checklistPro: (() => {
      try {
        return parseChecklistPro(rec.checklist_pro) ?? null
      } catch {
        return null
      }
    })(),
    clienteEmail: clientes?.correo ? String(clientes.correo) : null,
    costoTotal: rec.costo_total != null ? Number(rec.costo_total) : null,
    restante: rec.restante != null ? Number(rec.restante) : null,
  }
}

export type RepairChangeHistoryRow = {
  id: string
  tipo_cambio: string
  descripcion: string
  created_at: string
  valor_anterior?: string | null
  valor_nuevo?: string | null
  usuario?: string | null
}

/** Fila de auditoría de cambio de estado (historial_reparacion + nombre de usuario). */
export interface HistorialReparacionAuditRow {
  id: string
  estado_anterior: string | null
  estado_nuevo: string
  nota_tecnica: string | null
  fecha: string
  usuario_nombre: string
}

async function enrichHistorialReparacionRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: {
    id: string
    estado_anterior: string | null
    estado_nuevo: string
    nota_tecnica: string | null
    fecha: string
    usuario_id: string | null
    actor_nombre?: string | null
  }[] | null
): Promise<HistorialReparacionAuditRow[]> {
  if (!rows?.length) return []
  const needsLookup = rows.filter((r) => !r.actor_nombre?.trim() && r.usuario_id)
  const ids = [...new Set(needsLookup.map((r) => r.usuario_id).filter(Boolean))] as string[]
  const userMap = new Map<string, string>()
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from("taller_users")
      .select("id, nombre_propietario, nombre_taller, email")
      .in("id", ids)
    for (const u of users ?? []) {
      const record = u as {
        id: string
        nombre_propietario?: string | null
        nombre_taller?: string | null
        email?: string | null
      }
      const label = (
        record.nombre_propietario?.trim() ||
        record.email?.trim() ||
        record.nombre_taller?.trim() ||
        "Usuario del taller"
      ).trim()
      userMap.set(record.id, label)
    }
  }
  return rows.map((row) => {
    const fromSnapshot = row.actor_nombre?.trim()
    if (fromSnapshot) {
      return {
        id: row.id,
        estado_anterior: row.estado_anterior,
        estado_nuevo: row.estado_nuevo,
        nota_tecnica: row.nota_tecnica,
        fecha: row.fecha,
        usuario_nombre: fromSnapshot,
      }
    }
    return {
      id: row.id,
      estado_anterior: row.estado_anterior,
      estado_nuevo: row.estado_nuevo,
      nota_tecnica: row.nota_tecnica,
      fecha: row.fecha,
      usuario_nombre: row.usuario_id
        ? (userMap.get(row.usuario_id) ?? "Usuario del taller")
        : "Sistema",
    }
  })
}

export async function getRepairsByTallerId(
  page = 0,
  pageSize = 50,
  /** Búsqueda por folio (ilike) — empujada a SQL para no depender de datos en memoria */
  search?: string,
  /** Filtro por estatus exacto ("Recibido", "En Reparacion", "Listo", "Entregado") — empujado a SQL */
  estatusFilter?: string
): Promise<{ data: BitacoraRepair[]; error: string | null; total: number }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const from = page * pageSize
  const to = from + pageSize - 1

  // PERF: count: "planned" usa estadísticas de Postgres en vez de COUNT(*) exacto.
  // Evita el segundo round-trip a la BD que "exact" requiere (escaneo completo).
  let query = supabase
    .from("reparaciones")
    .select(
      `id, folio, estatus, created_at, updated_at,
       precio_estimado, anticipo, marca, modelo, tecnico, falla,
       security_type, security_value, pin_contrasena,
       cliente_nombre, cliente_telefono,
       clientes ( nombre, telefono )`,
      { count: "planned" }
    )
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .range(from, to)

  // PERF: filtros empujados a SQL — reducen datos transferidos y trabajo de la BD
  if (search?.trim()) {
    const term = search.trim()
    query = query.or(
      [
        `folio.ilike.%${term}%`,
        `cliente_nombre.ilike.%${term}%`,
        `cliente_telefono.ilike.%${term}%`,
        `marca.ilike.%${term}%`,
        `modelo.ilike.%${term}%`,
      ].join(",")
    )
  }
  if (estatusFilter) {
    query = query.eq("estatus", estatusFilter)
  }

  const { data, error, count } = await query

  if (error) {
    console.error("Error fetching repairs by taller:", error)
    return { data: [], error: "No se pudieron cargar las reparaciones.", total: 0 }
  }

  const repairs: BitacoraRepair[] = (data || []).map((r: Record<string, unknown>) => {
    const cliente = r.clientes as { nombre: string; telefono: string } | null
    const updatedRaw = (r.updated_at as string | null) ?? null
    return {
      id: r.id as string,
      folio: r.folio as string,
      clienteName: cliente?.nombre || "Sin nombre",
      clientePhone: cliente?.telefono || "",
      deviceBrand: (r.marca as string) || "N/A",
      deviceModel: (r.modelo as string) || "N/A",
      estimatedPrice: r.precio_estimado as number | null,
      status: (r.estatus as BitacoraRepair["status"]) || "Recibido",
      createdAt: new Date(r.created_at as string).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      updatedAtRaw: updatedRaw,
      tecnico: (r.tecnico as string) || "No asignado",
      falla: (r.falla as string) || null,
      anticipo: Number(r.anticipo ?? 0),
      securityType: (r.security_type as string | null) ?? null,
      securityValue: (r.security_value as string | null) ?? null,
      pinContrasena: (r.pin_contrasena as string | null) ?? null,
    }
  })

  return { data: repairs, error: null, total: count ?? 0 }
}

/**
 * Carga detalle + historial de cambios + gastos del ticket en una sola query (embeds).
 * Si PostgREST no puede resolver relaciones, hace fallback a consultas paralelas.
 */
export async function getRepairDetailPageData(repairId: string): Promise<{
  detail: RepairDetail | null
  changes: RepairChangeHistoryRow[]
  gastos: ReparacionGasto[]
  historialAudit: HistorialReparacionAuditRow[]
  servicios: import("@/lib/actions/servicios").ReparacionServicio[]
  error: string | null
}> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const embedSelect = `
    *,
    clientes ( nombre, telefono, correo ),
    cambios_reparaciones ( id, tipo_cambio, descripcion, created_at, valor_anterior, valor_nuevo, usuario ),
    reparacion_gastos ( id, reparacion_id, concepto, monto, tipo, producto_id, mostrar_cliente, created_at ),
    reparacion_servicios ( id, reparacion_id, servicio_id, nombre_snapshot, precio_snapshot, cantidad, created_at )
  `

  const { data: r, error } = await supabase
    .from("reparaciones")
    .select(embedSelect)
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  let historialAudit: HistorialReparacionAuditRow[] = []
  const histRes = await supabase
    .from("historial_reparacion")
    .select("id, estado_anterior, estado_nuevo, nota_tecnica, fecha, usuario_id, actor_nombre")
    .eq("reparacion_id", repairId)
    .eq("taller_id", tallerId)
    .order("fecha", { ascending: false })

  if (histRes.error) {
    console.warn("[getRepairDetailPageData] historial_reparacion:", histRes.error.message)
  } else {
    historialAudit = await enrichHistorialReparacionRows(
      supabase,
      (histRes.data ?? []) as {
        id: string
        estado_anterior: string | null
        estado_nuevo: string
        nota_tecnica: string | null
        fecha: string
        usuario_id: string | null
        actor_nombre?: string | null
      }[]
    )
  }

  if (error || !r) {
    if (error?.code === "PGRST116") return { detail: null, changes: [], gastos: [], historialAudit, servicios: [], error: null }
    console.warn("[getRepairDetailPageData] embed falló, usando fallback:", error?.message ?? error)
    const { getGastosTicket } = await import("@/lib/actions/gastos")
    const { getServiciosReparacion } = await import("@/lib/actions/servicios")
    const [d, h, g, s] = await Promise.all([
      getRepairDetail(repairId),
      getRepairChangeHistory(repairId),
      getGastosTicket(repairId),
      getServiciosReparacion(repairId),
    ])
    return {
      detail: d.data,
      changes: (h.changes ?? []) as RepairChangeHistoryRow[],
      gastos: g.data,
      historialAudit,
      servicios: s.data,
      error: d.error,
    }
  }

  const rec = r as Record<string, unknown>
  const rawFotos = Array.isArray(rec.fotos) ? (rec.fotos as string[]) : null
  let fotosSignedUrls: string[] | null = null
  if (rawFotos && rawFotos.length > 0) {
    const signed = await getSignedUrls(BUCKETS.REPAIR_PHOTOS, rawFotos)
    fotosSignedUrls = signed.length > 0 ? signed : null
  }

  let detail = mapReparacionRecordToRepairDetail(rec, fotosSignedUrls)
  const recepUid = rec.usuario_recepcion_id as string | undefined
  if (recepUid) {
    const nombre = await resolveUsuarioRecepcionNombre(supabase, tallerId, recepUid)
    detail = { ...detail, creadoPorNombre: nombre }
  }

  const cambiosRaw = rec.cambios_reparaciones
  const changes: RepairChangeHistoryRow[] = Array.isArray(cambiosRaw)
    ? [...(cambiosRaw as RepairChangeHistoryRow[])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    : []

  const gastosRaw = rec.reparacion_gastos
  const gastos: ReparacionGasto[] = Array.isArray(gastosRaw)
    ? (gastosRaw as Record<string, unknown>[]).map((g) => ({
        id: String(g.id),
        reparacion_id: String(g.reparacion_id),
        concepto: String(g.concepto ?? ""),
        monto: Number(g.monto ?? 0),
        tipo: g.tipo as ReparacionGasto["tipo"],
        producto_id: g.producto_id ? String(g.producto_id) : null,
        mostrar_cliente: Boolean(g.mostrar_cliente),
        created_at: String(g.created_at ?? ""),
      }))
    : []

  const serviciosRaw = rec.reparacion_servicios
  const servicios: import("@/lib/actions/servicios").ReparacionServicio[] = Array.isArray(serviciosRaw)
    ? (serviciosRaw as Record<string, unknown>[]).map((s) => ({
        id: String(s.id),
        reparacion_id: String(s.reparacion_id),
        servicio_id: s.servicio_id ? String(s.servicio_id) : null,
        nombre_snapshot: String(s.nombre_snapshot ?? ""),
        precio_snapshot: Number(s.precio_snapshot ?? 0),
        cantidad: Number(s.cantidad ?? 1),
        created_at: String(s.created_at ?? ""),
      }))
    : []

  return { detail, changes, gastos, historialAudit, servicios, error: null }
}

/** Fetch a single repair by ID with full detail (pin, pattern, photos, anticipo). */
export async function getRepairDetail(repairId: string): Promise<{ data: RepairDetail | null; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data: r, error } = await supabase
    .from("reparaciones")
    .select("*, clientes ( nombre, telefono, correo )")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !r) {
    if (error?.code === "PGRST116") return { data: null, error: null }
    console.error("Error fetching repair detail:", error)
    return { data: null, error: "No se pudo cargar el detalle." }
  }

  const rec = r as Record<string, unknown>
  const rawFotos = Array.isArray(rec.fotos) ? (rec.fotos as string[]) : null

  let fotosSignedUrls: string[] | null = null
  if (rawFotos && rawFotos.length > 0) {
    const signed = await getSignedUrls(BUCKETS.REPAIR_PHOTOS, rawFotos)
    fotosSignedUrls = signed.length > 0 ? signed : null
  }

  let detail = mapReparacionRecordToRepairDetail(rec, fotosSignedUrls)
  const recepUid = rec.usuario_recepcion_id as string | undefined
  if (recepUid) {
    const nombre = await resolveUsuarioRecepcionNombre(supabase, tallerId, recepUid)
    detail = { ...detail, creadoPorNombre: nombre }
  }
  return { data: detail, error: null }
}

/**
 * Actualiza el estatus, registra en historial_reparacion y en cambios_reparaciones (bitácora).
 * Errores se registran en consola; no relanza excepciones al cliente.
 */
export async function applyRepairStatusChange(input: {
  repairId: string
  estadoAnterior: string
  estadoNuevo: string
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()

    const { data: rowBefore, error: rowErr } = await supabase
      .from("reparaciones")
      .select("checklist_pro, fotos, firma_ingreso_path, estatus")
      .eq("id", input.repairId)
      .eq("taller_id", tallerId)
      .single()

    if (rowErr || !rowBefore) {
      return { success: false, error: "No se encontró la reparación." }
    }

    const normPrev = String(input.estadoAnterior ?? "").trim()
    const normNew = String(input.estadoNuevo ?? "").trim()
    const recibidoToReparacion = normPrev === "Recibido" && normNew === "En Reparacion"

    if (recibidoToReparacion) {
      const { ajustes } = await getAjustesTallerFlujoPro()
      if (ajustes.health_check_required && !passesHealthCheckRequirement((rowBefore as Record<string, unknown>).checklist_pro)) {
        return {
          success: false,
          error:
            "⚠️ Acción Bloqueada: El taller requiere diagnóstico completo para iniciar reparación",
        }
      }
      if (ajustes.firma_required) {
        const fp = (rowBefore as Record<string, unknown>).firma_ingreso_path
        if (fp == null || String(fp).trim() === "") {
          return {
            success: false,
            error: "⚠️ Acción Bloqueada: El taller requiere firma de ingreso antes de avanzar.",
          }
        }
      }
      if (ajustes.fotos_required) {
        const fotos = (rowBefore as Record<string, unknown>).fotos as string[] | null
        if (!Array.isArray(fotos) || fotos.length === 0) {
          return {
            success: false,
            error: "⚠️ Acción Bloqueada: El taller requiere al menos una foto de evidencia.",
          }
        }
      }
    }

    const updatePayload: { estatus: string; fecha_entrega?: string } = {
      estatus: input.estadoNuevo,
    }
    if (input.estadoNuevo === "Entregado") {
      updatePayload.fecha_entrega = new Date().toISOString()
    }

    const { error: uErr } = await supabase
      .from("reparaciones")
      .update(updatePayload)
      .eq("id", input.repairId)
      .eq("taller_id", tallerId)

    if (uErr) {
      console.error("applyRepairStatusChange update:", uErr)
      return { success: false, error: "No se pudo actualizar el estado." }
    }

    const actorNombre = await getCurrentActorDisplayName()

    try {
      const { error: hErr } = await supabase.from("historial_reparacion").insert({
        reparacion_id: input.repairId,
        taller_id: tallerId,
        usuario_id: tallerId,
        estado_anterior: input.estadoAnterior || null,
        estado_nuevo: input.estadoNuevo,
        nota_tecnica: input.notaTecnica?.trim() || null,
        actor_nombre: actorNombre,
      })

      if (hErr) {
        console.error("applyRepairStatusChange historial_reparacion insert:", hErr)
        try {
          await supabase
            .from("reparaciones")
            .update({ estatus: input.estadoAnterior })
            .eq("id", input.repairId)
            .eq("taller_id", tallerId)
        } catch (revertErr) {
          console.error("applyRepairStatusChange revert estatus:", revertErr)
        }
        return { success: false, error: "No se pudo registrar el historial de auditoría." }
      }
    } catch (histErr) {
      console.error("applyRepairStatusChange historial_reparacion (excepción):", histErr)
      try {
        await supabase
          .from("reparaciones")
          .update({ estatus: input.estadoAnterior })
          .eq("id", input.repairId)
          .eq("taller_id", tallerId)
      } catch (revertErr) {
        console.error("applyRepairStatusChange revert estatus:", revertErr)
      }
      return { success: false, error: "No se pudo registrar el historial de auditoría." }
    }

    try {
      await logRepairChange(
        input.repairId,
        "estado",
        `Estado: ${input.estadoAnterior} → ${input.estadoNuevo}`,
        input.estadoAnterior,
        input.estadoNuevo
      )
    } catch (logErr) {
      console.error("applyRepairStatusChange logRepairChange:", logErr)
    }

    return { success: true }
  } catch (e) {
    console.error("applyRepairStatusChange (fatal):", e)
    return { success: false, error: "Error inesperado al cambiar el estado." }
  }
}

// Update repair with presupuesto and/or estado
export async function updateRepair(repairId: string, updates: { presupuesto?: number; estado?: string }) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const isOwner = await isCurrentUserOwner(tallerId)

  const updateData: Record<string, unknown> = {}
  if (updates.presupuesto !== undefined) {
    if (!isOwner) {
      return { success: false, error: "Solo el propietario puede modificar el presupuesto." }
    }
    updateData.precio_estimado = updates.presupuesto
  }
  if (updates.estado !== undefined) {
    // Estados críticos solo para propietarios; técnicos pueden cambiar estados operativos
    const estadosCriticos = ["entregado", "cancelado", "no_reparable"]
    if (estadosCriticos.includes(updates.estado.toLowerCase()) && !isOwner) {
      return { success: false, error: "Solo el propietario puede cambiar a este estado." }
    }
    updateData.estatus = updates.estado
  }

  const { error } = await supabase
    .from("reparaciones")
    .update(updateData)
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("Error updating repair:", error)
    return { success: false, error: "No se pudo actualizar la reparación." }
  }

  return { success: true }
}

/**
 * Actualiza el presupuesto (precio_estimado) de una reparación y registra
 * el cambio en cambios_reparaciones para auditoría.
 */
export async function actualizarPresupuestoReparacion(
  repairId: string,
  nuevoPresupuesto: number,
  descripcion?: string
): Promise<{ success: boolean; nuevoPresupuesto?: number; error?: string; logError?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // 1. Obtener presupuesto actual
  const { data: rec, error: fetchErr } = await supabase
    .from("reparaciones")
    .select("precio_estimado")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchErr || !rec) {
    console.error("[actualizarPresupuestoReparacion] fetch error:", fetchErr)
    return { success: false, error: "No se encontró la reparación." }
  }

  const presupuestoAnterior = Number(rec.precio_estimado ?? 0)

  // 2. Actualizar precio_estimado
  const { error: updErr } = await supabase
    .from("reparaciones")
    .update({ precio_estimado: nuevoPresupuesto })
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (updErr) {
    console.error("[actualizarPresupuestoReparacion] update error:", updErr)
    return { success: false, error: "No se pudo actualizar el presupuesto." }
  }

  // 3. Registrar en bitácora usando logRepairChange (patrón probado)
  const razon = descripcion?.trim() || "Presupuesto actualizado"
  const nota = `${razon} — $${presupuestoAnterior.toLocaleString("es-MX")} → $${nuevoPresupuesto.toLocaleString("es-MX")}`
  try {
    const logRes = await logRepairChange(
      repairId,
      "presupuesto",
      nota,
      presupuestoAnterior.toString(),
      nuevoPresupuesto.toString()
    )
    if (!logRes.success) {
      return { success: true, nuevoPresupuesto, logError: "El presupuesto se guardó pero no se registró en el historial (logRepairChange falló)." }
    }
  } catch (logErr) {
    console.error("[actualizarPresupuestoReparacion] logRepairChange excepción:", logErr)
    return { success: true, nuevoPresupuesto, logError: "El presupuesto se guardó pero no se registró en el historial." }
  }

  return { success: true, nuevoPresupuesto }
}

// Delete repair permanently (only for current taller)
export async function deleteRepair(repairId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { error } = await supabase
    .from("reparaciones")
    .delete()
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("Error deleting repair:", error)
    return { success: false, error: "No se pudo eliminar el folio." }
  }
  return { success: true }
}

/**
 * Personal asignable a reparaciones: dueño del taller (siempre primero), miembros activos
 * de `miembros_taller`, y técnicos activos de `tecnicos`. Sin duplicados por nombre.
 * La lista no queda vacía: hay al menos una fila de respaldo.
 */
export async function getAssignableStaffForRepairs(): Promise<{
  staff: { id: string; nombre: string }[]
  error: string | null
}> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const seen = new Set<string>()
  const staff: { id: string; nombre: string }[] = []

  const add = (id: string, nombre: string) => {
    const n = nombre.trim()
    if (!n) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    staff.push({ id, nombre: n })
  }

  const [
    { data: ownerRow, error: ownerErr },
    { data: miembros, error: miembrosErr },
    { data: techs, error: techErr },
  ] = await Promise.all([
    supabase.from("taller_users").select("nombre_propietario, email").eq("id", tallerId).maybeSingle(),
    supabase.from("miembros_taller").select("id, nombre").eq("taller_id", tallerId).eq("activo", true),
    supabase.from("tecnicos").select("id, nombre").eq("taller_id", tallerId).eq("estatus", "Activo").order("nombre", { ascending: true }),
  ])

  if (!ownerErr && ownerRow) {
    const o = ownerRow as { nombre_propietario?: string | null; email?: string | null }
    const name = o.nombre_propietario?.trim() || o.email?.trim() || "Propietario"
    add(`owner:${tallerId}`, name)
  }

  if (miembrosErr) {
    console.error("getAssignableStaffForRepairs miembros_taller:", miembrosErr)
  } else {
    for (const m of miembros ?? []) {
      const row = m as { id: string; nombre: string }
      add(`member:${row.id}`, row.nombre)
    }
  }

  if (techErr) {
    console.error("getAssignableStaffForRepairs tecnicos:", techErr)
  } else {
    for (const t of techs ?? []) {
      const row = t as { id: string; nombre: string }
      add(`tecnico:${row.id}`, row.nombre)
    }
  }

  staff.sort((a, b) => {
    const aOwn = a.id.startsWith("owner:")
    const bOwn = b.id.startsWith("owner:")
    if (aOwn && !bOwn) return -1
    if (!aOwn && bOwn) return 1
    return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
  })

  if (staff.length === 0) {
    add("fallback", "Propietario")
  }

  return { staff, error: null }
}

/** Alias de `getAssignableStaffForRepairs` para código que espera `technicians`. */
export async function getAllActiveTechnicians() {
  const { staff, error } = await getAssignableStaffForRepairs()
  if (error) return { technicians: [], error }
  return { technicians: staff, error: null }
}

// Log a repair change
export async function logRepairChange(
  repairId: string,
  tipoChange: string,
  descripcion: string,
  valorAnterior?: string,
  valorNuevo?: string
) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Verify the repair belongs to the current taller before logging
  const { data: repair } = await supabase
    .from("reparaciones")
    .select("id")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (!repair) {
    console.error("logRepairChange: repair not found or access denied")
    return { success: false }
  }

  const actorNombre = await getCurrentActorDisplayName()

  const { error } = await supabase.from("cambios_reparaciones").insert({
    reparacion_id: repairId,
    tipo_cambio: tipoChange,
    descripcion: descripcion,
    valor_anterior: valorAnterior || null,
    valor_nuevo: valorNuevo || null,
    usuario: actorNombre,
  })

  if (error) {
    console.error("Error logging repair change:", error)
    return { success: false }
  }

  return { success: true }
}

// Get repair change history
export async function getRepairChangeHistory(repairId: string) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Verify the repair belongs to the current taller
  const { data: repair } = await supabase
    .from("reparaciones")
    .select("id")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (!repair) {
    return { changes: [], error: "Reparación no encontrada." }
  }

  const { data, error } = await supabase
    .from("cambios_reparaciones")
    .select("id, tipo_cambio, descripcion, created_at, valor_anterior, valor_nuevo, usuario")
    .eq("reparacion_id", repairId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching repair changes:", error)
    return { changes: [], error: "No se pudo cargar el historial." }
  }

  return { changes: data || [], error: null }
}

// Update repair with technician and log change
export async function updateRepairWithTechnician(
  repairId: string,
  tecnicoId: string,
  tecnicoNombre: string
) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // First get current technician to log the change (also verifies ownership)
  const { data: currentRepair } = await supabase
    .from("reparaciones")
    .select("tecnico")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (!currentRepair) {
    return { success: false, error: "Reparación no encontrada." }
  }

  const technicoAnterior = (currentRepair?.tecnico as string) || "No asignado"

  // Update the technician (only update tecnico name, not tecnico_id)
  const { error: updateError } = await supabase
    .from("reparaciones")
    .update({ tecnico: tecnicoNombre })
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (updateError) {
    console.error("Error updating technician:", updateError)
    return { success: false, error: "No se pudo asignar el técnico." }
  }

  // Log the change
  await logRepairChange(
    repairId,
    "tecnico",
    `Técnico reasignado: ${technicoAnterior} → ${tecnicoNombre}`,
    technicoAnterior,
    tecnicoNombre
  )

  return { success: true }
}

// Public: get a single repair by ID and validate last 4 phone digits for tracking
export async function getRepairForTracking(
  repairId: string,
  phoneLastDigits: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!repairId) {
      return { success: false, error: "ID de ticket inválido" }
    }

    if (phoneLastDigits.length !== 4 || !/^\d+$/.test(phoneLastDigits)) {
      return { success: false, error: "Ingresa los últimos 4 dígitos válidos" }
    }

    const supabase = await createClient()

    const { data: repair, error } = await supabase
      .from("reparaciones")
      .select("id, folio, estatus, cliente_nombre, cliente_telefono, marca, modelo, tipo_equipo, color, numero_serie, falla, precio_estimado, anticipo, costo_total, restante, fotos, fecha_entrega, taller_id, tecnico, created_at")
      .eq("id", repairId)
      .single()

    if (error) {
      const pgErr = error as { code?: string }
      if (pgErr.code === "PGRST116") {
        return {
          success: false,
          error: "No encontramos este ticket. Verifica el enlace o contacta a tu taller.",
        }
      }
      console.error("Error fetching repair for tracking:", error)
      return { success: false, error: "Error al buscar el ticket" }
    }

    if (!repair) {
      return {
        success: false,
        error: "No encontramos este ticket. Verifica el enlace o contacta a tu taller.",
      }
    }

    const rawPhone = (repair as Record<string, unknown>).cliente_telefono as string | null
    if (!rawPhone) {
      return {
        success: false,
        error: "No hay un teléfono asociado a este ticket. Contacta a tu taller.",
      }
    }

    const cleaned = rawPhone.replace(/\D/g, "")
    const last4 = cleaned.slice(-4)

    if (last4 !== phoneLastDigits) {
      return {
        success: false,
        error: "Los dígitos ingresados no coinciden",
      }
    }

    return { success: true, data: repair }
  } catch (error) {
    console.error("getRepairForTracking error:", error)
    return { success: false, error: "Error del servidor" }
  }
}

// ─── Registrar Abono ──────────────────────────────────────────────────────────

export async function registrarAbono(input: {
  repairId: string
  monto: number
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
}): Promise<{
  success: boolean
  error?: string
  nuevoAnticipo?: number
  saldoPendiente?: number
  liquidado?: boolean
  movimientoCajaId?: string | null
}> {
  // Validación de entrada
  if (!input.repairId) return { success: false, error: "ID de reparación requerido." }
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { success: false, error: "El monto debe ser mayor a cero." }
  }
  if (input.monto > 1_000_000) {
    return { success: false, error: "El monto excede el límite permitido." }
  }

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // 1. Fetch current repair
  const { data: row, error: fetchError } = await supabase
    .from("reparaciones")
    .select("anticipo, precio_estimado, folio, cliente_nombre, marca, modelo")
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchError || !row) {
    return { success: false, error: "No se encontró la reparación." }
  }

  const currentAnticipo = Number((row as Record<string, unknown>).anticipo ?? 0)
  const presupuesto = Number((row as Record<string, unknown>).precio_estimado ?? 0)
  const folio = (row as Record<string, unknown>).folio as string
  const clienteNombre = String((row as Record<string, unknown>).cliente_nombre ?? "").trim() || null
  const dispositivo = [
    String((row as Record<string, unknown>).marca ?? ""),
    String((row as Record<string, unknown>).modelo ?? ""),
  ].filter(Boolean).join(" ").trim()

  // No permitir abonar más del saldo pendiente (evita overpayment accidental)
  if (presupuesto > 0 && currentAnticipo + input.monto > presupuesto * 1.1) {
    return { success: false, error: `El abono excede el saldo pendiente de $${(presupuesto - currentAnticipo).toLocaleString("es-MX")}.` }
  }

  // Require an open caja before recording any payment
  const { data: cajaCheck, error: cajaErr } = await supabase
    .from("caja")
    .select("id")
    .eq("taller_id", tallerId)
    .eq("estado", "abierta")
    .order("fecha_apertura", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cajaErr) {
    console.error("[registrarAbono] Error al buscar caja:", cajaErr)
  }

  if (!cajaCheck?.id) {
    return {
      success: false,
      error: "No hay caja abierta. Abre la caja antes de registrar un abono.",
    }
  }
  const cajaId = (cajaCheck as Record<string, unknown>).id as string

  // 2. Get actor name for denormalized vendedor_nombre field
  const actorNombre = await getCurrentActorDisplayName()

  // 3. Atomic: update anticipo + insert movimientos_caja in a single DB transaction.
  //    If the INSERT fails, the UPDATE is automatically rolled back by PostgreSQL.
  const { data: rpcData, error: rpcError } = await supabase.rpc("registrar_abono_atomico", {
    p_repair_id:       input.repairId,
    p_taller_id:       tallerId,
    p_monto:           input.monto,
    p_metodo_pago:     input.metodoPago,
    p_caja_id:         cajaId,
    p_folio_rep:       folio ?? "",
    p_cliente_nombre:  clienteNombre ?? "",
    p_vendedor_nombre: actorNombre,
    p_dispositivo:     dispositivo,
  })

  if (rpcError) {
    console.error("[registrarAbono] RPC error — código:", rpcError.code, "— mensaje:", rpcError.message, "— detalle:", rpcError.details)
    // Distinguish between "function not found" (migration not applied) and other DB errors
    const esFuncionNoExiste = rpcError.code === "PGRST202" || rpcError.message?.includes("Could not find the function")
    if (esFuncionNoExiste) {
      return { success: false, error: "Función de base de datos no encontrada. Contacta al soporte técnico (migración pendiente)." }
    }
    return { success: false, error: `Error al registrar el abono: ${rpcError.message ?? "error desconocido"}.` }
  }

  const rpc = rpcData as {
    ok: boolean
    error?: string
    nuevo_anticipo?: number
    liquidado?: boolean
    folio_abono?: string
    movimiento_id?: string
  }

  if (!rpc.ok) {
    console.error("[registrarAbono] RPC returned not-ok:", rpc.error)
    return { success: false, error: rpc.error ?? "Error al registrar el abono." }
  }

  // Defensive: if the RPC said ok=true but didn't return a movimiento id,
  // something unexpected happened — surface it rather than silently succeeding.
  if (!rpc.movimiento_id) {
    console.error("[registrarAbono] RPC ok=true but movimiento_id is missing — possible INSERT failure", rpc)
    return { success: false, error: "El abono no quedó registrado en caja. Intenta de nuevo." }
  }

  const nuevoAnticipo = rpc.nuevo_anticipo ?? currentAnticipo + input.monto
  const liquidado     = rpc.liquidado ?? false
  const saldoPendiente = Math.max(0, presupuesto - nuevoAnticipo)
  const movimientoCajaId = rpc.movimiento_id

  // 4. Audit log (best-effort — non-critical, does not affect financial data)
  try {
    await logRepairChange(
      input.repairId,
      "abono",
      `Abono registrado: +$${input.monto.toLocaleString("es-MX")} (${input.metodoPago}) · Total abonado: $${nuevoAnticipo.toLocaleString("es-MX")}`,
      String(currentAnticipo),
      String(nuevoAnticipo),
    )
  } catch (e) {
    console.warn("[registrarAbono] logRepairChange failed (non-fatal):", e)
  }

  return { success: true, nuevoAnticipo, saldoPendiente, liquidado, movimientoCajaId }
}

/**
 * Reactivates a delivered repair as a warranty/reingreso return.
 * Changes estatus to "Reingreso" and inserts an audit entry.
 * The existing anticipo (total paid) is preserved; a new precio_estimado
 * can then be set to reflect additional work — restante recalculates automatically.
 */
export async function reactivarReingreso(input: {
  repairId: string
  motivo: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!input.repairId) return { success: false, error: "ID de reparación requerido." }
    const motivo = input.motivo.trim()
    if (!motivo) return { success: false, error: "El motivo del reingreso es obligatorio." }
    if (motivo.length > 500) return { success: false, error: "El motivo no puede superar 500 caracteres." }

    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()

    // Fetch repair — must belong to this taller and be in "Entregado" state
    const { data: row, error: fetchErr } = await supabase
      .from("reparaciones")
      .select("id, estatus, folio")
      .eq("id", input.repairId)
      .eq("taller_id", tallerId)
      .single()

    if (fetchErr || !row) {
      const detail = fetchErr?.message?.trim()
      return {
        success: false,
        error: detail ? `No se encontró la reparación o no tienes acceso. (${detail})` : "No se encontró la reparación.",
      }
    }

    const rec = row as Record<string, unknown>
    const estatusActual = String(rec.estatus ?? "")
    if (estatusActual !== "Entregado") {
      return {
        success: false,
        error: `Solo se pueden reactivar reparaciones con estatus "Entregado". Estado actual: ${estatusActual}.`,
      }
    }

    // Update estatus to "Reingreso"
    const { error: updateErr } = await supabase
      .from("reparaciones")
      .update({ estatus: "Reingreso" })
      .eq("id", input.repairId)
      .eq("taller_id", tallerId)

    if (updateErr) {
      console.error("[reactivarReingreso] update error:", updateErr)
      const hint =
        updateErr.code === "23514"
          ? " Restricción CHECK en estatus — valida que «Reingreso» esté permitido en la columna."
          : ""
      return {
        success: false,
        error: `No se pudo actualizar el estatus.${hint} Detalle: ${updateErr.message || updateErr.code || "desconocido"}`,
      }
    }

    // Historial audit (critical) - inserts into historial_reparacion
    const actor = await getCurrentActorDisplayName()
    const { error: hErr } = await supabase.from("historial_reparacion").insert({
      reparacion_id: input.repairId,
      taller_id: tallerId,
      usuario_id: tallerId,
      estado_anterior: "Entregado",
      estado_nuevo: "Reingreso",
      nota_tecnica: `Motivo: ${motivo}`,
      actor_nombre: actor,
    })

    if (hErr) {
      console.error("[reactivarReingreso] historial_reparacion insert:", hErr)
      // Rollback estatus on historial failure
      await supabase.from("reparaciones").update({ estatus: "Entregado" })
        .eq("id", input.repairId)
        .eq("taller_id", tallerId)
      return { success: false, error: "No se pudo registrar en el historial." }
    }

    // Legacy audit entry (best-effort) - for backwards compatibility
    try {
      await logRepairChange(
        input.repairId,
        "estado",
        `REINGRESO ACTIVADO: ${motivo}`,
        "Entregado",
        "Reingreso",
      )
    } catch (e) {
      console.warn("[reactivarReingreso] logRepairChange failed (non-fatal):", e)
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[reactivarReingreso] unexpected:", e)
    return { success: false, error: msg || "Error inesperado al reactivar el reingreso." }
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtMoney(n: number): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function notaEntregaLiquidada(actor: string, extra?: string | null): string {
  const base = `Equipo Entregado - Saldo Liquidado por ${actor}`
  const t = extra?.trim()
  return t ? `${base} · ${t}` : base
}

/**
 * Marca la reparación como Entregado: opcional venta en PDV/caja por el saldo pendiente
 * y registro en historial con auditoría de liquidación.
 */
export async function confirmarEntregaConLiquidacion(input: {
  repairId: string
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()
  const actor = await getCurrentActorDisplayName()

  const { data: row, error: fetchErr } = await supabase
    .from("reparaciones")
    .select(
      "id, folio, estatus, anticipo, precio_estimado, costo_total, restante, marca, modelo, clientes ( nombre )"
    )
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: "No se encontró la reparación." }
  }

  const rec = row as Record<string, unknown>
  if (String(rec.estatus) === "Entregado") {
    return { success: false, error: "La orden ya está marcada como entregada." }
  }

  const anticipo = Number(rec.anticipo ?? 0)
  const costoTotal = Number(rec.costo_total ?? rec.precio_estimado ?? 0)
  const restDb = rec.restante != null && rec.restante !== "" ? Number(rec.restante) : null
  const saldo = roundMoney(
    Math.max(0, restDb != null && !Number.isNaN(restDb) ? restDb : costoTotal - anticipo)
  )

  const suma = roundMoney(
    Number(input.monto_efectivo || 0) + Number(input.monto_tarjeta || 0) + Number(input.monto_transferencia || 0)
  )

  const folio = String(rec.folio ?? "")
  const dispositivoLiq = [String(rec.marca ?? ""), String(rec.modelo ?? "")].filter(Boolean).join(" ").trim()

  if (saldo > 0.01) {
    if (Math.abs(suma - saldo) > 0.03) {
      return {
        success: false,
        error: `El monto a cobrar debe ser exactamente $${saldo.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      }
    }
    const { caja, error: cajaErr } = await getCajaAbierta()
    if (cajaErr || !caja?.id) {
      return {
        success: false,
        error: "No hay caja abierta. Abre caja en Punto de venta para registrar el cobro.",
      }
    }

    // Atomic: movimientos_caja (liquidacion_reparacion) + anticipo + estatus + historial
    const { data: liqData, error: liqErr } = await supabase.rpc("registrar_liquidacion_atomica", {
      p_repair_id:       input.repairId,
      p_taller_id:       tallerId,
      p_monto:           saldo,
      p_metodo_pago:     input.metodoPago,
      p_caja_id:         caja.id,
      p_folio_rep:       folio,
      p_dispositivo:     dispositivoLiq,
      p_vendedor_nombre: actor,
      p_estado_anterior: String(rec.estatus ?? "Recibido"),
      p_nota_tecnica:    notaEntregaLiquidada(actor, input.notaTecnica),
      p_actor_nombre:    actor,
    })

    if (liqErr) {
      console.error("[confirmarEntregaConLiquidacion] RPC error:", liqErr.code, liqErr.message)
      return { success: false, error: `No se pudo registrar la liquidación: ${liqErr.message ?? "error desconocido"}.` }
    }

    const liq = liqData as { ok: boolean; error?: string; movimiento_id?: string }
    if (!liq.ok) {
      console.error("[confirmarEntregaConLiquidacion] RPC not-ok:", liq.error)
      return { success: false, error: liq.error ?? "Error al liquidar la reparación." }
    }
  } else {
    // Fully paid — just mark as Entregado, no new cash movement needed
    const { error: rpcErr } = await supabase.rpc("finalizar_entrega_reparacion", {
      p_repair_id: input.repairId,
      p_taller_id: tallerId,
      p_nuevo_anticipo: anticipo,
      p_estado_anterior: String(rec.estatus ?? "Recibido"),
      p_nota_tecnica: notaEntregaLiquidada(actor, input.notaTecnica),
      p_actor_nombre: actor,
    })
    if (rpcErr) {
      console.error("[confirmarEntregaConLiquidacion] finalizar_entrega_reparacion (sin saldo):", rpcErr)
      return { success: false, error: "No se pudo registrar la entrega." }
    }
  }

  try {
    const prev = String(rec.estatus ?? "Recibido")
    await logRepairChange(input.repairId, "estado", `Estado: ${prev} → Entregado`, prev, "Entregado")
  } catch {}

  return { success: true }
}

/**
 * Ajusta el costo (p. ej. solo revisión o $0) y entrega; cobra saldo si aplica.
 * Registra reembolso del excedente en movimientos_caja (efectivo/transferencia).
 */
export async function entregarSinReparacionConAjuste(input: {
  repairId: string
  costoRevision: number
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  metodoDevolucion?: "efectivo" | "transferencia"
  montoDevolucionEfectivo?: number
  montoDevolucionTransferencia?: number
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  if (!Number.isFinite(input.costoRevision) || input.costoRevision < 0) {
    return { success: false, error: "El costo de revisión no es válido." }
  }

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()
  const actor = await getCurrentActorDisplayName()

  const { data: row, error: fetchErr } = await supabase
    .from("reparaciones")
    .select("id, folio, estatus, anticipo, precio_estimado, clientes ( nombre )")
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: "No se encontró la reparación." }
  }

  const rec = row as Record<string, unknown>
  if (String(rec.estatus) === "Entregado") {
    return { success: false, error: "La orden ya está marcada como entregada." }
  }

  const curAnt = Number(rec.anticipo ?? 0)
  const costoRevision = roundMoney(input.costoRevision)
  const nuevoAnticipoCap =
    costoRevision === 0 ? 0 : Math.min(curAnt, costoRevision)
  const surplusRefund = roundMoney(Math.max(0, curAnt - nuevoAnticipoCap))

  const { error: upCosto } = await supabase
    .from("reparaciones")
    .update({
      precio_estimado: costoRevision,
      anticipo: nuevoAnticipoCap,
    })
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)

  if (upCosto) {
    console.error("[entregarSinReparacionConAjuste] update costo:", upCosto)
    return { success: false, error: "No se pudo ajustar el costo del ticket." }
  }

  // ── Reembolso del excedente en movimientos_caja ──────────────────────────
  let refundWarning: string | undefined = undefined
  if (surplusRefund > 0.01) {
    const metodoDev = input.metodoDevolucion ?? "efectivo"
    const montoEf = input.montoDevolucionEfectivo ?? (metodoDev === "efectivo" ? surplusRefund : 0)
    const montoTr = input.montoDevolucionTransferencia ?? (metodoDev === "transferencia" ? surplusRefund : 0)

    // Validar que coincida
    if (Math.round((montoEf + montoTr) * 100) / 100 !== surplusRefund) {
      return { success: false, error: `El monto de devolución debe ser exactamente ${fmtMoney(surplusRefund)}.` }
    }

    let cajaId: string | null = null
    if (montoEf > 0.01) {
      const { data: cajaRow } = await supabase
        .from("caja")
        .select("id, saldo_actual")
        .eq("taller_id", tallerId)
        .eq("estado", "abierta")
        .order("fecha_apertura", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!cajaRow?.id) {
        refundWarning = `No se pudo registrar el reembolso en efectivo de ${fmtMoney(montoEf)}: no hay caja abierta.`
      } else {
        cajaId = cajaRow.id
        const { error: movErr } = await supabase.from("movimientos_caja").insert({
          taller_id: tallerId,
          caja_id: cajaRow.id,
          tipo: "reembolso",
          descripcion: `Reembolso anticipo — Folio ${String(rec.folio ?? "")}`,
          monto: -Math.abs(montoEf),
          metodo_pago: "efectivo",
          fecha: new Date().toISOString(),
          actor_nombre: actor,
        })
        if (movErr) {
          refundWarning = `Error al registrar reembolso en efectivo: ${movErr.message}`
        } else {
          // Actualizar saldo de caja
          await supabase
            .from("caja")
            .update({ saldo_actual: Number(cajaRow.saldo_actual ?? 0) - Math.abs(montoEf) })
            .eq("id", cajaRow.id)
        }
      }
    }

    if (montoTr > 0.01) {
      const { error: movErr } = await supabase.from("movimientos_caja").insert({
        taller_id: tallerId,
        caja_id: cajaId ?? undefined,
        tipo: "reembolso",
        descripcion: `Reembolso anticipo (transferencia) — Folio ${String(rec.folio ?? "")}`,
        monto: -Math.abs(montoTr),
        metodo_pago: "transferencia",
        fecha: new Date().toISOString(),
        actor_nombre: actor,
      })
      if (movErr) {
        refundWarning = refundWarning
          ? `${refundWarning}; Error en transferencia: ${movErr.message}`
          : `Error al registrar reembolso por transferencia: ${movErr.message}`
      }
    }
  }

  const { data: row2 } = await supabase
    .from("reparaciones")
    .select("anticipo, costo_total, restante, folio, estatus, clientes ( nombre )")
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)
    .single()

  if (!row2) return { success: false, error: "No se pudo releer la reparación." }

  const r2 = row2 as Record<string, unknown>
  const anticipo2 = Number(r2.anticipo ?? 0)
  const costo2 = Number(r2.costo_total ?? costoRevision)
  const restDb = r2.restante != null && r2.restante !== "" ? Number(r2.restante) : null
  const saldo = roundMoney(
    Math.max(0, restDb != null && !Number.isNaN(restDb) ? restDb : costo2 - anticipo2)
  )

  const suma = roundMoney(
    Number(input.monto_efectivo || 0) + Number(input.monto_tarjeta || 0) + Number(input.monto_transferencia || 0)
  )

  if (saldo > 0.01) {
    if (Math.abs(suma - saldo) > 0.03) {
      return {
        success: false,
        error: `Debes cobrar exactamente $${saldo.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por el cargo acordado.`,
      }
    }
    const { caja, error: cajaErr } = await getCajaAbierta()
    if (cajaErr || !caja?.id) {
      return {
        success: false,
        error: "No hay caja abierta. Abre caja para registrar el cobro.",
      }
    }

    const folio = String(r2.folio ?? "")
    const cliente = r2.clientes as { nombre?: string | null } | null
    const ventaRes = await crearVenta({
      caja_id: caja.id,
      cliente_nombre: cliente?.nombre?.trim() || undefined,
      total: saldo,
      descuento: 0,
      metodo_pago: input.metodoPago,
      monto_efectivo: roundMoney(input.monto_efectivo),
      monto_tarjeta: roundMoney(input.monto_tarjeta),
      monto_transferencia: roundMoney(input.monto_transferencia),
      cambio: 0,
      items: [
        {
          descripcion: `Revisión / sin reparación — ${folio}`,
          cantidad: 1,
          precio_unitario: saldo,
          costo_unitario: 0,
          es_especial: true,
        },
      ],
    })

    if (ventaRes.error || !ventaRes.venta) {
      return { success: false, error: ventaRes.error ?? "No se pudo registrar la venta." }
    }

    const nuevoAnticipo = roundMoney(anticipo2 + saldo)
    const notaSin2 = input.notaTecnica?.trim()
      ? `Entrega sin reparación (${input.notaTecnica.trim()})`
      : "Entrega sin reparación"
    const { error: rpcErr } = await supabase.rpc("finalizar_entrega_reparacion", {
      p_repair_id: input.repairId,
      p_taller_id: tallerId,
      p_nuevo_anticipo: nuevoAnticipo,
      p_estado_anterior: String(r2.estatus ?? "Recibido"),
      p_nota_tecnica: `${notaSin2} — ${notaEntregaLiquidada(actor, null)}`,
      p_actor_nombre: actor,
    })
    if (rpcErr) {
      console.error("[entregarSinReparacionConAjuste] finalizar_entrega_reparacion:", rpcErr)
      return { success: false, error: "Venta registrada pero no se pudo finalizar la entrega. Contacta soporte." }
    }
  } else {
    const notaSin2 = input.notaTecnica?.trim()
      ? `Entrega sin reparación (${input.notaTecnica.trim()})`
      : "Entrega sin reparación"
    const { error: rpcErr } = await supabase.rpc("finalizar_entrega_reparacion", {
      p_repair_id: input.repairId,
      p_taller_id: tallerId,
      p_nuevo_anticipo: anticipo2,
      p_estado_anterior: String(r2.estatus ?? "Recibido"),
      p_nota_tecnica: `${notaSin2} — ${notaEntregaLiquidada(actor, null)}`,
      p_actor_nombre: actor,
    })
    if (rpcErr) {
      console.error("[entregarSinReparacionConAjuste] finalizar_entrega_reparacion (sin saldo):", rpcErr)
      return { success: false, error: "No se pudo registrar la entrega." }
    }
  }

  try {
    const prev = String(r2.estatus ?? "Recibido")
    await logRepairChange(input.repairId, "estado", `Estado: ${prev} → Entregado`, prev, "Entregado")
  } catch {}

  return { success: true, warning: refundWarning }
}

// ─── Update full repair (edit mode) ──────────────────────────────────────────

export interface UpdateRepairFullInput {
  repairId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  clienteId?: string
  tipo_equipo?: string
  deviceBrand: string
  deviceModel: string
  deviceSerial?: string
  deviceColor?: string
  reportedFault: string
  estimatedPrice?: string
  technician?: string
  pinContrasena?: string
  patronDesbloqueo?: string
  securityType?: string
  securityValue?: string
  /** New photos as base64 strings to upload and append */
  newPhotos?: string[]
  /** Existing photo storage paths/keys to remove */
  removedPhotos?: string[]
  /** All existing photo paths currently kept (will be merged with newly uploaded) */
  keptPhotos?: string[]
  notasInternas?: string
  checklistIngreso?: ChecklistIngreso | null
}

export async function updateRepairFull(
  input: UpdateRepairFullInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Verify the repair belongs to this taller and get current data
  const { data: currentRow, error: fetchError } = await supabase
    .from("reparaciones")
    .select("folio, cliente_id, anticipo, fotos")
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchError || !currentRow) {
    return { success: false, error: "No se encontró la reparación." }
  }

  const rec = currentRow as Record<string, unknown>
  const folio = rec.folio as string

  // Update or upsert client
  const { client: updatedClient, error: clientError } = await createOrUpdateClient(
    input.customerPhone,
    input.customerName,
    input.customerEmail || "",
  )
  if (clientError || !updatedClient) {
    return { success: false, error: "No se pudo actualizar el cliente." }
  }

  // Upload new photos
  let newlyUploadedUrls: string[] = []
  if (input.newPhotos && input.newPhotos.length > 0) {
    const up = await uploadRepairPhotos(input.repairId, input.newPhotos, tallerId)
    if (up.error) {
      return { success: false, error: up.error }
    }
    newlyUploadedUrls = up.urls
  }

  // Merge: kept existing + newly uploaded
  const keptPhotos = input.keptPhotos ?? []
  const finalPhotos = [...keptPhotos, ...newlyUploadedUrls]

  // Remove photos from storage that were deleted — paralelo con Promise.allSettled
  if (input.removedPhotos && input.removedPhotos.length > 0) {
    const marker = `/object/public/${BUCKETS.REPAIR_PHOTOS}/`
    const pathsToRemove = input.removedPhotos
      .map((url) => {
        const idx = url.indexOf(marker)
        return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length)) : null
      })
      .filter((p): p is string => p !== null)

    if (pathsToRemove.length > 0) {
      const { error } = await supabase.storage.from(BUCKETS.REPAIR_PHOTOS).remove(pathsToRemove)
      if (error) console.error("[updateRepairFull] photo removal failed (best-effort):", error)
    }
  }

  const secDb = normalizeSecurityForDb({
    securityType: input.securityType,
    securityValue: input.securityValue,
    pinContrasena: input.pinContrasena,
    patronDesbloqueo: input.patronDesbloqueo,
  })

  const updateData: Record<string, unknown> = {
    cliente_id: updatedClient.id,
    tipo_equipo: input.tipo_equipo || null,
    marca: input.deviceBrand,
    modelo: input.deviceModel,
    numero_serie: input.deviceSerial || null,
    color: input.deviceColor?.trim() || null,
    falla: input.reportedFault,
    precio_estimado: input.estimatedPrice ? parseFloat(input.estimatedPrice) : null,
    tecnico: input.technician || null,
    security_type: secDb.security_type,
    security_value: secDb.security_value,
    pin_contrasena: secDb.pin_contrasena,
    patron_desbloqueo: secDb.patron_desbloqueo,
    fotos: finalPhotos.length > 0 ? finalPhotos : null,
    notas_internas: input.notasInternas?.trim() ? input.notasInternas.trim() : null,
  }

  if (input.checklistIngreso !== undefined) {
    updateData.checklist_ingreso =
      input.checklistIngreso != null ? checklistIngresoToJson(input.checklistIngreso) : null
  }

  const { error: updateError } = await supabase
    .from("reparaciones")
    .update(updateData)
    .eq("id", input.repairId)
    .eq("taller_id", tallerId)

  if (updateError) {
    console.error("Error updating repair:", JSON.stringify(updateError))
    return { success: false, error: `Error Supabase: ${updateError.message} (${updateError.code})` }
  }

  await logRepairChange(
    input.repairId,
    "edicion",
    `Ticket modificado — ${input.deviceBrand} ${input.deviceModel}`,
  )

  return { success: true }
}

/** Persiste solo el JSON de diagnóstico PRO (health check) en el ticket. */
export async function updateRepairChecklistPro(
  repairId: string,
  data: ChecklistProData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { error } = await supabase
    .from("reparaciones")
    .update({ checklist_pro: checklistProToJson(data) })
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("[updateRepairChecklistPro]", error)
    return { success: false, error: `Error Supabase: ${error.message} (${error.code})` }
  }

  await logRepairChange(repairId, "edicion", "Diagnóstico PRO (health check) actualizado")

  return { success: true }
}

/** Actualiza observaciones estéticas y/o notas internas sin tocar el resto del ticket. */
export async function updateRepairQuickNotes(
  repairId: string,
  data: { observacionesEsteticas?: string; notasInternas?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Fetch current checklist_ingreso to merge
  const { data: row, error: fetchErr } = await supabase
    .from("reparaciones")
    .select("checklist_ingreso, notas_internas")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (fetchErr || !row) {
    return { success: false, error: "No se encontró la reparación." }
  }

  const current = parseChecklistIngreso(row.checklist_ingreso) ?? {
    encendido: null,
    funcional: {},
    observacionesEsteticas: "",
  }

  const updateData: Record<string, unknown> = {}

  if (data.observacionesEsteticas !== undefined) {
    updateData.checklist_ingreso = checklistIngresoToJson({
      ...current,
      observacionesEsteticas: data.observacionesEsteticas,
    })
  }

  if (data.notasInternas !== undefined) {
    updateData.notas_internas = data.notasInternas.trim() || null
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true }
  }

  const { error } = await supabase
    .from("reparaciones")
    .update(updateData)
    .eq("id", repairId)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("[updateRepairQuickNotes]", error)
    return { success: false, error: `Error Supabase: ${error.message} (${error.code})` }
  }

  const logMsg = []
  if (data.observacionesEsteticas !== undefined) logMsg.push("observaciones estéticas")
  if (data.notasInternas !== undefined) logMsg.push("notas internas")
  await logRepairChange(repairId, "edicion", logMsg.join(" + ") + " actualizadas")

  return { success: true }
}

// ─── Fetch reparación por folio (para rutas de impresión) ─────────────────────

export interface RepairPrintData {
  id: string
  folio: string
  estado: string
  fecha_creacion: string
  fecha_entrega?: string | null
  cliente_nombre: string
  cliente_telefono: string
  tecnico?: string | null
      dispositivo_marca: string
      dispositivo_modelo: string
      tipo_equipo?: string | null
      imei_serie?: string | null
  color?: string | null
  falla_reportada: string
  precio_estimado?: number | null
  anticipo?: number | null
  costo_total?: number | null
  restante?: number | null
  notas_internas?: string | null
  pin_contrasena?: string | null
  fotos?: string[]
  checklist_ingreso?: ChecklistIngreso | null
  gastos: Array<{ descripcion: string; costo: number }>
}

export async function getRepairByFolio(
  folio: string
): Promise<{ data: RepairPrintData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // Normalizar folio: trim + uppercase para evitar fallos por espacios o capitalización
  const folioNorm = folio.trim().toUpperCase()

  // select("*") evita el error 42703 por nombres de columna incorrectos.
  // Es el mismo patrón que usa getRepairDetail (confirmado funcional).
  const { data: rep, error } = await supabase
    .from("reparaciones")
    .select("*, clientes ( nombre, telefono )")
    .ilike("folio", folioNorm)
    .eq("taller_id", tallerId)
    .single()

  if (error || !rep) {
    return {
      data: null,
      error: `No se encontró la reparación (folio: ${folioNorm}, taller: ${tallerId ?? "none"}, err: ${error?.code ?? "none"}).`,
    }
  }

  const r = rep as Record<string, unknown>
  const clientes = r.clientes as { nombre?: string; telefono?: string } | null

  // Gastos internos del ticket — columnas reales: concepto, monto
  const { data: gastosRaw } = await supabase
    .from("reparacion_gastos")
    .select("concepto, monto")
    .eq("reparacion_id", r.id as string)
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: true })

  // Signed URLs para fotos (si las hay)
  const fotoUrls: string[] = []
  const rawFotos = r.fotos as string[] | null
  if (rawFotos && rawFotos.length > 0) {
    const { data: signed } = await supabase.storage
      .from("repair-photos")
      .createSignedUrls(rawFotos, 3600)
    if (signed) fotoUrls.push(...signed.map((s) => s.signedUrl).filter((u): u is string => typeof u === "string"))
  }

  return {
    data: {
      id:               r.id              as string,
      folio:            r.folio           as string,
      estado:           r.estatus         as string,        // estatus → estado (alias del DTO)
      fecha_creacion:   r.created_at      as string,
      fecha_entrega:    null,
      cliente_nombre:   clientes?.nombre  ?? "",
      cliente_telefono: clientes?.telefono ?? "",
      tecnico:          r.tecnico         as string | null,
       dispositivo_marca:  r.marca         as string,        // marca → dispositivo_marca
      dispositivo_modelo: r.modelo        as string,        // modelo → dispositivo_modelo
      tipo_equipo:        r.tipo_equipo   as string | null, // tipo_equipo
      imei_serie:         r.numero_serie  as string | null, // numero_serie → imei_serie
      color:            r.color           as string | null,
      falla_reportada:  r.falla           as string,        // falla → falla_reportada
      precio_estimado:  r.precio_estimado as number | null,
      anticipo:         r.anticipo        as number | null,
      costo_total:      r.costo_total     as number | null,
      restante:         r.restante        as number | null,
      notas_internas:   r.notas_internas  as string | null,
      pin_contrasena:   r.pin_contrasena  as string | null,
      fotos:            fotoUrls,
      checklist_ingreso: parseChecklistIngreso(r.checklist_ingreso) ?? null,
      gastos: (gastosRaw ?? []).map((g) => {
        const row = g as Record<string, unknown>
        return { descripcion: String(row.concepto ?? ""), costo: Number(row.monto ?? 0) }
      }),
    },
    error: null,
  }
}

// ─── Label data for /print-label/[id] — repair-label and service-label kinds ──

export interface RepairLabelFetchData {
  id: string
  folio: string
  cliente_nombre: string
  cliente_telefono: string
  dispositivo_marca: string
  dispositivo_modelo: string
  tipo_equipo?: string | null
  falla_reportada: string
  precio_estimado: number | null
  created_at: string
  security_type: string | null
  security_value: string | null
  pin_contrasena: string | null
  checklist_ingreso: Record<string, unknown> | null
}

export async function getRepairLabelData(
  repairId: string
): Promise<{ data: RepairLabelFetchData | null; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data: rep, error } = await supabase
    .from("reparaciones")
    .select("id, folio, cliente_nombre, cliente_telefono, marca, modelo, tipo_equipo, falla, precio_estimado, created_at, security_type, security_value, pin_contrasena, checklist_ingreso")
    .eq("id", repairId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !rep) {
    return { data: null, error: "Reparación no encontrada." }
  }

  const r = rep as Record<string, unknown>
  return {
    data: {
      id: r.id as string,
      folio: r.folio as string,
      cliente_nombre: r.cliente_nombre as string,
      cliente_telefono: r.cliente_telefono as string,
      dispositivo_marca: r.marca as string,
      dispositivo_modelo: r.modelo as string,
      tipo_equipo: (r.tipo_equipo as string | null) ?? null,
      falla_reportada: r.falla as string,
      precio_estimado: r.precio_estimado != null ? Number(r.precio_estimado) : null,
      created_at: r.created_at as string,
      security_type: (r.security_type as string | null) ?? null,
      security_value: (r.security_value as string | null) ?? null,
      pin_contrasena: (r.pin_contrasena as string | null) ?? null,
      checklist_ingreso: (r.checklist_ingreso as Record<string, unknown> | null) ?? null,
    },
    error: null,
  }
}

/**
 * Prefetch: returns the total refund amount and breakdown by metodo_pago
 * for the repair's existing payment movements (anticipo + liquidacion).
 * Used to populate the cancellation dialog BEFORE the user confirms.
 */
export async function getCancelacionSummary(repairId: string): Promise<{
  total: number
  movements: Array<{ id: string; tipo: string; monto: number; metodo_pago: string; caja_id: string | null }>
  error?: string
}> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()
    if (!tallerId) return { total: 0, movements: [], error: "Sin sesión" }

    const { data, error } = await supabase
      .from("movimientos_caja")
      .select("id, tipo, monto, metodo_pago, caja_id")
      .eq("referencia_id", repairId)
      .eq("taller_id", tallerId)
      .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"])

    if (error) return { total: 0, movements: [], error: error.message }

    const movements = (data ?? []) as Array<{ id: string; tipo: string; monto: number; metodo_pago: string; caja_id: string | null }>
    const total = movements.reduce((sum, m) => sum + Number(m.monto), 0)
    return { total, movements }
  } catch (e) {
    console.error("[getCancelacionSummary]", e)
    return { total: 0, movements: [], error: "Error inesperado" }
  }
}

/**
 * Cancels a repair:
 * 1. Guards against double-cancel and terminal states.
 * 2. Mirrors each payment movement (anticipo/liquidacion) as a devolucion_cancelacion egreso.
 * 3. Restores stock for all refaccion-type gastos with a linked producto_id (qty 1 each).
 * 4. Changes estatus to "Cancelado" via applyRepairStatusChange (writes historial_reparacion).
 *
 * Financial movements are best-effort (logged on failure, don't block status change).
 * Stock restore is best-effort (logged on failure, don't block status change).
 */
export async function cancelarReparacion(repairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()
    if (!tallerId) return { success: false, error: "Sin sesión activa." }

    // 1. Fetch current repair — validate ownership and guard terminal states
    const { data: repair, error: repairErr } = await supabase
      .from("reparaciones")
      .select("id, estatus, folio")
      .eq("id", repairId)
      .eq("taller_id", tallerId)
      .single()

    if (repairErr || !repair) {
      return { success: false, error: "Reparación no encontrada." }
    }

    const TERMINAL = ["Cancelado", "Sin Reparacion", "Entregado"]
    if (TERMINAL.includes(repair.estatus)) {
      return { success: false, error: `No se puede cancelar una reparación en estado "${repair.estatus}".` }
    }

    // 2. Mirror payment movements as devolucion_cancelacion
    const { movements } = await getCancelacionSummary(repairId)

    if (movements.length > 0) {
      const reversals = movements.map((m) => ({
        taller_id: tallerId,
        tipo: "devolucion_cancelacion" as const,
        monto: -Math.abs(Number(m.monto)),
        metodo_pago: m.metodo_pago,
        referencia_id: repairId,
        caja_id: m.caja_id ?? null,
        descripcion: `Devolución por cancelación de reparación #${repair.folio}`,
      }))

      const { error: reversalErr } = await supabase.from("movimientos_caja").insert(reversals)
      if (reversalErr) {
        console.error("[cancelarReparacion] reversals insert:", reversalErr)
        // Non-fatal: log and continue — status change is the source of truth
      }
    }

    // 3. Restore stock for refaccion gastos with a linked product
    const { data: gastosData } = await supabase
      .from("reparacion_gastos")
      .select("producto_id")
      .eq("reparacion_id", repairId)
      .eq("taller_id", tallerId)
      .eq("tipo", "refaccion")
      .not("producto_id", "is", null)

    const gastosConProducto = (gastosData ?? []).filter((g) => g.producto_id)

    if (gastosConProducto.length > 0) {
      const stockItems = gastosConProducto.map((g) => ({
        producto_id: g.producto_id as string,
        taller_id: tallerId,
        cantidad: 1,
      }))

      const { error: stockErr } = await supabase.rpc("batch_increment_stock", { items: stockItems })
      if (stockErr) {
        console.error("[cancelarReparacion] stock restore error:", stockErr)
        // Non-fatal: log and continue
      }
    }

    // 4. Change status to "Cancelado" with full audit trail
    const result = await applyRepairStatusChange({
      repairId,
      estadoAnterior: repair.estatus,
      estadoNuevo: "Cancelado",
      notaTecnica: "Reparación cancelada con devolución automática.",
    })

    return result
  } catch (e) {
    console.error("[cancelarReparacion] fatal:", e)
    return { success: false, error: "Error inesperado al cancelar la reparación." }
  }
}
