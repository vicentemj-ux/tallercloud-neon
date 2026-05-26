"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getCurrentTenant } from "@/lib/auth"
import { calcDiasRestantes } from "@/lib/utils/subscription"

/** Días de prueba gratuita desde la creación del perfil (fallback para cuentas sin fecha_vencimiento_plan) */
const TRIAL_DAYS = 30

/**
 * Get the current taller (tenant) ID from the session
 * Throws redirect to login if not authenticated
 */
export async function getCurrentTallerId(): Promise<string> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value

  if (tallerId) {
    return tallerId
  }

  const tenant = await getCurrentTenant()
  if (tenant?.id) {
    // Backfill legacy cookies for actions still using getCurrentTallerId.
    cookieStore.set("tallerId", tenant.id, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    if (tenant.nombre_taller) {
      cookieStore.set("tallerName", encodeURIComponent(tenant.nombre_taller), {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    return tenant.id
  }

  redirect("/auth/login")
}

/**
 * Get the current taller info from the session
 * Throws redirect to login if not authenticated
 */
export async function getCurrentTallerInfo(): Promise<{ id: string; name: string }> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value
  const tallerName = cookieStore.get("tallerName")?.value

  if (!tallerId) {
    redirect("/auth/login")
  }

  return {
    id: tallerId,
    name: tallerName ? decodeURIComponent(tallerName) : "Mi Taller",
  }
}

/**
 * Días de prueba / suscripción restantes.
 * Priority: fecha_vencimiento_plan (explicit expiry) → created_at + TRIAL_DAYS (legacy fallback).
 * Always returns ≥ 0 (never negative).
 * Throws redirect to login if not authenticated.
 */
export async function getCurrentTallerTrialInfo(): Promise<{
  created_at: string | null
  diasRestantes: number
}> {
  const tallerId = await getCurrentTallerId()
  const { createTenantClient } = await import("@/lib/supabase/tenant-client")
  const supabase = await createTenantClient(tallerId)

  const { data, error } = await supabase
    .from("taller_users")
    .select("created_at, fecha_vencimiento_plan")
    .eq("id", tallerId)
    .single()

  if (error || !data) {
    return { created_at: null, diasRestantes: 0 }
  }

  const row = data as { created_at?: string; fecha_vencimiento_plan?: string | null }
  const created_at = row.created_at ?? null
  const fechaVenc = row.fecha_vencimiento_plan ?? null

  // Prefer explicit expiry date (set by admin when granting/renewing subscription)
  const diasDesdeVenc = calcDiasRestantes(fechaVenc)
  if (diasDesdeVenc !== null) {
    return { created_at, diasRestantes: diasDesdeVenc }
  }

  // Fallback: legacy trial accounts without fecha_vencimiento_plan
  if (!created_at) {
    return { created_at: null, diasRestantes: 0 }
  }

  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  const createdDate = new Date(created_at)
  const startUtc = Date.UTC(createdDate.getUTCFullYear(), createdDate.getUTCMonth(), createdDate.getUTCDate())
  const daysSince = Math.floor((todayUtc - startUtc) / (1000 * 60 * 60 * 24))
  const diasRestantes = Math.max(0, TRIAL_DAYS - daysSince)

  return { created_at, diasRestantes }
}
