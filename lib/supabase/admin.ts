"use server"

import { createClient } from "@supabase/supabase-js"

/**
 * Cliente Supabase con service_role para operaciones de administracion (ej. auth.admin.createUser).
 * Usar solo en Server Actions; nunca exponer en el cliente.
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local
 */
export async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
