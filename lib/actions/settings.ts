"use server"
// LEGACY SUPABASE ACTIONS.
// No importar desde rutas MVP (usar settings-prisma.ts).
// Pendiente migracion completa de modulos legacy/PRO.

import { unstable_noStore } from "next/cache"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { createAdminClient } from "@/lib/supabase/admin"
import { calcDiasRestantes } from "@/lib/utils/subscription"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"
import { getTallerSettings as getTallerSettingsPrisma } from "@/lib/actions/settings-prisma"

const createClient = async () => (await createCurrentTenantClient()).supabase

export interface Technician {
  id: string
  nombre: string
  estatus: "Activo" | "Inactivo"
  created_at: string
}

export interface TallerSettings {
  id: string
  taller_id: string
  nombre_taller: string
  direccion: string
  telefono: string
  email_contacto: string
  ciudad: string
  estado: string
  pais: string
  zona_horaria?: string
  logo_url: string | null
  pie_pagina: string
  terminos_garantia: string
  descripcion_publica: string
  tamano_papel: "80mm" | "58mm"
  label_size?: string | null
  alertas_stock_bajo?: boolean
  reportes_cierre_caja?: boolean
  alerta_urgentes?: boolean
  /** Prefijo de folio de reparacion (ej. CDS, REP). Trigger concatena con numero. */
  prefijo_folio?: string
  /** Siguiente numero de folio (concurrencia con FOR UPDATE en trigger). */
  siguiente_folio?: number
  /** Nombre de impresora para tickets termicos */
  impresora_ticket?: string | null
  /** Nombre de impresora para etiquetas 2×1" */
  impresora_etiqueta?: string | null
  /** Nombre de impresora para documentos Carta/A4 */
  impresora_documento?: string | null
  /** Dias de garantia en reparaciones (default 30) */
  dias_garantia?: number
  /** Mensaje de despedida personalizado para tickets (estrategia publicitaria) */
  mensaje_despedida?: string
  /** Configuracion de impresion por tipo de documento (JSONB) */
  impresion_config?: Record<string, unknown> | null
  /** Mostrar precio en etiquetas de inventario (50×25 mm) */
  mostrar_precio_etiqueta?: boolean
  /** Redes sociales del taller */
  facebook?: string | null
  instagram?: string | null
  tiktok?: string | null
  whatsapp?: string | null
  /** Configuracion de camaras (webcam + Hikvision IP) (JSONB) */
  camara_config?: Record<string, unknown> | null
}

// Technicians - get all for current taller
export async function getTechnicians() {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("tecnicos")
    .select("*")
    .eq("taller_id", tallerId)
    .order("nombre", { ascending: true })

  if (error) {
    console.error("Error fetching technicians:", error)
    return { technicians: [], error: "Error al cargar tecnicos" }
  }

  return { technicians: data || [], error: null }
}

// Alias para compatibilidad
export async function getAllTechnicians() {
  return getTechnicians()
}

export async function createTechnician(nombre: string, estatus: string = "Activo") {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("tecnicos")
    .insert({ taller_id: tallerId, nombre, estatus })
    .select()
    .single()

  if (error) {
    console.error("Error creating technician:", error)
    return { technician: null, error: "No se pudo crear el tecnico" }
  }

  return { technician: data, error: null }
}

export async function updateTechnician(id: string, nombre: string, estatus: string) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("tecnicos")
    .update({ nombre, estatus })
    .eq("id", id)
    .eq("taller_id", tallerId)
    .select()
    .single()

  if (error) {
    console.error("Error updating technician:", error)
    return { technician: null, error: "No se pudo actualizar el tecnico" }
  }

  return { technician: data, error: null }
}

export async function deleteTechnician(id: string) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { error } = await supabase
    .from("tecnicos")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("Error deleting technician:", error)
    return { success: false, error: "No se pudo eliminar el tecnico" }
  }

  return { success: true, error: null }
}

// Settings
export async function getTallerSettings() {
  // Runtime-safe bridge: evita dependencia de Supabase env en modulos activos.
  return getTallerSettingsPrisma()
}

/** Plan de suscripcion del taller (PRO = `activo`). */
export type TallerPlanTipo = "prueba" | "activo" | "suspendido"

export async function getTallerPlanType(): Promise<TallerPlanTipo> {
  const tallerId = await getCurrentTallerId()
  const prisma = getPrismaClient()
  const tenant = await prisma.tenant.findUnique({
    where: { id: tallerId },
    select: { plan: true, trialEndsAt: true },
  })
  if (!tenant) return "prueba"

  const trialIso = tenant.trialEndsAt?.toISOString() ?? null
  const diasRestantesTrial = calcDiasRestantes(trialIso)
  if (diasRestantesTrial !== null && diasRestantesTrial > 0) return "prueba"

  return "activo"
}

/**
 * Reglas del banner en Vista General: visible en Trial, o PRO con vencimiento en ≤7 dias (o ya vencido).
 * PRO estable sin fecha de corte: oculto.
 * PERF: las dos queries (taller_users + configuracion_taller) corren en paralelo internamente.
 */
export async function getDashboardSubscriptionBannerContext(): Promise<{
  showBanner: boolean
  isPro: boolean
  /** Dias restantes hasta `fecha_vencimiento_plan`, normalizados a UTC (siempre ≥ 0). */
  diasRestantes: number
  /** true si el plan tiene fecha de vencimiento en la DB. */
  tieneVencimiento: boolean
  planTipo: TallerPlanTipo
  /** MXN/mes (189 = CORE, 299 = PRO). Null si legado o sin dato. */
  precioPlanMensual: number | null
  /** Zona horaria del taller — null si no configurada (usado para banner TZ en dashboard). */
  zonaHoraria: string | null
}> {
  unstable_noStore() // evita cache de request memoization; la suscripcion cambia en tiempo real

  const tallerId = await getCurrentTallerId()
  const prisma = getPrismaClient()
  const [tenant, configuracion] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tallerId },
      select: { plan: true, trialEndsAt: true, createdAt: true },
    }),
    prisma.configuracionTaller.findUnique({
      where: { tenantId: tallerId },
      select: { timezone: true },
    }),
  ])

  const zonaHoraria = configuracion?.timezone ?? null

  if (!tenant) {
    return {
      showBanner: true,
      isPro: false,
      diasRestantes: 0,
      tieneVencimiento: false,
      planTipo: "prueba",
      precioPlanMensual: null,
      zonaHoraria,
    }
  }

  const precioPlanMensual = null

  const fechaVenc = tenant.trialEndsAt?.toISOString() ?? null
  const diasDesdeVenc = calcDiasRestantes(fechaVenc)
  let planTipo: TallerPlanTipo = diasDesdeVenc !== null && diasDesdeVenc > 0 ? "prueba" : "activo"

  // Debug temporal: ayuda a diagnosticar discrepancias de suscripcion en produccion

  // calcDiasRestantes returns null when fechaVenc is null.
  // For prueba plans this means fecha_vencimiento_plan was never set (legacy accounts).
  // Fall back to created_at + 30-day trial window so the banner shows accurate days.
  let diasRestantes: number
  if (diasDesdeVenc !== null) {
    diasRestantes = diasDesdeVenc
  } else if (planTipo === "prueba") {
    const createdAt = tenant.createdAt?.toISOString() ?? null
    if (createdAt) {
      const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
      const createdUtc = new Date(createdAt)
      const startUtc = Date.UTC(createdUtc.getUTCFullYear(), createdUtc.getUTCMonth(), createdUtc.getUTCDate())
      const daysSince = Math.floor((todayUtc - startUtc) / (1000 * 60 * 60 * 24))
      diasRestantes = Math.max(0, 30 - daysSince)
    } else {
      diasRestantes = 0
    }
  } else {
    diasRestantes = 0
  }
  const tieneVencimiento = fechaVenc !== null

  if (planTipo === "prueba") {
    return {
      showBanner: true,
      isPro: diasRestantes > 0,
      diasRestantes,
      tieneVencimiento,
      planTipo: "prueba",
      precioPlanMensual,
      zonaHoraria,
    }
  }

  // activo = suscripcion pagada — ignora logica de trial
  if (!tieneVencimiento) {
    return {
      showBanner: false,
      isPro: true,
      diasRestantes: 0,
      tieneVencimiento: false,
      planTipo: "activo",
      precioPlanMensual,
      zonaHoraria,
    }
  }

  return {
    showBanner: diasRestantes <= 7,
    isPro: true,
    diasRestantes,
    tieneVencimiento: true,
    planTipo: "activo",
    precioPlanMensual,
    zonaHoraria,
  }
}

export async function updateTallerSettings(updates: Partial<TallerSettings>) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Validacion backend: el siguiente_folio no puede ser ≤ al folio maximo ya registrado.
  if (updates.siguiente_folio !== undefined) {
    const sigFolioNum = Math.max(1, Math.floor(Number(updates.siguiente_folio) || 1))
    const admin = await createAdminClient()
    const { data: foliosData, error: foliosErr } = await admin
      .from("reparaciones")
      .select("folio")
      .eq("taller_id", tallerId)

    if (!foliosErr && foliosData && foliosData.length > 0) {
      const maxFolioNum = Math.max(
        0,
        ...foliosData.map((r: { folio: string | null }) => {
          const n = parseInt(r.folio ?? "0", 10)
          return Number.isFinite(n) ? n : 0
        })
      )
      if (sigFolioNum <= maxFolioNum) {
        return {
          settings: null,
          error: `No puedes asignar un folio inicial menor o igual a los folios que ya tienes registrados (Folio actual: ${maxFolioNum})`,
        }
      }
    }
  }

  // Columnas explicitas para evitar enviar campos que no existen en la tabla.
  const payload: Record<string, unknown> = { taller_id: tallerId }
  if (updates.nombre_taller   !== undefined) payload.nombre_taller   = updates.nombre_taller
  if (updates.direccion       !== undefined) payload.direccion       = updates.direccion
  if (updates.telefono        !== undefined) payload.telefono        = updates.telefono
  if (updates.email_contacto  !== undefined) payload.email_contacto  = updates.email_contacto
  if (updates.ciudad          !== undefined) payload.ciudad          = updates.ciudad
  if (updates.estado          !== undefined) payload.estado          = updates.estado
  if (updates.pais            !== undefined) payload.pais            = updates.pais
  if (updates.zona_horaria    !== undefined) payload.zona_horaria    = updates.zona_horaria
  if (updates.logo_url        !== undefined) payload.logo_url        = updates.logo_url
  if (updates.pie_pagina      !== undefined) payload.pie_pagina      = updates.pie_pagina
  if (updates.terminos_garantia !== undefined) payload.terminos_garantia = updates.terminos_garantia
  if (updates.descripcion_publica !== undefined) payload.descripcion_publica = updates.descripcion_publica
  if (updates.tamano_papel    !== undefined) payload.tamano_papel    = updates.tamano_papel
  if (updates.label_size      !== undefined) payload.label_size      = updates.label_size
  if (updates.alertas_stock_bajo !== undefined) payload.alertas_stock_bajo = updates.alertas_stock_bajo
  if (updates.reportes_cierre_caja !== undefined) payload.reportes_cierre_caja = updates.reportes_cierre_caja
  if (updates.alerta_urgentes !== undefined) payload.alerta_urgentes = updates.alerta_urgentes
  if (updates.prefijo_folio !== undefined) payload.prefijo_folio = updates.prefijo_folio
  if (updates.siguiente_folio !== undefined) payload.siguiente_folio = updates.siguiente_folio
  if (updates.impresora_ticket    !== undefined) payload.impresora_ticket    = updates.impresora_ticket
  if (updates.impresora_etiqueta  !== undefined) payload.impresora_etiqueta  = updates.impresora_etiqueta
  if (updates.impresora_documento !== undefined) payload.impresora_documento = updates.impresora_documento
  if (updates.dias_garantia       !== undefined) payload.dias_garantia       = updates.dias_garantia
  if (updates.mensaje_despedida   !== undefined) payload.mensaje_despedida   = updates.mensaje_despedida
  if (updates.mostrar_precio_etiqueta !== undefined) payload.mostrar_precio_etiqueta = updates.mostrar_precio_etiqueta
  if (updates.impresion_config    !== undefined) payload.impresion_config    = updates.impresion_config
  if (updates.facebook            !== undefined) payload.facebook            = updates.facebook
  if (updates.instagram           !== undefined) payload.instagram           = updates.instagram
  if (updates.tiktok              !== undefined) payload.tiktok              = updates.tiktok
  if (updates.whatsapp            !== undefined) payload.whatsapp            = updates.whatsapp
  if (updates.camara_config       !== undefined) payload.camara_config       = updates.camara_config

  const { data, error } = await supabase
    .from("configuracion_taller")
    .upsert(payload, { onConflict: "taller_id" })
    .select()
    .single()

  if (error) {
    console.error("Error guardando configuracion:", JSON.stringify(error))
    return {
      settings: null,
      error: `Supabase: ${error.message} (codigo: ${error.code}${error.details ? ` · ${error.details}` : ""})`,
    }
  }

  return { settings: data, error: null }
}
