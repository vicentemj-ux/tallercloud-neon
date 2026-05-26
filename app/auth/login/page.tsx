"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { signIn } from "next-auth/react"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"

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

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccessMsg("Cuenta creada exitosamente. Inicia sesion con tus credenciales.")
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMsg("")
    setLoading(true)

    try {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (result?.ok) {
        router.push("/dashboard")
        router.refresh()
      } else {
        setError("Email o contrasena incorrectos")
      }
    } catch {
      setError("Error al iniciar sesion. Intenta nuevamente.")
    } finally {
      setLoading(false)
    }
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

              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Correo Electronico</Label>
                <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="h-10" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Contrasena</Label>
                <Input id="password" type="password" placeholder="********" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} className="h-10" />
              </div>

              <Button type="submit" disabled={loading} className="w-full h-10 bg-blue-600 hover:bg-blue-700">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando...</> : "Entrar"}
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
      </div>
    </div>
  )
}
