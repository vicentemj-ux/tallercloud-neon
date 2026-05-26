"use client"

import { useEffect, useState, useTransition, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  Store,
  BellRing,
  Sparkles,
  Printer,
  Cpu,
  Settings2,
} from "lucide-react"
import { getTallerSettings, updateTallerSettings, getTallerPlanType, type TallerSettings, type TallerPlanTipo } from "@/lib/actions/settings-prisma"
import { getOwnerLoginEmail, changeOwnerPassword } from "@/lib/actions/auth"
import { getAjustesTallerFlujoPro, updateAjustesTallerFlujoPro, type AjustesTallerFlujoPro } from "@/lib/actions/flujo-pro"
import { toast } from "@/hooks/use-toast"
import { Empresa } from "@/components/configuracion/Empresa"
import { Perfil } from "@/components/configuracion/Perfil"
import { Notificaciones } from "@/components/configuracion/Notificaciones"
import { FlujoPro } from "@/components/configuracion/FlujoPro"
import { Imprenta } from "@/components/configuracion/Imprenta"
import { Hardware } from "@/components/configuracion/Hardware"
import { ModuleHeader } from "@/components/dashboard/module-header"
import { ESTADOS_MEXICO, getPaisesNombres } from "@/lib/constants/paises"

type TimezoneOption = { value: string; city: string; country: string }
type TimezoneGroup = { label: string; options: TimezoneOption[] }

const TIMEZONE_GROUPS: TimezoneGroup[] = [
  {
    label: "Norteamérica",
    options: [
      { value: "America/Tijuana", city: "Tijuana", country: "México" },
      { value: "America/Hermosillo", city: "Hermosillo", country: "México" },
      { value: "America/Mazatlan", city: "Mazatlán", country: "México" },
      { value: "America/Mexico_City", city: "Ciudad de México", country: "México" },
      { value: "America/Monterrey", city: "Monterrey", country: "México" },
      { value: "America/New_York", city: "Nueva York", country: "Estados Unidos" },
    ],
  },
  {
    label: "Centroamérica",
    options: [
      { value: "America/Guatemala", city: "Ciudad de Guatemala", country: "Guatemala" },
      { value: "America/Costa_Rica", city: "San José", country: "Costa Rica" },
      { value: "America/Panama", city: "Ciudad de Panamá", country: "Panamá" },
    ],
  },
  {
    label: "Sudamérica",
    options: [
      { value: "America/Bogota", city: "Bogotá", country: "Colombia" },
      { value: "America/Lima", city: "Lima", country: "Perú" },
      { value: "America/Santiago", city: "Santiago", country: "Chile" },
      { value: "America/Argentina/Buenos_Aires", city: "Buenos Aires", country: "Argentina" },
    ],
  },
  {
    label: "Otros",
    options: [
      { value: "UTC", city: "UTC", country: "Universal" },
      { value: "Europe/Madrid", city: "Madrid", country: "España" },
    ],
  },
]

function formatTimezoneClock(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now).toLowerCase()
}

// ─── Tipos ─────────────────────────────────────────────────────────────────

type Tab = "taller" | "cuenta" | "alertas" | "flujo-pro" | "imprenta" | "hardware"
type FieldErrors = Partial<Record<keyof TallerSettings, string>>

// ─── Validación cliente ────────────────────────────────────────────────────

function validateSettings(s: TallerSettings): FieldErrors {
  const errors: FieldErrors = {}
  if (!s.nombre_taller || s.nombre_taller.trim().length < 3)
    errors.nombre_taller = "El nombre del taller es requerido (mínimo 3 caracteres)."
  const digits = s.telefono.replace(/\D/g, "")
  if (!digits) errors.telefono = "El teléfono del taller es requerido."
  else if (digits.length < 6 || digits.length > 15) errors.telefono = `El teléfono debe tener entre 6 y 15 dígitos (tiene ${digits.length}).`
  if (s.email_contacto?.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email_contacto.trim()))
      errors.email_contacto = "El formato del email no es válido."
  }
  if (!s.pais?.trim()) errors.pais = "Debes seleccionar un país."
  if (!s.ciudad?.trim()) errors.ciudad = "La ciudad es requerida."
  if (!s.estado?.trim()) errors.estado = "El estado es requerido."
  if (!s.zona_horaria?.trim()) errors.zona_horaria = "Selecciona la zona horaria del taller."
  const n = Number(s.siguiente_folio)
  if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) {
    errors.siguiente_folio = "Debe ser un entero mayor o igual a 1."
  }
  return errors
}

// ─── FieldWrap — FUERA del componente principal para no perder el foco ─────

function FieldWrap({
  field, label, errors, children,
}: {
  field: keyof TallerSettings
  label: string
  errors: FieldErrors
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold tracking-wide text-slate-600">{label}</Label>
      {children}
      {errors[field] && (
        <p className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {errors[field]}
        </p>
      )}
    </div>
  )
}

// ─── StatusBanner ──────────────────────────────────────────────────────────

function StatusBanner({ msg }: { msg: { type: "success" | "error"; text: string } | null }) {
  if (!msg) return null
  return (
    <div
      className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-medium border max-w-sm ${
        msg.type === "success"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {msg.type === "success"
        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      <span>{msg.text}</span>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

function ConfiguracionContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get("tab") as Tab | null
  
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const validTabs: Tab[] = ["taller", "cuenta", "alertas", "flujo-pro", "imprenta", "hardware"]
    return tabParam && validTabs.includes(tabParam) ? tabParam : "taller"
  })
  // Taller state
  const [settings, setSettings] = useState<TallerSettings | null>(null)
  const [planTipo, setPlanTipo] = useState<TallerPlanTipo>("prueba")
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [tallerMsg, setTallerMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [saving, startSaving] = useTransition()

  // Cuenta state
  const [loginEmail, setLoginEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Flujo PRO state
  const [ajustesFluJoPro, setAjustesFluJoPro] = useState<AjustesTallerFlujoPro | null>(null)
  const [loadingFluJoPro, setLoadingFluJoPro] = useState(false)
  const [pendingFluJoPro, startTransitionFluJoPro] = useTransition()

  const [loading, setLoading] = useState(true)
  const [clockNow, setClockNow] = useState<Date>(new Date())

  useEffect(() => {
    const interval = setInterval(() => setClockNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ settings: data }, owner, plan] = await Promise.all([
        getTallerSettings(),
        getOwnerLoginEmail(),
        getTallerPlanType(),
      ])
      if (data) {
        const merged: TallerSettings = {
          ...data,
          siguiente_folio:
            data.siguiente_folio != null && !Number.isNaN(Number(data.siguiente_folio))
              ? Math.max(1, Math.floor(Number(data.siguiente_folio)))
              : 1,
        }
        setSettings(merged)
        if (data.logo_url) setLogoPreview(data.logo_url)
      }
      if (!owner.error && owner.email) setLoginEmail(owner.email)
      setPlanTipo(plan)
      setLoading(false)
    }
    load()
  }, [])

  // Cargar ajustes de Flujo PRO cuando la pestaña esté activa
  useEffect(() => {
    if (activeTab !== "flujo-pro" || loadingFluJoPro) return
    const load = async () => {
      setLoadingFluJoPro(true)
      const { ajustes } = await getAjustesTallerFlujoPro()
      if (ajustes) {
        setAjustesFluJoPro(ajustes)
      }
      setLoadingFluJoPro(false)
    }
    load()
  }, [activeTab])

  // Función para actualizar ajustes de Flujo PRO
  const handlePatchFluJoPro = <K extends keyof AjustesTallerFlujoPro>(
    key: K,
    value: AjustesTallerFlujoPro[K]
  ) => {
    if (!ajustesFluJoPro) return
    const prevSnapshot = { ...ajustesFluJoPro }
    const next = { ...ajustesFluJoPro, [key]: value }
    setAjustesFluJoPro(next)
    startTransitionFluJoPro(async () => {
      const r = await updateAjustesTallerFlujoPro({ [key]: value })
      if (!r.success) {
        toast({ variant: "destructive", title: "No se guardó", description: r.error })
        setAjustesFluJoPro(prevSnapshot)
        return
      }
      toast({ title: "Guardado", description: "Reglas PRO actualizadas." })
    })
  }

  // ── Logo ────────────────────────────────────────────────────────────────
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !settings) return
    setLogoError(null)
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setLogoError("Solo se aceptan archivos JPG o PNG.")
      e.target.value = ""
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("El archivo supera el límite de 2MB.")
      e.target.value = ""
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setLogoPreview(result)
      setSettings({ ...settings, logo_url: result })
    }
    reader.readAsDataURL(file)
  }

  // ── Guardar taller ──────────────────────────────────────────────────────
  const handleSaveTaller = () => {
    if (!settings) {
      setTallerMsg({ type: "error", text: "Configuración no cargada." })
      return
    }
    if (!settings) return
    const errors = validateSettings(settings)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setTallerMsg({ type: "error", text: "Corrige los campos marcados antes de guardar." })
      return
    }
    setFieldErrors({})
    setTallerMsg(null)

    startSaving(async () => {
      const { error } = await updateTallerSettings({
        nombre_taller: settings.nombre_taller,
        direccion: settings.direccion,
        telefono: settings.telefono,
        email_contacto: settings.email_contacto,
        ciudad: settings.ciudad,
        estado: settings.estado,
        pais: settings.pais,
        zona_horaria: settings.zona_horaria ?? "UTC",
        terminos_garantia: settings.terminos_garantia,
        dias_garantia: Math.max(1, Math.min(365, Math.floor(Number(settings.dias_garantia) || 30))),
        mensaje_despedida: settings.mensaje_despedida?.trim() || undefined,
        logo_url: settings.logo_url ?? null,
        tamano_papel: settings.tamano_papel,
        label_size: settings.label_size ?? "2x1",
        alertas_stock_bajo: Boolean(settings.alertas_stock_bajo),
        reportes_cierre_caja: Boolean(settings.reportes_cierre_caja),
        alerta_urgentes: Boolean(settings.alerta_urgentes),
        siguiente_folio: Math.max(1, Math.floor(Number(settings.siguiente_folio) || 1)),
      })
      if (error) {
        setTallerMsg({ type: "error", text: `Error al guardar: ${error}` })
      } else {
        setTallerMsg({ type: "success", text: "Configuración guardada correctamente." })
        setTimeout(() => setTallerMsg(null), 3000)
      }
    })
  }

  // ── Cambiar contraseña ──────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setPasswordMsg({ type: "error", text: "Completa ambos campos." })
      return
    }
    setPasswordLoading(true)
    setPasswordMsg(null)
    const result = await changeOwnerPassword(currentPassword, newPassword)
    if (result.success) {
      setPasswordMsg({ type: "success", text: "Contraseña actualizada correctamente." })
      setCurrentPassword("")
      setNewPassword("")
    } else {
      setPasswordMsg({ type: "error", text: result.error || "No se pudo actualizar la contraseña." })
    }
    setPasswordLoading(false)
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando configuración de tu taller...
        </div>
      </div>
    )
  }

  // ── Tabs config ─────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "taller",  label: "Taller",    icon: <Store className="h-3.5 w-3.5" /> },
    { id: "cuenta",  label: "Mi Cuenta", icon: <User  className="h-3.5 w-3.5" /> },
    { id: "alertas", label: "Reportes y Alertas", icon: <BellRing className="h-3.5 w-3.5" /> },
    { id: "flujo-pro", label: "Flujo PRO", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "imprenta", label: "Imprenta", icon: <Printer className="h-3.5 w-3.5" /> },
    { id: "hardware", label: "Hardware", icon: <Cpu className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 flex flex-col gap-8">
        {/* Header */}
        <ModuleHeader
          icon={Settings2}
          title="CONFIGURACION"
          eyebrow="AJUSTES DEL NEGOCIO Y OPERACION"
          description="Administra tu taller, cuenta, alertas, impresion, hardware y flujo Pro."
          badge={tabs.find((tab) => tab.id === activeTab)?.label}
          actions={<StatusBanner msg={activeTab === "taller" ? tallerMsg : activeTab === "cuenta" ? passwordMsg : null} />}
        />

        {/* Tabs */}
        <div className="flex space-x-1 overflow-x-auto border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {/* ════ PESTAÑA TALLER ══════════════════════════════════════════════ */}
          {activeTab === "taller" && (
            <Empresa
              settings={settings}
              setSettings={setSettings}
              fieldErrors={fieldErrors}
              logoPreview={logoPreview}
              logoError={logoError}
              handleLogoChange={handleLogoChange}
              handleSaveTaller={handleSaveTaller}
              saving={saving}
              clockNow={clockNow}
              formatTimezoneClock={formatTimezoneClock}
              TIMEZONE_GROUPS={TIMEZONE_GROUPS}
              PAISES={getPaisesNombres()}
              ESTADOS_MEXICO={ESTADOS_MEXICO}
            />
          )}

          {/* ════ PESTAÑA MI CUENTA ═══════════════════════════════════════════ */}
          {activeTab === "cuenta" && (
            <Perfil
              loginEmail={loginEmail}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              handleChangePassword={handleChangePassword}
              passwordLoading={passwordLoading}
              passwordMsg={passwordMsg}
              settings={settings}
            />
          )}

          {/* ════ PESTAÑA REPORTES Y ALERTAS ═══════════════════════════════════ */}
          {activeTab === "alertas" && (
            <Notificaciones
              settings={settings}
              setSettings={setSettings}
              loginEmail={loginEmail}
            />
          )}

          {/* ════ PESTAÑA FLUJO PRO ═══════════════════════════════════════════ */}
          {activeTab === "flujo-pro" && (
            <FlujoPro
              loadingFluJoPro={loadingFluJoPro}
              ajustesFluJoPro={ajustesFluJoPro}
              planTipo={planTipo}
              pendingFluJoPro={pendingFluJoPro}
              handlePatchFluJoPro={handlePatchFluJoPro}
            />
          )}

          {/* ════ PESTAÑA IMPRENTA ════════════════════════════════════════════ */}
          {activeTab === "imprenta" && (
            <Imprenta settings={settings} />
          )}

          {/* ════ PESTAÑA HARDWARE ════════════════════════════════════════════ */}
          {activeTab === "hardware" && (
            <Hardware
              settings={settings}
              onSettingsUpdate={(patch) =>
                setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando configuración...
        </div>
      </div>
    }>
      <ConfiguracionContent />
    </Suspense>
  )
}
