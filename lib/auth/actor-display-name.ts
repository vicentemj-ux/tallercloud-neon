"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

/**
 * Nombre visible para auditoría (historial de reparaciones, bitácora).
 * - Si hay sesión Supabase Auth y el usuario es miembro del taller: nombre en miembros_taller o user_metadata.
 * - Si no (flujo actual con cookie de propietario): nombre_propietario / email de taller_users.
 */
export async function getCurrentActorDisplayName(): Promise<string> {
  const tallerId = await getCurrentTallerId()
  const admin = await createAdminClient()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user?.id) {
      try {
        const { data: miembro, error: mErr } = await admin
          .from("miembros_taller")
          .select("nombre")
          .eq("taller_id", tallerId)
          .eq("auth_user_id", user.id)
          .eq("activo", true)
          .maybeSingle()

        if (!mErr) {
          const m = miembro as { nombre?: string | null } | null
          if (m?.nombre?.trim()) {
            return m.nombre.trim()
          }
        }
      } catch {
        // Tabla aún no migrada u otro error: ignorar
      }

      const meta = user.user_metadata as { full_name?: string } | undefined
      const fromMeta = meta?.full_name?.trim() || user.email?.trim()
      if (fromMeta) return fromMeta
    }
  } catch {
    // Sin sesión Auth o error: seguir con propietario
  }

  const { data, error } = await admin
    .from("taller_users")
    .select("nombre_propietario, email, nombre_taller")
    .eq("id", tallerId)
    .single()

  if (error || !data) {
    return "Usuario"
  }

  const r = data as {
    nombre_propietario?: string | null
    email?: string | null
    nombre_taller?: string | null
  }

  return (
    r.nombre_propietario?.trim() ||
    r.email?.trim() ||
    r.nombre_taller?.trim() ||
    "Usuario"
  )
}
