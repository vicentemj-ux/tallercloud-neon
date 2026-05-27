"use server"

import { getPrismaClient } from "@/lib/prisma"
import { calcDiasRestantes } from "@/lib/utils/subscription"
import { cookies } from "next/headers"
import { randomBytes } from "crypto"

/** Verifies that the caller is a logged-in admin. Throws if not. */
async function requireAdmin(): Promise<void> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value
  const isAdmin = cookieStore.get("isAdmin")?.value === "true"

  if (!tallerId || !isAdmin) {
    throw new Error("ADMIN_UNAUTHORIZED")
  }

  try {
    const prisma = getPrismaClient()
    const rows = await prisma.$queryRawUnsafe<Array<{ es_admin: boolean }>>(
      "SELECT es_admin FROM taller_users WHERE id = $1 LIMIT 1",
      tallerId,
    )
    if (!rows[0]?.es_admin) {
      throw new Error("ADMIN_UNAUTHORIZED")
    }
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_UNAUTHORIZED") throw error

    // ── Legacy Supabase fallback ──────────────────────────────────────────────
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const supabase = await createAdminClient()
      const { data, error } = await supabase
        .from("taller_users")
        .select("es_admin")
        .eq("id", tallerId)
        .single()
      if (error || !data?.es_admin) {
        throw new Error("ADMIN_UNAUTHORIZED")
      }
    } catch {
      throw new Error("ADMIN_UNAUTHORIZED")
    }
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
  if (!id || id.length < 8) {
    return { success: false, error: "Identificador de taller no valido." }
  }

  try {
    const prisma = getPrismaClient()
    const planTipo = planActivo ? "activo" : "prueba"
    await prisma.$executeRawUnsafe(
      `UPDATE taller_users SET plan_activo = $1, is_pro = $2, plan_tipo = $3 WHERE id = $4`,
      planActivo, planActivo, planTipo, id,
    )
    return { success: true, error: null }
  } catch (error) {
    console.error("[actualizarPlanActivo] Prisma error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo actualizar el modo Pro",
    }
  }
}

// ─── getAdminStats ────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<{ stats: AdminStats | null; error: string | null }> {
  await requireAdmin()
  try {
    const prisma = getPrismaClient()
    const rows = await prisma.$queryRawUnsafe<Array<{ plan_tipo: string; fecha_vencimiento_plan: string | null }>>(
      "SELECT plan_tipo, fecha_vencimiento_plan FROM taller_users WHERE es_admin = false",
    )
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
  } catch (error) {
    console.error("Error fetching admin stats:", error)
    return { stats: null, error: "Error al cargar estadisticas" }
  }
}

// ─── getAllTalleres ────────────────────────────────────────────────────────────

type Filtro = "todos" | "prueba" | "activo" | "suspendido" | "por_vencer"

export async function getAllTalleres(
  filtro: Filtro = "todos"
): Promise<{ talleres: TallerForAdmin[]; error: string | null }> {
  await requireAdmin()
  try {
    const prisma = getPrismaClient()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM taller_users WHERE es_admin = false ORDER BY nombre_taller ASC",
    )

    let talleres = rows.map(mapTaller)

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

    talleres.sort((a, b) => {
      const da = a.dias_restantes ?? 9999
      const db = b.dias_restantes ?? 9999
      return da - db
    })

    return { talleres, error: null }
  } catch (error) {
    console.error("Error fetching talleres:", error)
    return { talleres: [], error: "Error al cargar talleres" }
  }
}

// ─── searchTalleres ───────────────────────────────────────────────────────────

export async function searchTalleres(
  query: string
): Promise<{ talleres: TallerForAdmin[]; error: string | null }> {
  await requireAdmin()
  if (!query.trim()) return getAllTalleres()

  try {
    const prisma = getPrismaClient()
    const q = query.toLowerCase().trim()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM taller_users WHERE es_admin = false AND (
        LOWER(nombre_taller) LIKE $1 OR LOWER(nombre_propietario) LIKE $2 OR LOWER(email) LIKE $3
      ) ORDER BY nombre_taller ASC`,
      `%${q}%`, `%${q}%`, `%${q}%`,
    )
    return { talleres: rows.map(mapTaller), error: null }
  } catch (error) {
    console.error("Error searching talleres:", error)
    return { talleres: [], error: "Error en busqueda" }
  }
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
  if (dias <= 0) return { success: false, nuevaFecha: null, error: "Los dias deben ser mayores a 0" }

  try {
    const prisma = getPrismaClient()
    const rows = await prisma.$queryRawUnsafe<Array<{ fecha_vencimiento_plan: string | null; plan_tipo: string }>>(
      "SELECT fecha_vencimiento_plan, plan_tipo FROM taller_users WHERE id = $1 LIMIT 1",
      tallerId,
    )
    const taller = rows[0]
    if (!taller) return { success: false, nuevaFecha: null, error: "Taller no encontrado" }

    const baseDate =
      taller.fecha_vencimiento_plan && new Date(taller.fecha_vencimiento_plan) > new Date()
        ? new Date(taller.fecha_vencimiento_plan)
        : new Date()

    const nuevaFecha = new Date(baseDate)
    nuevaFecha.setDate(nuevaFecha.getDate() + dias)

    if (taller.plan_tipo === "suspendido" || taller.plan_tipo === "prueba") {
      await prisma.$executeRawUnsafe(
        "UPDATE taller_users SET fecha_vencimiento_plan = $1, plan_tipo = 'activo', plan_activo = true, is_pro = true WHERE id = $2",
        nuevaFecha.toISOString(), tallerId,
      )
    } else {
      await prisma.$executeRawUnsafe(
        "UPDATE taller_users SET fecha_vencimiento_plan = $1 WHERE id = $2",
        nuevaFecha.toISOString(), tallerId,
      )
    }

    return { success: true, nuevaFecha: nuevaFecha.toISOString(), error: null }
  } catch (error) {
    console.error("Error extending subscription:", error)
    return { success: false, nuevaFecha: null, error: "Error al extender acceso" }
  }
}

// ─── cambiarEstatus ───────────────────────────────────────────────────────────

/**
 * Activa o suspende el acceso de un taller.
 * Activar sin fecha vigente establece +30 dias por defecto.
 */
export async function cambiarEstatus(
  tallerId: string,
  nuevoEstatus: "activo" | "suspendido"
): Promise<{ success: boolean; error: string | null }> {
  await requireAdmin()
  try {
    const prisma = getPrismaClient()

    if (nuevoEstatus === "activo") {
      const rows = await prisma.$queryRawUnsafe<Array<{ fecha_vencimiento_plan: string | null }>>(
        "SELECT fecha_vencimiento_plan FROM taller_users WHERE id = $1 LIMIT 1",
        tallerId,
      )
      const existingExpiry = rows[0]?.fecha_vencimiento_plan ? new Date(rows[0].fecha_vencimiento_plan) : null
      if (!existingExpiry || existingExpiry < new Date()) {
        const nuevaFecha = new Date()
        nuevaFecha.setDate(nuevaFecha.getDate() + 30)
        await prisma.$executeRawUnsafe(
          "UPDATE taller_users SET plan_tipo = $1, fecha_vencimiento_plan = $2 WHERE id = $3",
          nuevoEstatus, nuevaFecha.toISOString(), tallerId,
        )
        return { success: true, error: null }
      }
    }

    await prisma.$executeRawUnsafe(
      "UPDATE taller_users SET plan_tipo = $1 WHERE id = $2",
      nuevoEstatus, tallerId,
    )
    return { success: true, error: null }
  } catch (error) {
    console.error("Error changing status:", error)
    return { success: false, error: "Error al cambiar estatus" }
  }
}

// ─── resetPasswordAdmin ───────────────────────────────────────────────────────

export async function resetPasswordAdmin(
  tallerId: string
): Promise<{ success: boolean; resetToken?: string; error: string | null }> {
  await requireAdmin()
  try {
    const prisma = getPrismaClient()
    const resetToken = randomBytes(32).toString("hex")
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.$executeRawUnsafe(
      "UPDATE taller_users SET reset_token = $1, reset_expires_at = $2 WHERE id = $3",
      resetToken, tokenExpiry.toISOString(), tallerId,
    )
    return { success: true, resetToken, error: null }
  } catch (error) {
    console.error("Error resetting password:", error)
    return { success: false, error: "Error al resetear contrasena" }
  }
}

// ─── deleteTallerAccount ──────────────────────────────────────────────────────

export async function deleteTallerAccount(
  tallerId: string
): Promise<{ success: boolean; error: string | null }> {
  await requireAdmin()
  try {
    const prisma = getPrismaClient()

    const tables = [
      "cambios_reparaciones", "reparaciones", "clientes", "tecnicos",
      "configuracion_taller", "ajustes_taller", "productos", "ventas", "caja",
    ]
    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM ${table} WHERE taller_id = $1`, tallerId)
      } catch { /* tabla puede no existir */ }
    }

    await prisma.$executeRawUnsafe("DELETE FROM taller_users WHERE id = $1", tallerId)
    return { success: true, error: null }
  } catch (error) {
    console.error("Error deleting taller:", error)
    return { success: false, error: "Error al eliminar cuenta" }
  }
}
