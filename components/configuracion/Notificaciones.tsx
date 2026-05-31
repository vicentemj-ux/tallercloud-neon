"use client"

import { useCallback } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { BellRing, Lock } from "lucide-react"
import Link from "next/link"
import { toast } from "@/hooks/use-toast"
import { updateTallerSettings } from "@/lib/actions/settings-prisma"
import type { TallerSettings } from "@/lib/actions/settings-prisma"

type AlertaKey = "alertas_stock_bajo" | "reportes_cierre_caja" | "alerta_urgentes"

interface NotificacionesProps {
  settings: TallerSettings | null
  setSettings: (settings: TallerSettings | null) => void
  loginEmail: string
  planTipo: string
}

export function Notificaciones({ settings, setSettings, loginEmail, planTipo }: NotificacionesProps) {
  const isPro = planTipo === "activo"

  const handleToggle = useCallback(
    (key: AlertaKey, value: boolean) => {
      if (!settings) return
      const prev = settings
      setSettings({ ...settings, [key]: value })
      updateTallerSettings({ [key]: value }).then((res) => {
        if (res.error) {
          toast({ variant: "destructive", title: "No se guardo", description: res.error })
          setSettings(prev)
          return
        }
        toast({ title: "Guardado", description: "Preferencia de alerta actualizada." })
      })
    },
    [settings, setSettings],
  )

  const toggles: { key: AlertaKey; label: string; desc: string; checked: boolean }[] = [
    {
      key: "alertas_stock_bajo",
      label: "Inventario bajo",
      desc: "Aviso cuando productos esten por agotarse",
      checked: Boolean(settings?.alertas_stock_bajo),
    },
    {
      key: "reportes_cierre_caja",
      label: "Cierre de caja",
      desc: "Resumen diario de movimientos",
      checked: Boolean(settings?.reportes_cierre_caja),
    },
    {
      key: "alerta_urgentes",
      label: "Equipos sin movimiento",
      desc: "Reparaciones estancadas por mas de 3 dias",
      checked: Boolean(settings?.alerta_urgentes),
    },
  ]

  return (
    <div className="space-y-8">
      {/* Banner de PRO */}
      <div className="rounded-3xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-50 p-6 sm:p-8 shadow-sm ring-1 ring-amber-100">
        <div className="flex items-start gap-4">
          <div className="mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900 shadow-md">
            <BellRing className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-950 shadow-sm">
              Premium
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reportes y Alertas</h1>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Recibe notificaciones automaticas sobre inventario bajo, cierres de caja y equipos estancados. Mantente al tanto de la operacion de tu taller sin revisar el sistema constantemente, y toma decisiones informadas con reportes enviados directo a tu correo.
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
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
                {toggles.map((t) => (
                  <div key={t.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.label}</p>
                      <p className="text-xs text-slate-600">{t.desc}</p>
                    </div>
                    <Switch
                      checked={t.checked}
                      onCheckedChange={(value) => handleToggle(t.key, value)}
                    />
                  </div>
                ))}
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
    </div>
  )
}
