import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { OnboardingForm } from "./onboarding-form"
import { getCurrentUser } from "@/lib/auth"

export default async function OnboardingPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/auth/login")
  }

  const admin = await createAdminClient()
  const { data: existing } = await admin
    .from("taller_users")
    .select("id")
    .eq("id", (user as any).id)
    .maybeSingle()

  if (existing) {
    redirect("/dashboard")
  }

  const welcomeName =
    ((user as any).name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Usuario"

  return (
    <div className="min-h-screen bg-white px-4 py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-blue-600">TallerCloud</h1>
          <p className="mt-2 text-sm text-slate-600">Configura tu taller en un solo paso</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">¡Bienvenido, {welcomeName}!</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Para activar tu prueba gratuita de 30 días, indica cómo se llama tu taller. Podrás cambiarlo
            después en configuración.
          </p>

          <div className="mt-8">
            <OnboardingForm />
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          Al continuar aceptas los términos de uso de TallerCloud para cuentas de prueba.
        </p>
      </div>
    </div>
  )
}
