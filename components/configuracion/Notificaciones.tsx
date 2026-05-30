"use client"

import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import Link from "next/link"
import type { TallerSettings } from "@/lib/actions/settings-prisma"

interface NotificacionesProps {
  settings: TallerSettings | null
  setSettings: (settings: TallerSettings | null) => void
  loginEmail: string
  planTipo: string
}

export function Notificaciones({ settings, setSettings, loginEmail, planTipo }: NotificacionesProps) {
  const isPro = planTipo === "activo"

  return (
    <div className="relative space-y-8">
      {/* Lock overlay for non-PRO users */}
      {!isPro && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-white/85 backdrop-blur-[2px]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 shadow-sm">
            <Lock className="h-7 w-7 text-amber-600" />
          </div>
          <div className="text-center px-6">
            <p className="font-bold text-slate-800">Plan PRO requerido</p>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">
              Activa una suscripcion PRO para acceder a reportes avanzados y alertas automaticas.
            </p>
          </div>
          <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl px-5">
            <Link href="/dashboard/facturacion">Ver planes</Link>
          </Button>
        </div>
      )}

      <div className={!isPro ? "opacity-40 pointer-events-none select-none" : ""}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Reportes y alertas</h3>
          <p className="text-sm text-slate-600">
            Configura notificaciones automaticas por email para mantenerte informado.
          </p>
        </div>
        <div className="lg:col-span-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h4 className="text-sm font-semibold text-blue-900 mb-4">Alertas automaticas</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Inventario bajo</p>
                  <p className="text-xs text-slate-600">Aviso cuando productos esten por agotarse</p>
                </div>
                <Switch
                  checked={Boolean(settings?.alertas_stock_bajo)}
                  onCheckedChange={(value) => settings && setSettings({ ...settings, alertas_stock_bajo: value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Cierre de caja</p>
                  <p className="text-xs text-slate-600">Resumen diario de movimientos</p>
                </div>
                <Switch
                  checked={Boolean(settings?.reportes_cierre_caja)}
                  onCheckedChange={(value) => settings && setSettings({ ...settings, reportes_cierre_caja: value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Equipos sin movimiento</p>
                  <p className="text-xs text-slate-600">Reparaciones estancadas por mas de 3 dias</p>
                </div>
                <Switch
                  checked={Boolean(settings?.alerta_urgentes)}
                  onCheckedChange={(value) => settings && setSettings({ ...settings, alerta_urgentes: value })}
                />
              </div>
            </div>
          </div>
          <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-700">
              Los reportes se enviaran automaticamente al correo:{" "}
              <span className="font-medium text-slate-900">{loginEmail || "-"}</span>
            </p>
            {!loginEmail && (
              <p className="text-xs text-slate-500 mt-1">
                Si no ves tu correo, recarga la pagina o revisa que tu cuenta tenga email en TallerCloud.
              </p>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
