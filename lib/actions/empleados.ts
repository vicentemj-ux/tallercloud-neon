"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { issueMemberVerificationPin } from "@/lib/actions/email-verification"

const createClient = async () => (await createCurrentTenantClient()).supabase

const MVP_LIMIT_MSG =
  "Has alcanzado el limite de 5 usuarios para la fase MVP. Contacta a soporte para mas detalles."

export interface CreateMiembroInput {
  nombre: string
  email: string
  password: string
  rolId: string
}

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

/**
 * Propietario + miembros + catalogo de roles para la pantalla Mi Equipo.
 * PERF: las 3 queries (taller_users, miembros_taller, roles_taller) corren en paralelo.
 */
export async function getEquipoPageData(): Promise<{
  owner: EquipoOwnerRow | null
  miembros: EquipoMiembroRow[]
  roles: Array<{ id: string; nombre: string; slug?: string; categoria?: "estandar" | "especial" }>
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const tallerId = await getCurrentTallerId()

  // PERF: 3 queries secuenciales → 3 en paralelo
  const [ownerResult, membersResult, rolesResult] = await Promise.all([
    admin
      .from("taller_users")
      .select("nombre_propietario, email, nombre_taller")
      .eq("id", tallerId)
      .single(),
    supabase
      .from("miembros_taller")
      .select("id, nombre, email, activo, rol_id")
      .eq("taller_id", tallerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("roles_taller")
      .select("id, nombre, slug, categoria, orden")
      .order("orden", { ascending: true }),
  ])

  if (ownerResult.error || !ownerResult.data) {
    return { owner: null, miembros: [], roles: [], error: "No se pudo cargar el taller." }
  }

  const o = ownerResult.data as {
    nombre_propietario?: string | null
    email?: string | null
    nombre_taller?: string | null
  }

  const owner: EquipoOwnerRow = {
    nombre: o.nombre_propietario?.trim() || o.email?.trim() || "Propietario",
    email: o.email?.trim() || "",
    nombreTaller: o.nombre_taller?.trim() || "",
  }

  if (membersResult.error) {
    console.error("getEquipoPageData miembros_taller:", membersResult.error)
    return {
      owner,
      miembros: [],
      roles: [],
      error: "No se pudo cargar el equipo. Asegurate de aplicar las migraciones recientes.",
    }
  }

  const rolMap = new Map<string, string>()
  for (const r of rolesResult.data ?? []) {
    rolMap.set(r.id as string, r.nombre as string)
  }

  const miembros: EquipoMiembroRow[] = (membersResult.data ?? []).map((m) => ({
    id: m.id as string,
    nombre: m.nombre as string,
    email: m.email as string,
    activo: Boolean(m.activo),
    rolId: m.rol_id as string,
    rolNombre: rolMap.get(m.rol_id as string) ?? "—",
  }))

  const roles = (rolesResult.data ?? []).map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    slug: r.slug as string | undefined,
    categoria: r.categoria as "estandar" | "especial" | undefined,
  }))

    return { owner, miembros, roles, error: null }
  } catch (error) {
    console.error("[getEquipoPageData] fatal:", error)
    return {
      owner: null,
      miembros: [],
      roles: [],
      error: "Mi Equipo no estÃ¡ disponible temporalmente. Verifica la configuraciÃ³n del servidor.",
    }
  }
}

/**
 * Crea usuario en Supabase Auth e inserta en miembros_taller (max. 5 activos MVP).
 */
export async function createMiembro(
  input: CreateMiembroInput
): Promise<{ success: boolean; error?: string }> {
  try {
  const nombre = (input.nombre || "").trim()
  const email = (input.email || "").trim().toLowerCase()
  const password = input.password || ""
  const rolId = (input.rolId || "").trim()

  if (!nombre) return { success: false, error: "El nombre es obligatorio." }
  if (!email) return { success: false, error: "El email es obligatorio." }
  if (!password || password.length < 6) {
    return { success: false, error: "La contrasena debe tener al menos 6 caracteres." }
  }
  if (!rolId) return { success: false, error: "Debes seleccionar un puesto/rol." }

  const tallerId = await getCurrentTallerId()

  const adminClient = await createAdminClient()
  const { data: owner, error: ownerError } = await adminClient
    .from("taller_users")
    .select("id, email_verified")
    .eq("id", tallerId)
    .single()

  if (ownerError || !owner) {
    return { success: false, error: "Sin permisos para crear empleados." }
  }
  if (!(owner as { email_verified?: boolean }).email_verified) {
    return { success: false, error: "Debes verificar tu email antes de agregar empleados." }
  }

  const supabase = await createClient()

  const { count, error: countErr } = await supabase
    .from("miembros_taller")
    .select("*", { count: "exact", head: true })
    .eq("taller_id", tallerId)
    .eq("activo", true)

  if (!countErr && (count ?? 0) >= 5) {
    return { success: false, error: MVP_LIMIT_MSG }
  }

  const { data: rolOk } = await supabase.from("roles_taller").select("id").eq("id", rolId).maybeSingle()
  if (!rolOk) {
    return { success: false, error: "El rol seleccionado no es valido." }
  }

  let userId: string

  try {
    const admin = await createAdminClient()
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: nombre },
      app_metadata: { taller_id: tallerId },
    })

    if (authError) {
      console.error("Auth createUser error:", authError)
      if (authError.message?.toLowerCase().includes("already been registered")) {
        return { success: false, error: "Ese correo ya esta registrado." }
      }
      return { success: false, error: authError.message || "No se pudo crear el usuario." }
    }

    userId = authData.user?.id as string
    if (!userId) return { success: false, error: "No se obtuvo el ID del usuario creado." }
  } catch (e) {
    console.error("createMiembro admin auth error:", e)
    const msg = e instanceof Error ? e.message : "Error al crear el usuario."
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY") || msg.includes("Missing")) {
      return { success: false, error: "Configuracion del servidor incompleta (clave de administracion)." }
    }
    return { success: false, error: msg }
  }

  const { error: insertError } = await supabase.from("miembros_taller").insert({
    taller_id: tallerId,
    auth_user_id: userId,
    email,
    nombre,
    rol_id: rolId,
    activo: true,
  })

  if (insertError) {
    console.error("Error inserting miembros_taller:", insertError)
    try {
      const admin = await createAdminClient()
      await admin.auth.admin.deleteUser(userId)
    } catch (delErr) {
      console.error("Rollback deleteUser failed:", delErr)
    }
    const raw = insertError.message || ""
    if (raw.includes("MVP_LIMIT") || raw.includes("enforce_miembros")) {
      return { success: false, error: MVP_LIMIT_MSG }
    }
    return { success: false, error: insertError.message || "No se pudo vincular el miembro al taller." }
  }

  const pinResult = await issueMemberVerificationPin({
    userId,
    tallerId,
    email,
    nombre,
  })

  if (!pinResult.success) {
    try {
      await supabase
        .from("miembros_taller")
        .delete()
        .eq("taller_id", tallerId)
        .eq("auth_user_id", userId)
    } catch (rollbackMemberErr) {
      console.error("Rollback miembros_taller failed:", rollbackMemberErr)
    }
    try {
      const admin = await createAdminClient()
      await admin.auth.admin.deleteUser(userId)
    } catch (rollbackAuthErr) {
      console.error("Rollback auth user failed:", rollbackAuthErr)
    }
    return {
      success: false,
      error: pinResult.error || "No se pudo enviar el correo de verificacion por PIN.",
    }
  }

    return { success: true }
  } catch (error) {
    console.error("[createMiembro] fatal:", error)
    return {
      success: false,
      error: "No se pudo crear el miembro. Verifica configuraciÃ³n del servidor y vuelve a intentar.",
    }
  }
}

export interface UpdateMiembroInput {
  miembroId: string
  nombre: string
  rolId: string
  password?: string
}

/**
 * Edita nombre/rol del miembro y opcionalmente actualiza su contrasena en Supabase Auth.
 */
export async function updateMiembro(
  input: UpdateMiembroInput
): Promise<{ success: boolean; error?: string }> {
  try {
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

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data: member, error: memberErr } = await supabase
    .from("miembros_taller")
    .select("id, auth_user_id")
    .eq("id", miembroId)
    .eq("taller_id", tallerId)
    .single()

  if (memberErr || !member) {
    return { success: false, error: "No se encontro el miembro para editar." }
  }

  const { data: rolOk } = await supabase
    .from("roles_taller")
    .select("id")
    .eq("id", rolId)
    .maybeSingle()
  if (!rolOk) {
    return { success: false, error: "El rol seleccionado no es valido." }
  }

  const { error: updErr } = await supabase
    .from("miembros_taller")
    .update({ nombre, rol_id: rolId })
    .eq("id", miembroId)
    .eq("taller_id", tallerId)

  if (updErr) {
    return { success: false, error: updErr.message || "No se pudo actualizar el miembro." }
  }

  const authUserId = (member as { auth_user_id?: string | null }).auth_user_id
  if (authUserId) {
    const admin = await createAdminClient()
    const updatePayload: {
      user_metadata?: { full_name: string }
      password?: string
    } = {
      user_metadata: { full_name: nombre },
    }
    if (password) updatePayload.password = password

    const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, updatePayload)
    if (authErr) {
      console.error("updateMiembro auth updateUserById:", authErr)
      return {
        success: false,
        error: "Se actualizo el miembro, pero no se pudo sincronizar su usuario de acceso.",
      }
    }
  }

    return { success: true }
  } catch (error) {
    console.error("[updateMiembro] fatal:", error)
    return {
      success: false,
      error: "No se pudo actualizar el miembro. Verifica configuraciÃ³n del servidor y vuelve a intentar.",
    }
  }
}

/**
 * Elimina un miembro del taller y revoca su acceso en Supabase Auth.
 */
export async function deleteMiembro(
  miembroId: string
): Promise<{ success: boolean; error?: string }> {
  try {
  const id = (miembroId || "").trim()
  if (!id) return { success: false, error: "Miembro invalido." }

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data: member, error: memberErr } = await supabase
    .from("miembros_taller")
    .select("id, auth_user_id")
    .eq("id", id)
    .eq("taller_id", tallerId)
    .single()

  if (memberErr || !member) {
    return { success: false, error: "No se encontro el miembro para eliminar." }
  }

  const authUserId = (member as { auth_user_id?: string | null }).auth_user_id

  const { error: delErr } = await supabase
    .from("miembros_taller")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)

  if (delErr) {
    return { success: false, error: delErr.message || "No se pudo eliminar el miembro." }
  }

  if (authUserId) {
    const admin = await createAdminClient()
    const { error: authErr } = await admin.auth.admin.deleteUser(authUserId)
    if (authErr) {
      console.error("deleteMiembro auth deleteUser:", authErr)
      return {
        success: false,
        error: "Se elimino el miembro, pero no se pudo revocar su usuario de acceso.",
      }
    }
  }

    return { success: true }
  } catch (error) {
    console.error("[deleteMiembro] fatal:", error)
    return {
      success: false,
      error: "No se pudo eliminar el miembro. Verifica configuraciÃ³n del servidor y vuelve a intentar.",
    }
  }
}
