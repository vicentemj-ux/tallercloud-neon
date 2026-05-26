"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowLeft, CheckCircle2, Clock, Wrench, Package } from "lucide-react"

interface TrackingDetailsProps {
  repairs: any[]
  selectedRepair: any
  onSelectRepair: (repair: any) => void
  onBack: () => void
}

const STATUS_CONFIG = {
  "Recibido": {
    icon: Package,
    color: "bg-blue-600/20 text-blue-400 border-blue-600/50",
    step: 1,
  },
  "En Revisión": {
    icon: Clock,
    color: "bg-cyan-600/20 text-cyan-400 border-cyan-600/50",
    step: 2,
  },
  "Esperando Refacción": {
    icon: Wrench,
    color: "bg-amber-600/20 text-amber-400 border-amber-600/50",
    step: 3,
  },
  "Listo para Entrega": {
    icon: CheckCircle2,
    color: "bg-green-600/20 text-green-400 border-green-600/50",
    step: 4,
  },
  "Entregado": {
    icon: CheckCircle2,
    color: "bg-emerald-600/20 text-emerald-400 border-emerald-600/50",
    step: 5,
  },
}

function RepairTimeline({ repair }: { repair: any }) {
  const currentStatus = repair.estatus || "Recibido"
  const currentStep = STATUS_CONFIG[currentStatus as keyof typeof STATUS_CONFIG]?.step || 1

  return (
    <div className="space-y-8 py-8">
      {/* Timeline */}
      <div className="space-y-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const Icon = config.icon
          const isCompleted = (config.step as number) < currentStep
          const isActive = status === currentStatus

          return (
            <div key={status} className="relative flex items-start gap-4">
              {/* Timeline line */}
              {config.step !== 5 && (
                <div
                  className={`absolute left-6 top-12 w-0.5 h-12 ${
                    isCompleted || isActive ? "bg-blue-600" : "bg-slate-700"
                  }`}
                />
              )}

              {/* Status dot and icon */}
              <div
                className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                  isCompleted || isActive
                    ? "bg-blue-600/20 border-blue-600"
                    : "bg-slate-800/50 border-slate-700"
                }`}
              >
                <Icon
                  className={`w-6 h-6 ${
                    isCompleted || isActive ? "text-blue-400" : "text-slate-600"
                  }`}
                />
              </div>

              {/* Status content */}
              <div className="flex-1 pt-2">
                <h3 className={`font-semibold ${isActive ? "text-blue-400" : "text-slate-300"}`}>
                  {status}
                </h3>
                {isActive && (
                  <p className="text-xs text-blue-300 mt-1">
                    Estado actual • Actualizado hace poco
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function TrackingDetails({
  repairs,
  selectedRepair,
  onSelectRepair,
  onBack,
}: TrackingDetailsProps) {
  if (!selectedRepair) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-8">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 px-4 max-w-2xl mx-auto">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Tu Reparación</h1>
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Volver
          </Button>
        </div>

        {/* Multiple repairs selector */}
        {repairs.length > 1 && (
          <div className="mb-6 space-y-2">
            <p className="text-sm text-slate-400">Se encontraron {repairs.length} reparaciones:</p>
            <div className="flex gap-2 flex-wrap">
              {repairs.map((repair) => (
                <button
                  key={repair.id}
                  onClick={() => onSelectRepair(repair)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedRepair.id === repair.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {repair.folio}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="space-y-6">
          {/* Device Details Card */}
          <Card className="bg-slate-900/60 backdrop-blur border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Detalles del Equipo</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Folio */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                  Folio
                </p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{selectedRepair.folio}</p>
              </div>

              {/* Marca */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                  Marca
                </p>
                <p className="text-xl text-slate-200 mt-1">{selectedRepair.marca}</p>
              </div>

              {/* Modelo */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                  Modelo
                </p>
                <p className="text-xl text-slate-200 mt-1">{selectedRepair.modelo}</p>
              </div>

              {/* Tipo Equipo */}
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                  Tipo
                </p>
                <p className="text-xl text-slate-200 mt-1">{selectedRepair.tipo_equipo}</p>
              </div>

              {/* Serial */}
              {selectedRepair.numero_serie && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                    Serial / IMEI
                  </p>
                  <p className="text-lg font-mono text-slate-200 mt-1">
                    {selectedRepair.numero_serie}
                  </p>
                </div>
              )}
            </div>

            {/* Falla Reportada */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2">
                Falla Reportada
              </p>
              <p className="text-slate-300 leading-relaxed">{selectedRepair.falla}</p>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="bg-slate-900/60 backdrop-blur border-slate-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Estado de tu Reparación</h2>
            <RepairTimeline repair={selectedRepair} />
          </Card>

          {/* Presupuesto Card - if available */}
          {(selectedRepair.precio_estimado || selectedRepair.anticipo) && (
            <Card className="bg-slate-900/60 backdrop-blur border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Presupuesto</h2>

              <div className="space-y-3">
                {selectedRepair.precio_estimado && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Presupuesto estimado:</span>
                    <span className="text-lg font-semibold text-blue-400">
                      ${parseFloat(selectedRepair.precio_estimado).toFixed(2)}
                    </span>
                  </div>
                )}

                {selectedRepair.anticipo && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Anticipo recibido:</span>
                    <span className="text-lg font-semibold text-green-400">
                      ${parseFloat(selectedRepair.anticipo).toFixed(2)}
                    </span>
                  </div>
                )}

                {selectedRepair.precio_estimado && selectedRepair.anticipo && (
                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Pendiente por pagar:</span>
                    <span className="text-lg font-bold text-slate-100">
                      ${(
                        parseFloat(selectedRepair.precio_estimado) -
                        parseFloat(selectedRepair.anticipo)
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Contact Info */}
          <Card className="bg-slate-900/60 backdrop-blur border-slate-800 p-6">
            <p className="text-sm text-slate-400 text-center">
              ¿Tienes preguntas? Contacta con el taller al número registrado.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
