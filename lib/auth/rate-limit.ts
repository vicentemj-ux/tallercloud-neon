import { createAdminClient } from "@/lib/supabase/admin"

export type RateLimitAction =
  | "login"
  | "login_admin"
  | "register"
  | "reset"
  | "verify"

interface RateLimitConfig {
  maxAttempts: number
  windowMinutes: number
}

const LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  login:       { maxAttempts: 5,  windowMinutes: 15 },
  login_admin: { maxAttempts: 3,  windowMinutes: 15 },
  register:    { maxAttempts: 3,  windowMinutes: 60 },
  reset:       { maxAttempts: 3,  windowMinutes: 60 },
  verify:      { maxAttempts: 5,  windowMinutes: 60 },
}

/**
 * Verifica si el identificador (email o IP) ha superado el límite
 * para la acción dada. Si no lo ha superado, registra el intento.
 *
 * @returns { allowed: true }  si puede continuar
 * @returns { allowed: false, retryAfterMinutes } si está bloqueado
 */
export async function checkRateLimit(
  identifier: string,
  action: RateLimitAction
): Promise<{ allowed: boolean; retryAfterMinutes?: number }> {
  const { maxAttempts, windowMinutes } = LIMITS[action]
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  const supabase = await createAdminClient()

  // Contar intentos en la ventana
  const { count, error } = await supabase
    .from("auth_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier.toLowerCase())
    .eq("action", action)
    .gte("attempt_at", windowStart)

  if (error) {
    // Fail-closed: si no se puede verificar el rate limit, bloquear el acceso
    console.error("[rate-limit] Error checking rate limit:", error.message)
    return { allowed: false, retryAfterMinutes: windowMinutes }
  }

  if ((count ?? 0) >= maxAttempts) {
    return { allowed: false, retryAfterMinutes: windowMinutes }
  }

  // Registrar este intento
  await supabase.from("auth_rate_limits").insert({
    identifier: identifier.toLowerCase(),
    action,
  })

  return { allowed: true }
}
