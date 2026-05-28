"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Clock, Phone, Search } from "lucide-react"

interface TrackingValidationProps {
  onValidate: (last4: string) => Promise<void>
  isLoading: boolean
  error: string | null
}

export function TrackingValidation({ onValidate, isLoading, error }: TrackingValidationProps) {
  const [last4, setLast4] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (last4.trim().length === 4) {
      await onValidate(last4)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4)
    setLast4(value)
  }

  return (
    <div className="relative min-h-screen bg-black flex flex-col items-center justify-center px-4 py-8">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            SEGUIMIENTO DE EQUIPO
          </h1>
          <p className="text-sm text-slate-400 uppercase tracking-widest font-semibold">
            RED DE TALLERES CERTIFICADOS TALLERCLOUD
          </p>
        </div>

        {/* Validation Card */}
        <div className="bg-neutral-900/90 backdrop-blur border border-neutral-800 rounded-3xl p-8 mb-8 shadow-2xl">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-center text-2xl font-bold text-white mb-2">
            VERIFICACION DE SEGURIDAD
          </h2>

          {/* Visual instructions */}
          <p className="text-center text-sm text-slate-300 mb-2">
            Ingresa los ultimos 4 digitos del celular registrado en tu ticket de recepcion.
          </p>
          <div className="flex items-center justify-center gap-2 mb-6 text-xs text-slate-400">
            <Phone className="w-4 h-4 text-blue-400" />
            <span>
              Ejemplo:&nbsp;
              <span className="font-semibold text-white">7393</span>
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="tracking-phone-last4"
              type="tel"
              inputMode="numeric"
              placeholder="Ultimos 4 digitos de tu celular"
              value={last4}
              onChange={handleInputChange}
              maxLength={4}
              aria-label="Ingresa los ultimos 4 digitos de tu celular"
              aria-invalid={!!error}
              aria-describedby={error ? "tracking-folio-error" : undefined}
              className="h-14 text-center text-lg font-semibold bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/30"
            />

            <Button
              type="submit"
              disabled={last4.trim().length !== 4 || isLoading}
              className="w-full h-14 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                "Verificando..."
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  VERIFICAR Y ACCEDER
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-slate-500 px-4">
          Tu informacion esta protegida y segura. Estos datos solo seran utilizados para verificar tu solicitud.
        </p>
      </div>

      {/* Error banner fixed at bottom with shake-like animation */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="fixed inset-x-0 bottom-0 px-4 pb-4 pointer-events-none"
      >
        {error && (
          <div className="mx-auto max-w-md bg-red-600 text-white border border-red-500 rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 animate-shake-x pointer-events-auto">
            <AlertTriangle className="w-5 h-5" />
            <p
              id="tracking-folio-error"
              className="text-xs sm:text-sm font-semibold tracking-wide text-center"
            >
              LOS D&Iacute;GITOS INGRESADOS NO COINCIDEN CON NUESTROS REGISTROS
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
