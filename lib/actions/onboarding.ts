"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const nombreSchema = z.string().min(2, "El nombre del taller es obligatorio (mínimo 2 caracteres)").max(100).trim()

const cookieBase = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

async function setTallerSessionCookies(tallerId: string, nombreTaller: string) {
  const cookieStore = await cookies()
  cookieStore.set("tallerId", tallerId, cookieBase)
  cookieStore.set("tallerName", encodeURIComponent(nombreTaller), cookieBase)
}

/**
 * Completa el alta del taller tras OAuth (Google): crea la fila en taller_users
 * con id = auth.users.id, prueba 30 días y cookies de sesión del producto.
 */
export async function completeOnboardingTaller(
  nombreTallerRaw: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = nombreSchema.safeParse(nombreTallerRaw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" }
  }
  const nombreTaller = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return { success: false, error: "Sesión no válida. Inicia sesión con Google de nuevo." }
  }

  const admin = await createAdminClient()

  const { data: existingById } = await admin
    .from("taller_users")
    .select("id, nombre_taller")
    .eq("id", user.id)
    .maybeSingle()

  if (existingById) {
    await setTallerSessionCookies(existingById.id, existingById.nombre_taller as string)
    redirect("/dashboard")
  }

  const emailLower = user.email.toLowerCase().trim()
  const { data: existingByEmail } = await admin
    .from("taller_users")
    .select("id")
    .eq("email", emailLower)
    .maybeSingle()

  if (existingByEmail) {
    return {
      success: false,
      error:
        "Ya existe una cuenta con este correo. Inicia sesión con email y contraseña o contacta a soporte.",
    }
  }

  const nombrePropietario =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    emailLower.split("@")[0] ||
    "Propietario"

  const fechaVencimiento = new Date()
  fechaVencimiento.setDate(fechaVencimiento.getDate() + 30)

  const { error: insertError } = await admin.from("taller_users").insert({
    id: user.id,
    email: emailLower,
    nombre_propietario: nombrePropietario,
    nombre_taller: nombreTaller,
    password_hash: null,
    email_verified: true,
    plan_tipo: "prueba",
    fecha_vencimiento_plan: fechaVencimiento.toISOString(),
  })

  if (insertError) {
    console.error("[completeOnboardingTaller]", insertError)
    return { success: false, error: "No se pudo crear tu taller. Intenta de nuevo." }
  }

  await setTallerSessionCookies(user.id, nombreTaller)
  redirect("/dashboard")
}
