import { cookies } from "next/headers"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { calcDiasRestantes } from "@/lib/utils/subscription"

/**
 * Acceso Pro controlado por suscripcion activa o prueba vigente.
 * Durante la prueba de 30 dias, el usuario debe tener acceso completo Pro.
 */
export async function esUsuarioPro(): Promise<boolean> {
  const cookieStore = await cookies()
  const tallerId = cookieStore.get("tallerId")?.value

  if (!tallerId) return false

  const { supabase } = await createCurrentTenantClient()
  const { data, error } = await supabase
    .from("taller_users")
    .select("plan_tipo, plan_activo, is_pro, fecha_vencimiento_plan, created_at")
    .eq("id", tallerId)
    .single()

  if (error || !data) return false

  const row = data as {
    plan_tipo?: string | null
    plan_activo?: boolean | null
    is_pro?: boolean | null
    fecha_vencimiento_plan?: string | null
    created_at?: string | null
  }

  if (row.plan_tipo === "suspendido") return false
  if (row.plan_tipo === "activo" || row.plan_activo || row.is_pro) return true

  const diasDesdeVenc = calcDiasRestantes(row.fecha_vencimiento_plan)
  if (diasDesdeVenc !== null) return diasDesdeVenc > 0

  if (!row.created_at) return false

  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  const createdDate = new Date(row.created_at)
  const startUtc = Date.UTC(createdDate.getUTCFullYear(), createdDate.getUTCMonth(), createdDate.getUTCDate())
  const daysSince = Math.floor((todayUtc - startUtc) / (1000 * 60 * 60 * 24))

  return Math.max(0, 30 - daysSince) > 0
}
