"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { PERMISOS_DISPONIBLES } from "@/lib/constants"

const createClient = async () => (await createCurrentTenantClient()).supabase

/*
  Esquema esperado en Supabase:

  create table roles (
    id uuid primary key default gen_random_uuid(),
    taller_id uuid not null references taller_users(id),
    nombre text not null,
    descripcion text,
    created_at timestamptz default now()
  );

  create table rol_permisos (
    rol_id uuid not null references roles(id) on delete cascade,
    permiso_slug text not null,
    primary key (rol_id, permiso_slug)
  );

  create index idx_roles_taller on roles(taller_id);
*/

export async function getPermisosDisponibles() {
  return { data: PERMISOS_DISPONIBLES, error: null }
}

export interface RolOption {
  id: string
  nombre: string
  slug?: string
  categoria?: "estandar" | "especial"
}

/** Catálogo global de roles (Mi Equipo MVP). */
export async function getRolesByTallerId(): Promise<{ data: RolOption[]; error: string | null }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("roles_taller")
      .select("id, nombre, slug, categoria, orden")
      .order("orden", { ascending: true })

    if (error) {
      console.error("Error fetching roles_taller:", error)
      return { data: [], error: error.message }
    }
    return {
      data: (data || []).map((r) => ({
        id: r.id as string,
        nombre: r.nombre as string,
        slug: r.slug as string | undefined,
        categoria: r.categoria as "estandar" | "especial" | undefined,
      })),
      error: null,
    }
  } catch (error) {
    console.error("[getRolesByTallerId] fatal:", error)
    return { data: [], error: "No se pudo cargar el catalogo de roles." }
  }
}

export interface CreateRolInput {
  nombre: string
  descripcion: string
  permisoSlugs: string[]
}

/**
 * Crea un rol en la tabla roles y sus relaciones en rol_permisos.
 * Tablas esperadas: roles (id, taller_id, nombre, descripcion, created_at), rol_permisos (rol_id, permiso_slug).
 */
export async function createRol(
  input: CreateRolInput
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const supabase = await createClient()
    const tallerId = await getCurrentTallerId()

    const nombre = (input.nombre || "").trim()
    if (!nombre) {
      return { success: false, error: "El nombre del rol es obligatorio." }
    }

    const { data: rol, error: insertRolError } = await supabase
      .from("roles")
      .insert({
        taller_id: tallerId,
        nombre,
        descripcion: (input.descripcion || "").trim() || null,
      })
      .select("id")
      .single()

    if (insertRolError) {
      console.error("Error creating role:", insertRolError)
      return {
        success: false,
        error: insertRolError.message || "No se pudo crear el rol.",
      }
    }

    const rolId = rol?.id
    if (!rolId) {
      return { success: false, error: "No se obtuvo el ID del rol creado." }
    }

    const slugs = (input.permisoSlugs || []).filter(Boolean)
    if (slugs.length > 0) {
      const rows = slugs.map((permiso_slug) => ({ rol_id: rolId, permiso_slug }))
      const { error: insertPermisosError } = await supabase
        .from("rol_permisos")
        .insert(rows)

      if (insertPermisosError) {
        console.error("Error creating rol_permisos:", insertPermisosError)
        return {
          success: false,
          error: "Rol creado pero no se pudieron guardar los permisos.",
        }
      }
    }
    return { success: true, data: { id: rolId } }
  } catch (error) {
    console.error("[createRol] fatal:", error)
    return { success: false, error: "No se pudo crear el rol por configuracion incompleta del servidor." }
  }
}
