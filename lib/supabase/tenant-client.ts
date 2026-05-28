"use server"

import { SignJWT } from "jose"
import { createClient } from "@supabase/supabase-js"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

/**
 * Crea un cliente Supabase autenticado como el tenant actual.
 *
 * Genera un JWT firmado con SUPABASE_JWT_SECRET que incluye `taller_id`
 * en los claims. Las politicas RLS usan `(auth.jwt()->>'taller_id')::uuid`
 * para aislar datos por tenant.
 *
 * Usar en Server Actions en lugar de createAdminClient() para que RLS
 * sea la linea de defensa a nivel de base de datos.
 *
 * Para operaciones que requieren permisos de admin (auth.admin.createUser,
 * operaciones de super-admin), seguir usando createAdminClient().
 */
export async function createTenantClient(tallerId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const jwtSecret = process.env.SUPABASE_JWT_SECRET

  if (!url || !anonKey || !jwtSecret) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_JWT_SECRET"
    )
  }

  const secret = new TextEncoder().encode(jwtSecret)

  const token = await new SignJWT({
    iss: "supabase",
    role: "authenticated",
    taller_id: tallerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret)

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Helper para Server Actions: obtiene el tallerId de la sesion y crea
 * el cliente tenant-scoped en una sola llamada.
 *
 * Reemplaza el patron:
 *   const supabase = await createClient()        // admin
 *   const tallerId = await getCurrentTallerId()
 *
 * Por:
 *   const { supabase, tallerId } = await createCurrentTenantClient()
 */
export async function createCurrentTenantClient() {
  const tallerId = await getCurrentTallerId()
  const supabase = await createTenantClient(tallerId)
  return { supabase, tallerId }
}
