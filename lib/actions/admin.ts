"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { calcDiasRestantes } from "@/lib/utils/subscription"
import { cookies } from "next/headers"

const createClient = async () => createAdminClient()

/** Verifies that the caller is a logged-in admin. Throws if not. */
async function requireAdmin(): Promise<void> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value
  const isAdmin = cookieStore.get("isAdmin")?.value === "true"

  if (!tallerId || !isAdmin) {
    throw new Error("ADMIN_UNAUTHORIZED")
  }

  // Double-check against DB
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("taller_users")
    .select("es_admin")
    .eq("id", tallerId)
    .single()

  if (error || !data?.es_admin) {
    throw new Error("ADMIN_UNAUTHORIZED")
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlanTipo = "prueba" | "activo" | "suspendido"

export interface TallerForAdmin {
  id: string
  nombre_taller: string
  nombre_propietario: string
  email: string
  plan_activo: boolean
  plan_tipo: PlanTipo
  fecha_vencimiento_plan: string | null
  dias_restantes: number | null   // null = sin fecha de vencimiento
  es_admin: boolean
  email_verified: boolean
}

export interface AdminStats {
  total: number
  prueba: number
  activo: number
  suspendido: number
  porVencer: number   // prueba o activo con < 3 días
  vencidos: number    // prueba con fecha pasada
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24

function mapTaller(t: Record<string, unknown>): TallerForAdmin {
  const plan = (t.plan_tipo as string | null) ?? "prueba"
  return {
    id: t.id as string,
    nombre_taller: t.nombre_taller as string,
    nombre_propietario: t.nombre_propietario as string,
    email: t.email as string,
    plan_activo: Boolean(t.plan_activo ?? t.is_pro),
    plan_tipo: (["prueba", "activo", "suspendido"].includes(plan) ? plan : "prueba") as PlanTipo,
    fecha_vencimiento_plan: (t.fecha_vencimiento_plan as string | null) ?? null,
    dias_restantes: calcDiasRestantes(t.fecha_vencimiento_plan as string | null),
    es_admin: Boolean(t.es_admin),
    email_verified: Boolean(t.email_verified),
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function actualizarPlanActivo(
  tallerId: string,
  planActivo: boolean
): Promise<{ success: boolean; error: string | null }> {
  await requireAdmin()
  const id = (tallerId ?? "").trim()
  if (!id || !UUID_RE.test(id)) {
    console.error("[actualizarPlanActivo] tallerId inválido o vacío:", tallerId)
    return { success: false, error: "Identificador de taller no válido." }
  }

  const supabase = await createClient()

  // Sincronizar plan_tipo con plan_activo para evitar desfase entre el toggle PRO
  // y el banner del dashboard (que lee plan_tipo).
  const payload: Record<string, unknown> = {
    plan_activo: planActivo,
    is_pro: planActivo,
    plan_tipo: planActivo ? "activo" : "prueba",
  }

  const { data, error } = await supabase
    .from("taller_users")
    .update(payload)
    .eq("id", id)
    .select("id")

  if (error) {
    console.error("[actualizarPlanActivo] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      tallerId: id,
      payload,
    })
    return {
      success: false,
      error: error.message || "No se pudo actualizar el modo Pro",
    }
  }

  if (!data?.length) {
    console.error("[actualizarPlanActivo] Ninguna fila actualizada (id no encontrado):", id)
    return {
      success: false,
      error: "No se encontró el taller o no hubo cambios.",
    }
  }

  return { success: true, error: null }
}

// ─── getAdminStats ────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<{ stats: AdminStats | null; error: string | null }> {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("taller_users")
    .select("plan_tipo, fecha_vencimiento_plan")
    .eq("es_admin", false)

  if (error) {
    console.error("Error fetching admin stats:", error)
    return { stats: null, error: "Error al cargar estadísticas" }
  }

  const rows = (data ?? []) as Array<{ plan_tipo: string; fecha_vencimiento_plan: string | null }>
  const now = Date.now()

  const stats: AdminStats = {
    total: rows.length,
    prueba: rows.filter((t) => t.plan_tipo === "prueba").length,
    activo: rows.filter((t) => t.plan_tipo === "activo").length,
    suspendido: rows.filter((t) => t.plan_tipo === "suspendido").length,
    porVencer: rows.filter((t) => {
      if (t.plan_tipo === "suspendido" || !t.fecha_vencimiento_plan) return false
      const dias = calcDiasRestantes(t.fecha_vencimiento_plan)
      return dias !== null && dias >= 0 && dias < 3
    }).length,
    vencidos: rows.filter((t) => {
      if (t.plan_tipo !== "prueba" || !t.fecha_vencimiento_plan) return false
      const dias = calcDiasRestantes(t.fecha_vencimiento_plan)
      return dias !== null && dias <= 0
    }).length,
  }

  return { stats, error: null }
}

// ─── getAllTalleres ────────────────────────────────────────────────────────────

type Filtro = "todos" | "prueba" | "activo" | "suspendido" | "por_vencer"

export async function getAllTalleres(
  filtro: Filtro = "todos"
): Promise<{ talleres: TallerForAdmin[]; error: string | null }> {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("taller_users")
    .select("*")
    .eq("es_admin", false)
    .order("nombre_taller", { ascending: true })

  if (error) {
    console.error("Error fetching talleres:", error)
    return { talleres: [], error: "Error al cargar talleres" }
  }

  let talleres = (data ?? []).map(mapTaller)

  if (filtro === "prueba") {
    talleres = talleres.filter((t) => t.plan_tipo === "prueba")
  } else if (filtro === "activo") {
    talleres = talleres.filter((t) => t.plan_tipo === "activo")
  } else if (filtro === "suspendido") {
    talleres = talleres.filter((t) => t.plan_tipo === "suspendido")
  } else if (filtro === "por_vencer") {
    talleres = talleres.filter((t) => {
      if (t.plan_tipo === "suspendido" || !t.fecha_vencimiento_plan) return false
      const dias = calcDiasRestantes(t.fecha_vencimiento_plan)
      return dias !== null && dias >= 0 && dias < 3
    })
  }

  // Sort: por_vencer first, then by dias_restantes
  talleres.sort((a, b) => {
    const da = a.dias_restantes ?? 9999
    const db = b.dias_restantes ?? 9999
    return da - db
  })

  return { talleres, error: null }
}

// ─── searchTalleres ───────────────────────────────────────────────────────────

export async function searchTalleres(
  query: string
): Promise<{ talleres: TallerForAdmin[]; error: string | null }> {
  await requireAdmin()
  if (!query.trim()) return getAllTalleres()

  const supabase = await createClient()
  const q = query.toLowerCase().trim()

  const { data, error } = await supabase
    .from("taller_users")
    .select("*")
    .eq("es_admin", false)
    .or(`nombre_taller.ilike.%${q}%,nombre_propietario.ilike.%${q}%,email.ilike.%${q}%`)

  if (error) {
    console.error("Error searching talleres:", error)
    return { talleres: [], error: "Error en búsqueda" }
  }

  return { talleres: (data ?? []).map(mapTaller), error: null }
}

// ─── extendSuscripcion ────────────────────────────────────────────────────────

/**
 * Extiende la fecha de acceso en N días.
 * Si el taller está suspendido, lo reactiva automáticamente.
 */
export async function extendSuscripcion(
  tallerId: string,
  dias: number
): Promise<{ success: boolean; nuevaFecha: string | null; error: string | null }> {
  await requireAdmin()
  if (dias <= 0) return { success: false, nuevaFecha: null, error: "Los días deben ser mayores a 0" }

  const supabase = await createClient()

  const { data: taller, error: fetchError } = await supabase
    .from("taller_users")
    .select("fecha_vencimiento_plan, plan_tipo")
    .eq("id", tallerId)
    .single()

  if (fetchError || !taller) {
    return { success: false, nuevaFecha: null, error: "Taller no encontrado" }
  }

  // Base: if current expiry is in the future, extend from there; otherwise start from today
  const baseDate =
    taller.fecha_vencimiento_plan && new Date(taller.fecha_vencimiento_plan) > new Date()
      ? new Date(taller.fecha_vencimiento_plan)
      : new Date()

  const nuevaFecha = new Date(baseDate)
  nuevaFecha.setDate(nuevaFecha.getDate() + dias)

  const updates: Record<string, unknown> = {
    fecha_vencimiento_plan: nuevaFecha.toISOString(),
  }

  // Al extender acceso el taller adquiere una suscripción activa pagada.
  // Si estaba suspendido o en prueba, lo promovemos a "activo".
  if (taller.plan_tipo === "suspendido" || taller.plan_tipo === "prueba") {
    updates.plan_tipo = "activo"
    updates.plan_activo = true
    updates.is_pro = true
  }

  const { error: updateError } = await supabase
    .from("taller_users")
    .update(updates)
    .eq("id", tallerId)

  if (updateError) {
    console.error("Error extending subscription:", updateError)
    return { success: false, nuevaFecha: null, error: "Error al extender acceso" }
  }

  return { success: true, nuevaFecha: nuevaFecha.toISOString(), error: null }
}

// ─── cambiarEstatus ───────────────────────────────────────────────────────────

/**
 * Activa o suspende el acceso de un taller.
 * Activar sin fecha vigente establece +30 días por defecto.
 */
export async function cambiarEstatus(
  tallerId: string,
  nuevoEstatus: "activo" | "suspendido"
): Promise<{ success: boolean; error: string | null }> {
  await requireAdmin()
  const supabase = await createClient()

  const updates: Record<string, unknown> = { plan_tipo: nuevoEstatus }

  if (nuevoEstatus === "activo") {
    // If no valid expiry date, default to 30 days from today
    const { data: taller } = await supabase
      .from("taller_users")
      .select("fecha_vencimiento_plan")
      .eq("id", tallerId)
      .single()

    const existingExpiry = taller?.fecha_vencimiento_plan
      ? new Date(taller.fecha_vencimiento_plan)
      : null

    if (!existingExpiry || existingExpiry < new Date()) {
      const nuevaFecha = new Date()
      nuevaFecha.setDate(nuevaFecha.getDate() + 30)
      updates.fecha_vencimiento_plan = nuevaFecha.toISOString()
    }
  }

  const { error } = await supabase
    .from("taller_users")
    .update(updates)
    .eq("id", tallerId)

  if (error) {
    console.error("Error changing status:", error)
    return { success: false, error: "Error al cambiar estatus" }
  }

  return { success: true, error: null }
}

// ─── resetPasswordAdmin ───────────────────────────────────────────────────────

export async function resetPasswordAdmin(
  tallerId: string
): Promise<{ success: boolean; resetToken?: string; error: string | null }> {
  await requireAdmin()
  const { randomBytes } = await import("crypto")
  const supabase = await createClient()

  const resetToken = randomBytes(32).toString("hex")
  const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000)

  const { error } = await supabase
    .from("taller_users")
    .update({
      reset_token: resetToken,
      reset_expires_at: tokenExpiry.toISOString(),
    })
    .eq("id", tallerId)

  if (error) {
    console.error("Error resetting password:", error)
    return { success: false, error: "Error al resetear contraseña" }
  }

  return { success: true, resetToken, error: null }
}

// ─── deleteTallerAccount ──────────────────────────────────────────────────────

export async function deleteTallerAccount(
  tallerId: string
): Promise<{ success: boolean; error: string | null }> {
  await requireAdmin()
  const supabase = await createClient()

  // Cascade delete tenant data first
  await Promise.allSettled([
    supabase.from("cambios_reparaciones").delete().eq("taller_id", tallerId),
    supabase.from("reparaciones").delete().eq("taller_id", tallerId),
    supabase.from("clientes").delete().eq("taller_id", tallerId),
    supabase.from("tecnicos").delete().eq("taller_id", tallerId),
    supabase.from("configuracion_taller").delete().eq("taller_id", tallerId),
    supabase.from("ajustes_taller").delete().eq("taller_id", tallerId),
    supabase.from("productos").delete().eq("taller_id", tallerId),
    supabase.from("ventas").delete().eq("taller_id", tallerId),
    supabase.from("caja").delete().eq("taller_id", tallerId),
  ])

  const { error } = await supabase.from("taller_users").delete().eq("id", tallerId)

  if (error) {
    console.error("Error deleting taller:", error)
    return { success: false, error: "Error al eliminar cuenta" }
  }

  return { success: true, error: null }
}
