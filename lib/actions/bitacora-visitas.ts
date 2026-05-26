"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { revalidatePath } from "next/cache"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BitacoraVisita {
  id: string
  taller_id: string
  fecha_hora_entrada: string
  fecha_hora_salida: string | null
  foto_entrada_url: string | null
  foto_salida_url: string | null
  camara_ip: string | null
  evento_tipo: string | null
  motivo_visita: string | null
  motivo_otro: string | null
  estado_atencion: "pendiente" | "atendido" | "no_atendido" | "se_fue"
  reparacion_folio: string | null
  venta_folio: string | null
  atendido_por: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type MotivoVisita =
  | "reparacion"
  | "cotizacion"
  | "compra"
  | "recoger"
  | "personal"
  | "otro"

// ─── Server Actions ──────────────────────────────────────────────────────────

/**
 * Lista las visitas de un taller con filtros opcionales.
 */
export async function getVisitas(params: {
  tallerId: string
  estado?: "pendiente" | "atendido" | "no_atendido" | "se_fue"
  desde?: string
  hasta?: string
  limite?: number
}): Promise<{ data: BitacoraVisita[]; error: string | null }> {
  const supabase = await createAdminClient()

  let query = supabase
    .from("bitacora_visitas")
    .select("*")
    .eq("taller_id", params.tallerId)
    .order("fecha_hora_entrada", { ascending: false })

  if (params.estado) {
    query = query.eq("estado_atencion", params.estado)
  }
  if (params.desde) {
    query = query.gte("fecha_hora_entrada", params.desde)
  }
  if (params.hasta) {
    query = query.lte("fecha_hora_entrada", params.hasta)
  }
  if (params.limite) {
    query = query.limit(params.limite)
  }

  const { data, error } = await query

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data || []) as BitacoraVisita[], error: null }
}

/**
 * Obtiene el conteo de visitas pendientes para un taller.
 * Usado por el frontend para mostrar badges/toasts.
 */
export async function getVisitasPendientesCount(
  tallerId: string
): Promise<{ count: number; error: string | null }> {
  const supabase = await createAdminClient()

  const { count, error } = await supabase
    .from("bitacora_visitas")
    .select("id", { count: "exact", head: true })
    .eq("taller_id", tallerId)
    .eq("estado_atencion", "pendiente")

  if (error) {
    return { count: 0, error: error.message }
  }

  return { count: count || 0, error: null }
}

/**
 * Responde la encuesta de una visita y marca como atendida.
 */
export async function responderEncuestaVisita(params: {
  visitaId: string
  motivoVisita: MotivoVisita
  motivoOtro?: string
  notas?: string
  atendidoPor: string
  reparacionFolio?: string
  ventaFolio?: string
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createAdminClient()

  const { error } = await supabase
    .from("bitacora_visitas")
    .update({
      motivo_visita: params.motivoVisita,
      motivo_otro: params.motivoOtro || null,
      estado_atencion: "atendido",
      atendido_por: params.atendidoPor,
      notas: params.notas || null,
      reparacion_folio: params.reparacionFolio || null,
      venta_folio: params.ventaFolio || null,
    })
    .eq("id", params.visitaId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath("/dashboard")
  return { success: true, error: null }
}

/**
 * Marca una visita como "se fue" (salida detectada o manual).
 */
export async function marcarVisitaSalida(params: {
  visitaId: string
  fotoSalidaUrl?: string
}): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createAdminClient()

  const { error } = await supabase
    .from("bitacora_visitas")
    .update({
      estado_atencion: "se_fue",
      fecha_hora_salida: new Date().toISOString(),
      foto_salida_url: params.fotoSalidaUrl || null,
    })
    .eq("id", params.visitaId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Verifica si hay visitas pendientes antes de cerrar caja.
 * Llamado desde cerrarCaja en lib/actions/ventas.ts
 */
export async function verificarVisitasPendientesCierre(
  tallerId: string,
  fechaAperturaCaja: string
): Promise<{
  puedeCerrar: boolean
  visitasPendientes: number
  error: string | null
}> {
  const supabase = await createAdminClient()

  const { count, error } = await supabase
    .from("bitacora_visitas")
    .select("id", { count: "exact", head: true })
    .eq("taller_id", tallerId)
    .eq("estado_atencion", "pendiente")
    .gte("fecha_hora_entrada", fechaAperturaCaja)

  if (error) {
    return { puedeCerrar: false, visitasPendientes: 0, error: error.message }
  }

  const pendientes = count || 0
  return {
    puedeCerrar: pendientes === 0,
    visitasPendientes: pendientes,
    error: null,
  }
}

// ─── Camera Config ───────────────────────────────────────────────────────────

export async function getCamaraConfig(tallerId: string): Promise<{
  config: Record<string, unknown> | null
  error: string | null
}> {
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from("configuracion_taller")
    .select("camara_config")
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (error) {
    return { config: null, error: error.message }
  }

  return { config: (data?.camara_config as Record<string, unknown>) || null, error: null }
}

export async function updateCamaraConfig(
  tallerId: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  const { supabase } = await createCurrentTenantClient()

  const { error } = await supabase
    .from("configuracion_taller")
    .update({ camara_config: config })
    .eq("taller_id", tallerId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}
