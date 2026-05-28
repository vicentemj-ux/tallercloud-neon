"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Servicio {
  id: string
  nombre: string
  descripcion: string
  precio: number
  created_at: string
  updated_at: string
}

export interface ReparacionServicio {
  id: string
  reparacion_id: string
  servicio_id: string | null
  nombre_snapshot: string
  precio_snapshot: number
  cantidad: number
  created_at: string
}

export interface CreateServicioInput {
  nombre: string
  descripcion: string
  precio: number
}

// ─── Catalogo de servicios ────────────────────────────────────────────────────

export async function getServicios(): Promise<{ data: Servicio[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("catalogo_servicios")
    .select("*")
    .eq("taller_id", tallerId)
    .order("nombre", { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as Servicio[], error: null }
}

export async function createServicio(
  input: CreateServicioInput
): Promise<{ data: Servicio | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("catalogo_servicios")
    .insert({
      taller_id: tallerId,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion.trim(),
      precio: input.precio,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath("/dashboard/servicios")
  return { data: data as Servicio, error: null }
}

export async function updateServicio(
  id: string,
  input: Partial<CreateServicioInput>
): Promise<{ data: Servicio | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.nombre !== undefined) payload.nombre = input.nombre.trim()
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion.trim()
  if (input.precio !== undefined) payload.precio = input.precio

  const { data, error } = await supabase
    .from("catalogo_servicios")
    .update(payload)
    .eq("id", id)
    .eq("taller_id", tallerId)
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath("/dashboard/servicios")
  return { data: data as Servicio, error: null }
}

export async function deleteServicio(id: string): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { error } = await supabase
    .from("catalogo_servicios")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)

  if (error) return { error: error.message }

  revalidatePath("/dashboard/servicios")
  return { error: null }
}

// ─── Servicios aplicados a reparaciones ───────────────────────────────────────

export async function getServiciosReparacion(
  reparacionId: string
): Promise<{ data: ReparacionServicio[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("reparacion_servicios")
    .select("*")
    .eq("taller_id", tallerId)
    .eq("reparacion_id", reparacionId)
    .order("created_at", { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ReparacionServicio[], error: null }
}

export async function addServicioReparacion(
  reparacionId: string,
  servicioId: string,
  cantidad = 1
): Promise<{ data: ReparacionServicio | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // Obtener snapshot del servicio
  const { data: svc } = await supabase
    .from("catalogo_servicios")
    .select("nombre, precio")
    .eq("id", servicioId)
    .eq("taller_id", tallerId)
    .single()

  if (!svc) return { data: null, error: "Servicio no encontrado" }

  const { data, error } = await supabase
    .from("reparacion_servicios")
    .insert({
      taller_id: tallerId,
      reparacion_id: reparacionId,
      servicio_id: servicioId,
      nombre_snapshot: (svc as { nombre: string }).nombre,
      precio_snapshot: (svc as { precio: number }).precio,
      cantidad,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }

  revalidatePath(`/dashboard/reparaciones/${reparacionId}`)
  return { data: data as ReparacionServicio, error: null }
}

export async function removeServicioReparacion(
  reparacionServicioId: string,
  reparacionId: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { error } = await supabase
    .from("reparacion_servicios")
    .delete()
    .eq("id", reparacionServicioId)
    .eq("taller_id", tallerId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/reparaciones/${reparacionId}`)
  return { error: null }
}

export async function setServiciosReparacion(
  reparacionId: string,
  servicios: { servicio_id: string; cantidad?: number }[]
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // 1. Borrar existentes
  const { error: delErr } = await supabase
    .from("reparacion_servicios")
    .delete()
    .eq("reparacion_id", reparacionId)
    .eq("taller_id", tallerId)

  if (delErr) return { error: delErr.message }

  if (!servicios.length) {
    revalidatePath(`/dashboard/reparaciones/${reparacionId}`)
    return { error: null }
  }

  // 2. Obtener snapshots
  const ids = servicios.map((s) => s.servicio_id)
  const { data: catRows } = await supabase
    .from("catalogo_servicios")
    .select("id, nombre, precio")
    .in("id", ids)
    .eq("taller_id", tallerId)

  const catMap = new Map<string, { nombre: string; precio: number }>()
  for (const row of (catRows ?? []) as { id: string; nombre: string; precio: number }[]) {
    catMap.set(row.id, { nombre: row.nombre, precio: row.precio })
  }

  // 3. Insertar nuevos
  const inserts = servicios
    .map((s) => {
      const cat = catMap.get(s.servicio_id)
      if (!cat) return null
      return {
        taller_id: tallerId,
        reparacion_id: reparacionId,
        servicio_id: s.servicio_id,
        nombre_snapshot: cat.nombre,
        precio_snapshot: cat.precio,
        cantidad: Math.max(1, s.cantidad ?? 1),
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  if (inserts.length) {
    const { error: insErr } = await supabase.from("reparacion_servicios").insert(inserts)
    if (insErr) return { error: insErr.message }
  }

  revalidatePath(`/dashboard/reparaciones/${reparacionId}`)
  return { error: null }
}
