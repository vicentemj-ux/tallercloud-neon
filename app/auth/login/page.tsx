"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2, AlertCircle, Mail, RefreshCw, MessageCircle } from "lucide-react"
import { signIn } from "next-auth/react"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { checkEmailStatus, resendVerificationEmail } from "@/lib/actions/auth-prisma"

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageSkeleton />}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="space-y-4">
          <div className="h-8 w-32 bg-muted rounded animate-pulse mx-auto" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse mx-auto" />
          <div className="space-y-3">
            <div className="h-10 bg-muted rounded animate-pulse" />
            <div className="h-10 bg-muted rounded animate-pulse" />
            <div className="h-10 bg-muted rounded animate-pulse" />
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")

  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState("")

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccessMsg("Cuenta creada exitosamente. Debes verificar tu correo antes de iniciar sesion. Revisa tu bandeja de entrada o spam.")
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMsg("")
    setUnverifiedEmail(null)
    setResendSent(false)
    setResendError("")
    setLoading(true)

    try {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (result?.ok) {
        router.push("/dashboard")
        router.refresh()
        return
      }

      // Check if the email exists but is unverified
      const status = await checkEmailStatus(email)
      if (status.exists && !status.verified) {
        setUnverifiedEmail(email)
        setError("Tu correo aun no ha sido verificado. Revisa tu bandeja de entrada o reenvia el correo de verificacion.")
      } else {
        setError("Email o contrasena incorrectos")
      }
    } catch {
      setError("Error al iniciar sesion. Intenta nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!unverifiedEmail) return
    setResending(true)
    setResendError("")
    setResendSent(false)
    const result = await resendVerificationEmail(unverifiedEmail)
    if (result.success) {
      setResendSent(true)
    } else {
      setResendError(result.error || "Error al reenviar")
    }
    setResending(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-blue-600">TallerCloud</h1>
            <p className="text-sm text-slate-600 mt-1">Gestion de reparaciones inteligente</p>
          </div>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-center">Iniciar Sesion</CardTitle>
            <CardDescription className="text-center">Accede a tu dashboard de TallerCloud</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              {successMsg && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  <p>{error}</p>
                </div>
              )}

              {unverifiedEmail && (
                <div className="space-y-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Mail className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900 space-y-2">
                      <p className="font-semibold">Correo pendiente de verificacion</p>
                      <p>Enviamos un enlace de verificacion a <strong>{unverifiedEmail}</strong>. Revisa tu bandeja de entrada y, si no lo encuentras, sigue estas recomendaciones:</p>
                      <ul className="list-disc pl-5 space-y-1 text-amber-800">
                        <li>Revisa la carpeta de <strong>Spam</strong> o Correo no deseado</li>
                        <li>Si usas Gmail, revisa la pestana <strong>Promociones</strong> o <strong>Social</strong></li>
                        <li>Agrega <strong>noreply@tallercloud.net</strong> a tu lista de contactos</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      variant="outline"
                      size="sm"
                      className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                    >
                      {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Reenviar correo de verificacion
                    </Button>

                    {resendSent && (
                      <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Correo reenviado correctamente
                      </p>
                    )}
                    {resendError && (
                      <p className="text-xs text-red-600 font-medium">{resendError}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Correo Electronico</Label>
                <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="h-10" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Contrasena</Label>
                <Input id="password" type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} className="h-10" />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-10 bg-blue-600 hover:bg-blue-700">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando...</> : "Entrar"}
              </Button>

              <div className="text-center">
                <Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Olvide mi contrasena</Link>
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-500">o</span></div>
              </div>

              <GoogleSignInButton />
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">Nuevo en TallerCloud? <Link href="/auth/register" className="text-blue-600 hover:text-blue-700 font-medium">Registrar mi Taller</Link></p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-slate-500 mt-6 leading-relaxed">
          <p>TallerCloud &copy; 2024&ndash;2026 &middot; Software de gestion para talleres</p>
          <p className="mt-1">
            <a
              href="https://api.whatsapp.com/send?phone=526681227393"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Soporte tecnico via WhatsApp
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
