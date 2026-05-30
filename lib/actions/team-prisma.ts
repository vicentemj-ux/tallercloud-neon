import bcrypt from "bcryptjs"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"

// ── Catálogo de Roles de Equipo (constantes, no tabla) ───────────────────────

/**
 * Roles predefinidos del equipo. Reemplaza la tabla `roles_taller` de Supabase.
 * Se mantienen como constantes en código para evitar queries innecesarias en serverless.
 */
export const TEAM_ROLES: Array<{
  id: string
  nombre: string
  slug: string
  categoria: "estandar" | "especial"
  teamRole: "ADMINISTRADOR" | "TECNICO" | "RECEPCIONISTA" | "REPARADOR"
}> = [
  {
    id: "administrador",
    nombre: "Administrador",
    slug: "administrador",
    categoria: "estandar",
    teamRole: "ADMINISTRADOR",
  },
  {
    id: "tecnico_estandar",
    nombre: "Tecnico Estandar",
    slug: "tecnico_estandar",
    categoria: "estandar",
    teamRole: "TECNICO",
  },
  {
    id: "vendedor_recepcion",
    nombre: "Vendedor / Recepcion",
    slug: "vendedor_recepcion",
    categoria: "estandar",
    teamRole: "RECEPCIONISTA",
  },
  {
    id: "reparador",
    nombre: "Reparador",
    slug: "reparador",
    categoria: "especial",
    teamRole: "REPARADOR",
  },
]

const MVP_LIMIT = 5
const MVP_LIMIT_MSG = `Has alcanzado el limite de ${MVP_LIMIT} usuarios para la fase MVP. Contacta a soporte para mas detalles.`

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface EquipoMiembroRow {
  id: string
  nombre: string
  email: string
  activo: boolean
  rolId: string
  rolNombre: string
}

export interface EquipoOwnerRow {
  nombre: string
  email: string
  nombreTaller: string
}

export interface RolOption {
  id: string
  nombre: string
  slug?: string
  categoria?: "estandar" | "especial"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTenantIdOrThrow() {
  const tenantId = await getCurrentTallerId()
  if (!tenantId) throw new Error("Sesion invalida")
  return tenantId
}

function findRoleById(rolId: string) {
  return TEAM_ROLES.find((r) => r.id === rolId) ?? null
}

function findRoleByTeamRole(teamRole: string) {
  return TEAM_ROLES.find((r) => r.teamRole === teamRole) ?? null
}

// ─── Server Actions ──────────────────────────────────────────────────────────

/**
 * Obtiene el owner del taller + miembros activos/inactivos + catalogo de roles.
 * Todo en una sola query eficiente con include.
 */
export async function getEquipoPageData(): Promise<{
  owner: EquipoOwnerRow | null
  miembros: EquipoMiembroRow[]
  roles: RolOption[]
  error: string | null
}> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    console.log("[getEquipoPageData] tenantId:", tenantId)

    // Query única: owner + miembros en paralelo via include
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          orderBy: { createdAt: "asc" },
        },
        configuracion: {
          select: { nombreComercial: true },
        },
      },
    })
    console.log("[getEquipoPageData] tenant found:", !!tenant, "users count:", tenant?.users?.length ?? 0)

    if (!tenant) {
      return { owner: null, miembros: [], roles: [], error: "No se pudo cargar el taller." }
    }

    // Owner = primer usuario con role=OWNER (el que se crea en el registro)
    const ownerUser = tenant.users.find((u) => u.role === "OWNER")
    const owner: EquipoOwnerRow | null = ownerUser
      ? {
          nombre: ownerUser.nombre || ownerUser.email,
          email: ownerUser.email,
          nombreTaller: tenant.configuracion?.nombreComercial?.trim() || tenant.nombre,
        }
      : null

    // Miembros = todos los usuarios excepto el owner
    const miembros: EquipoMiembroRow[] = tenant.users
      .filter((u) => u.role !== "OWNER")
      .map((u) => {
        const roleInfo = findRoleByTeamRole(u.teamRole ?? "TECNICO")
        return {
          id: u.id,
          nombre: u.nombre,
          email: u.email,
          activo: u.activo,
          rolId: roleInfo?.id ?? "tecnico_estandar",
          rolNombre: roleInfo?.nombre ?? "Tecnico",
        }
      })

    // Roles = catalogo constante
    const roles: RolOption[] = TEAM_ROLES.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      slug: r.slug,
      categoria: r.categoria,
    }))

    return { owner, miembros, roles, error: null }
  } catch (error) {
    // Don't catch Next.js redirect errors
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error
    }
    console.error("[getEquipoPageData] fatal:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      owner: null,
      miembros: [],
      roles: [],
      error: `Error: ${errorMessage}`,
    }
  }
}

/**
 * Crea un nuevo miembro del equipo.
 * Valida límite MVP (5 activos), email único, y rol válido.
 */
export async function createMiembro(input: {
  nombre: string
  email: string
  password: string
  rolId: string
}): Promise<{ success: boolean; error?: string }> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const nombre = (input.nombre || "").trim()
    const email = (input.email || "").trim().toLowerCase()
    const password = input.password || ""
    const rolId = (input.rolId || "").trim()

    // Validaciones
    if (!nombre) return { success: false, error: "El nombre es obligatorio." }
    if (!email) return { success: false, error: "El email es obligatorio." }
    if (!password || password.length < 6) {
      return { success: false, error: "La contrasena debe tener al menos 6 caracteres." }
    }
    if (!rolId) return { success: false, error: "Debes seleccionar un puesto/rol." }

    // Validar rol
    const roleInfo = findRoleById(rolId)
    if (!roleInfo) {
      return { success: false, error: "El rol seleccionado no es valido." }
    }

    // Verificar límite MVP
    const activeCount = await prisma.user.count({
      where: { tenantId, activo: true, role: { not: "OWNER" } },
    })
    if (activeCount >= MVP_LIMIT) {
      return { success: false, error: MVP_LIMIT_MSG }
    }

    // Verificar email único en el tenant
    const existing = await prisma.user.findFirst({
      where: { tenantId, email },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: "Ese correo ya esta registrado en este taller." }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Crear usuario
    await prisma.user.create({
      data: {
        tenantId,
        email,
        nombre,
        passwordHash,
        role: "STAFF",
        teamRole: roleInfo.teamRole as "ADMINISTRADOR" | "TECNICO" | "RECEPCIONISTA" | "REPARADOR",
        activo: true,
        emailVerified: true,
      },
    })

    return { success: true }
  } catch (error) {
    console.error("[createMiembro] fatal:", error)
    const prismaCode = (error as { code?: string }).code
    if (prismaCode === "P2002") {
      return { success: false, error: "Ese correo ya esta registrado." }
    }
    return {
      success: false,
      error: "No se pudo crear el miembro. Verifica configuracion del servidor y vuelve a intentar.",
    }
  }
}

/**
 * Actualiza nombre, rol y opcionalmente contrasena de un miembro.
 */
export async function updateMiembro(input: {
  miembroId: string
  nombre: string
  rolId: string
  password?: string
}): Promise<{ success: boolean; error?: string }> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const miembroId = (input.miembroId || "").trim()
    const nombre = (input.nombre || "").trim()
    const rolId = (input.rolId || "").trim()
    const password = (input.password || "").trim()

    if (!miembroId) return { success: false, error: "Miembro invalido." }
    if (!nombre) return { success: false, error: "El nombre es obligatorio." }
    if (!rolId) return { success: false, error: "Debes seleccionar un puesto/rol." }
    if (password && password.length < 6) {
      return { success: false, error: "La contrasena debe tener al menos 6 caracteres." }
    }

    // Validar rol
    const roleInfo = findRoleById(rolId)
    if (!roleInfo) {
      return { success: false, error: "El rol seleccionado no es valido." }
    }

    // Verificar que el miembro existe y pertenece al tenant
    const member = await prisma.user.findFirst({
      where: { id: miembroId, tenantId, role: { not: "OWNER" } },
      select: { id: true, role: true },
    })
    if (!member) {
      return { success: false, error: "No se encontro el miembro para editar." }
    }

    // Preparar datos de actualización
    const updateData: {
      nombre: string
      teamRole: "ADMINISTRADOR" | "TECNICO" | "RECEPCIONISTA" | "REPARADOR"
      passwordHash?: string
    } = {
      nombre,
      teamRole: roleInfo.teamRole as "ADMINISTRADOR" | "TECNICO" | "RECEPCIONISTA" | "REPARADOR",
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12)
    }

    await prisma.user.update({
      where: { id: miembroId },
      data: updateData,
    })

    return { success: true }
  } catch (error) {
    console.error("[updateMiembro] fatal:", error)
    return {
      success: false,
      error: "No se pudo actualizar el miembro. Verifica configuracion del servidor y vuelve a intentar.",
    }
  }
}

/**
 * Elimina un miembro del equipo (soft delete via activo=false).
 * No elimina el registro para mantener integridad referencial con reparaciones asignadas.
 */
export async function deleteMiembro(miembroId: string): Promise<{ success: boolean; error?: string }> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const id = (miembroId || "").trim()
    if (!id) return { success: false, error: "Miembro invalido." }

    // Verificar que el miembro existe y pertenece al tenant
    const member = await prisma.user.findFirst({
      where: { id, tenantId, role: { not: "OWNER" } },
      select: { id: true, role: true },
    })
    if (!member) {
      return { success: false, error: "No se encontro el miembro para eliminar." }
    }

    // Soft delete: marcar como inactivo en lugar de eliminar
    // Esto preserva el historial de reparaciones asignadas
    await prisma.user.update({
      where: { id },
      data: { activo: false },
    })

    return { success: true }
  } catch (error) {
    console.error("[deleteMiembro] fatal:", error)
    return {
      success: false,
      error: "No se pudo eliminar el miembro. Verifica configuracion del servidor y vuelve a intentar.",
    }
  }
}

/**
 * Suspender o reactivar un miembro (toggle activo).
 */
export async function toggleMiembroActivo(miembroId: string): Promise<{ success: boolean; activo?: boolean; error?: string }> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const id = (miembroId || "").trim()
    if (!id) return { success: false, error: "Miembro invalido." }

    const member = await prisma.user.findFirst({
      where: { id, tenantId, role: { not: "OWNER" } },
      select: { id: true, activo: true },
    })
    if (!member) {
      return { success: false, error: "No se encontro el miembro." }
    }

    const nuevoEstado = !member.activo

    // Si se reactiva, verificar límite MVP
    if (nuevoEstado) {
      const activeCount = await prisma.user.count({
        where: { tenantId, activo: true, role: { not: "OWNER" } },
      })
      if (activeCount >= MVP_LIMIT) {
        return { success: false, error: MVP_LIMIT_MSG }
      }
    }

    await prisma.user.update({
      where: { id },
      data: { activo: nuevoEstado },
    })

    return { success: true, activo: nuevoEstado }
  } catch (error) {
    console.error("[toggleMiembroActivo] fatal:", error)
    return {
      success: false,
      error: "No se pudo cambiar el estado del miembro.",
    }
  }
}

/**
 * Obtiene el listado de técnicos activos para asignación en reparaciones.
 * Incluye owner + miembros activos.
 */
export async function getAssignableStaff(): Promise<{
  staff: Array<{ id: string; nombre: string; role: string }>
  error: string | null
}> {
  "use server"
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const users = await prisma.user.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, role: true },
      orderBy: { nombre: "asc" },
    })

    // Owner siempre primero
    const owner = users.find((u) => u.role === "OWNER")
    const staff = users.filter((u) => u.role !== "OWNER")

    const result = owner ? [owner, ...staff] : staff

    return {
      staff: result.map((u) => ({
        id: u.id,
        nombre: u.nombre || "Sin nombre",
        role: u.role,
      })),
      error: null,
    }
  } catch (error) {
    console.error("[getAssignableStaff] fatal:", error)
    return { staff: [], error: "No se pudieron cargar tecnicos." }
  }
}
