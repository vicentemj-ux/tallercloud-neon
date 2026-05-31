"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { registerWithPrisma } from "@/lib/actions/auth-prisma"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    nombrePropietario: "",
    nombreTaller: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError("Las contrasenas no coinciden")
      return
    }

    // Validate password length
    if (formData.password.length < 8) {
      setError("La contrasena debe tener al menos 8 caracteres")
      return
    }

    setLoading(true)

    try {
      const result = await registerWithPrisma({
        nombrePropietario: formData.nombrePropietario,
        nombreTaller: formData.nombreTaller,
        email: formData.email,
        password: formData.password,
      })

      if (result.success) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(formData.email)}`)
      } else {
        setError(result.error || "Error al registrar")
      }
    } catch (err) {
      setError("Error al registrar. Intenta nuevamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-blue-600">TallerCloud</h1>
            <p className="text-sm text-slate-600 mt-1">Gestion de reparaciones inteligente</p>
          </div>
        </div>

        {/* Register Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl text-center">Registrar mi Taller</CardTitle>
            <CardDescription className="text-center">
              Crea tu cuenta en 30 dias gratis
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleRegister} className="space-y-5">
              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  {error}
                </div>
              )}

              {/* Nombre Propietario */}
              <div className="space-y-2">
                <Label htmlFor="nombrePropietario" className="text-sm font-medium">
                  Nombre Completo del Propietario
                </Label>
                <Input
                  id="nombrePropietario"
                  name="nombrePropietario"
                  placeholder="Juan Garcia"
                  value={formData.nombrePropietario}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>

              {/* Nombre Taller */}
              <div className="space-y-2">
                <Label htmlFor="nombreTaller" className="text-sm font-medium">
                  Nombre del Taller
                </Label>
                <Input
                  id="nombreTaller"
                  name="nombreTaller"
                  placeholder="Taller Garcia Reparaciones"
                  value={formData.nombreTaller}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Correo Electronico
                </Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Contrasena (minimo 8 caracteres)
                </Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="********"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirmar Contrasena
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  placeholder="********"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>

              {/* Register Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Crear Cuenta"
                )}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">o</span>
                </div>
              </div>

              <GoogleSignInButton />
            </form>

            {/* Login Link */}
            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-600">
                ¿Ya tienes cuenta?{" "}
                <Link
                  href="/auth/login"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Inicia sesion aqui
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500">
          <p>TallerCloud © 2024. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}
