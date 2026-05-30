"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Camera,
  Cpu,
  Eye,
  Globe,
  Key,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  UserIcon,
  Wifi,
} from "lucide-react"
import { toast } from "sonner"
import { getCamaraConfig, updateCamaraConfig } from "@/lib/actions/bitacora-visitas-prisma"
import { getCurrentTallerIdPublic } from "@/lib/actions/bitacora-visitas-prisma"

interface CamaraHikvisionConfig {
  enabled: boolean
  mode: "snapshot" | "event"
  ip: string
  username: string
  password: string
}

export function Hardware() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tallerId, setTallerId] = useState<string | null>(null)
  const [config, setConfig] = useState<CamaraHikvisionConfig>({
    enabled: false,
    mode: "snapshot",
    ip: "",
    username: "",
    password: "",
  })

  useEffect(() => {
    getCurrentTallerIdPublic().then((id) => {
      setTallerId(id)
      if (!id) {
        setLoading(false)
        return
      }
      getCamaraConfig(id).then(({ config: c }) => {
        const hv = (c?.hikvision as CamaraHikvisionConfig) || {}
        setConfig({
          enabled: hv.enabled ?? false,
          mode: hv.mode ?? "snapshot",
          ip: hv.ip ?? "",
          username: hv.username ?? "",
          password: hv.password ?? "",
        })
        setLoading(false)
      })
    })
  }, [])

  async function handleSave() {
    if (!tallerId) return
    setSaving(true)
    const { success, error } = await updateCamaraConfig(tallerId, {
      hikvision: config,
    })
    setSaving(false)
    if (!success) {
      toast.error(error || "Error al guardar configuracion")
      return
    }
    toast.success("Configuracion de hardware guardada", {
      description: "Los cambios se aplicaran en la proxima deteccion",
    })
  }

  const isHikvision = config.mode === "event"

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-3xl border-2 border-slate-200 bg-gradient-to-r from-slate-50 to-slate-50/80 p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700 shadow-md">
            <Cpu className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hardware</h1>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Configuracion de dispositivos fisicos para deteccion automatica de visitas y captura de imagenes.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-hidden />
        </div>
      ) : !tallerId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <Lock className="mx-auto h-8 w-8 text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">Inicia sesion para configurar hardware</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Deteccion de visitas */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                    Deteccion de Visitas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Activa la captura automatica al detectar personas en la entrada
                  </p>
                </div>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(v) => setConfig((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            {config.enabled && (
              <>
                {/* Modo */}
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Modo de deteccion
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, mode: "snapshot", ip: "", username: "", password: "" }))}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        !isHikvision
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Camera className={`h-6 w-6 ${!isHikvision ? "text-blue-600" : "text-slate-400"}`} />
                      <span className={`text-xs font-bold ${!isHikvision ? "text-blue-700" : "text-slate-600"}`}>
                        Webcam local
                      </span>
                      <span className="text-[10px] text-slate-400 text-center">
                        Captura desde la camara de la computadora cada ~8 segundos
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, mode: "event" }))}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                        isHikvision
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <Wifi className={`h-6 w-6 ${isHikvision ? "text-blue-600" : "text-slate-400"}`} />
                      <span className={`text-xs font-bold ${isHikvision ? "text-blue-700" : "text-slate-600"}`}>
                        Camara IP (HIKVISION)
                      </span>
                      <span className="text-[10px] text-slate-400 text-center">
                        Deteccion por eventos de la camara IP en la red local
                      </span>
                    </button>
                  </div>
                </div>

                {/* HIKVISION settings */}
                {isHikvision && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                      <ShieldCheck className="h-4 w-4" />
                      Configuracion HIKVISION
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Direccion IP
                        </Label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            value={config.ip}
                            onChange={(e) => setConfig((prev) => ({ ...prev, ip: e.target.value }))}
                            placeholder="192.168.1.100"
                            className="pl-9 h-10 rounded-xl border-slate-200 bg-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Puerto
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">:</span>
                          <Input
                            value="80"
                            disabled
                            className="pl-7 h-10 rounded-xl border-slate-200 bg-slate-100 text-sm text-slate-400"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Usuario
                        </Label>
                        <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            value={config.username}
                            onChange={(e) => setConfig((prev) => ({ ...prev, username: e.target.value }))}
                            placeholder="admin"
                            className="pl-9 h-10 rounded-xl border-slate-200 bg-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Contrasena
                        </Label>
                        <div className="relative">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            type="password"
                            value={config.password}
                            onChange={(e) => setConfig((prev) => ({ ...prev, password: e.target.value }))}
                            placeholder="••••••••"
                            className="pl-9 h-10 rounded-xl border-slate-200 bg-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      La camara debe estar accesible desde la red local del taller. El sistema usara ISAPI para detectar eventos de movimiento.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info: modo manual siempre disponible */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <Camera className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Registro Manual
                </h3>
                <p className="text-xs text-slate-500">
                  Siempre disponible, incluso sin camara configurada
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pl-[52px]">
              Desde la Bitacora de Visitas puedes registrar entradas manualmente con proposito, nombre del cliente y telefono. El sistema usara un placeholder generico cuando no haya camara disponible.
            </p>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-xs btn-glow"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Guardar configuracion
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
