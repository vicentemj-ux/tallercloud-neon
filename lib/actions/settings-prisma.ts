"use server"

import { getCurrentTenant } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import { getPublicUrl, sanitizeFileName, uploadFileToR2 } from "@/lib/r2"
import { decodeIfEncoded } from "@/lib/utils"

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
  logo_storage_key?: string | null
  pie_pagina: string
  terminos_garantia: string
  descripcion_publica: string
  tamano_papel: "80mm" | "58mm"
  label_size?: string | null
  alertas_stock_bajo?: boolean
  reportes_cierre_caja?: boolean
  alerta_urgentes?: boolean
  prefijo_folio?: string
  siguiente_folio?: number
  dias_garantia?: number
  mensaje_despedida?: string
  impresion_config?: Record<string, unknown> | null
  mostrar_precio_etiqueta?: boolean
  impresora_ticket?: string | null
  impresora_etiqueta?: string | null
  impresora_documento?: string | null
  facebook?: string | null
  instagram?: string | null
  tiktok?: string | null
  whatsapp?: string | null
}

export type TallerPlanTipo = "prueba" | "activo" | "suspendido"

function toSettings(row: Awaited<ReturnType<typeof getPrismaClient>>["configuracionTaller"] extends never ? never : any, tenantId: string): TallerSettings {
  return {
    id: row?.id ?? "",
    taller_id: tenantId,
    nombre_taller: decodeIfEncoded(row?.nombreComercial ?? "Mi Taller"),
    direccion: row?.direccion ?? "",
    telefono: row?.telefono ?? "",
    email_contacto: row?.emailContacto ?? "",
    ciudad: row?.ciudad ?? "",
    estado: row?.estado ?? "",
    pais: row?.pais ?? "Mexico",
    zona_horaria: row?.timezone ?? "UTC",
    logo_url: row?.logoUrl ?? null,
    logo_storage_key: row?.logoStorageKey ?? null,
    pie_pagina: "Gracias por su confianza",
    terminos_garantia: row?.terminosGarantia ?? "Garantia de 30 dias en reparaciones",
    descripcion_publica: "",
    tamano_papel: (row?.paperSize as "80mm" | "58mm") ?? "80mm",
    label_size: row?.labelSize ?? "2x1",
    alertas_stock_bajo: row?.alertasStockBajo ?? false,
    reportes_cierre_caja: row?.reportesCierreCaja ?? true,
    alerta_urgentes: row?.alertaUrgentes ?? false,
    prefijo_folio: row?.prefijoFolio ?? "REP",
    siguiente_folio: row?.siguienteFolio ?? 1,
    dias_garantia: row?.diasGarantia ?? 30,
    mensaje_despedida: row?.mensajeDespedida ?? "¡Gracias por confiar en nosotros!",
    impresion_config: (row?.printSettings as Record<string, unknown> | null) ?? {},
    mostrar_precio_etiqueta: true,
    impresora_ticket: null,
    impresora_etiqueta: null,
    impresora_documento: null,
    facebook: row?.facebook ?? null,
    instagram: row?.instagram ?? null,
    tiktok: row?.tiktok ?? null,
    whatsapp: row?.whatsapp ?? null,
  }
}

async function getTenantIdOrThrow() {
  const tenant = await getCurrentTenant()
  if (!tenant?.id) throw new Error("Sesion invalida")
  return tenant.id
}

function buildUpdatePayload(updates: Partial<TallerSettings>, logoUrl?: string | null, logoStorageKey?: string | null): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  if (updates.nombre_taller !== undefined) u.nombreComercial = updates.nombre_taller
  if (updates.direccion !== undefined) u.direccion = updates.direccion
  if (updates.telefono !== undefined) u.telefono = updates.telefono
  if (updates.email_contacto !== undefined) u.emailContacto = updates.email_contacto
  if (updates.ciudad !== undefined) u.ciudad = updates.ciudad
  if (updates.estado !== undefined) u.estado = updates.estado
  if (updates.pais !== undefined) u.pais = updates.pais
  if (updates.zona_horaria !== undefined) u.timezone = updates.zona_horaria
  if (logoUrl !== undefined) u.logoUrl = logoUrl ?? null
  if (logoStorageKey !== undefined) u.logoStorageKey = logoStorageKey ?? null
  if (updates.whatsapp !== undefined) u.whatsapp = updates.whatsapp
  if (updates.tamano_papel !== undefined) u.paperSize = updates.tamano_papel
  if (updates.label_size !== undefined) u.labelSize = updates.label_size
  if (updates.impresion_config !== undefined) u.printSettings = (updates.impresion_config as object | null) ?? {}
  if (updates.terminos_garantia !== undefined) u.terminosGarantia = updates.terminos_garantia
  if (updates.dias_garantia !== undefined) u.diasGarantia = updates.dias_garantia
  if (updates.mensaje_despedida !== undefined) u.mensajeDespedida = updates.mensaje_despedida
  if (updates.alertas_stock_bajo !== undefined) u.alertasStockBajo = updates.alertas_stock_bajo
  if (updates.reportes_cierre_caja !== undefined) u.reportesCierreCaja = updates.reportes_cierre_caja
  if (updates.alerta_urgentes !== undefined) u.alertaUrgentes = updates.alerta_urgentes
  if (updates.prefijo_folio !== undefined) u.prefijoFolio = updates.prefijo_folio
  if (updates.siguiente_folio !== undefined) u.siguienteFolio = updates.siguiente_folio
  if (updates.facebook !== undefined) u.facebook = updates.facebook
  if (updates.instagram !== undefined) u.instagram = updates.instagram
  if (updates.tiktok !== undefined) u.tiktok = updates.tiktok
  return u
}

function parseDataUrlImage(dataUrl: string): { bytes: Buffer; mimeType: string; ext: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!m) return null
  const mimeType = m[1]
  const base64 = m[2]
  const bytes = Buffer.from(base64, "base64")
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "webp"
  return { bytes, mimeType, ext }
}

export async function getTallerSettings() {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const row = await prisma.configuracionTaller.findUnique({ where: { tenantId } })
    return { settings: toSettings(row, tenantId), error: null as string | null }
  } catch (e) {
    console.error("[settings-prisma] getTallerSettings:", e)
    return { settings: null, error: "Error al cargar configuracion" }
  }
}

export async function updateTallerLogo(input: { dataUrl: string }) {
  try {
    const tenantId = await getTenantIdOrThrow()
    const parsed = parseDataUrlImage(input.dataUrl)
    if (!parsed) return { logoUrl: null, logoStorageKey: null, error: "Formato de logo invalido." }

    const ts = Date.now()
    const fileName = sanitizeFileName(`logo-${ts}.${parsed.ext}`)
    const key = `tenants/${tenantId}/branding/${fileName}`

    await uploadFileToR2({
      key,
      body: parsed.bytes,
      contentType: parsed.mimeType,
    })

    const logoUrl = getPublicUrl(key)
    return { logoUrl, logoStorageKey: key, error: null as string | null }
  } catch (e) {
    console.error("[settings-prisma] updateTallerLogo:", e)
    return { logoUrl: null, logoStorageKey: null, error: "No se pudo subir el logo." }
  }
}

export async function updateTallerSettings(updates: Partial<TallerSettings>) {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    // Candado: evitar que siguiente_folio se setee a un numero menor o igual
    // al folio maximo existente en reparaciones (evita duplicados).
    if (updates.siguiente_folio != null) {
      const maxFolioRow = await prisma.$queryRaw<Array<{ max_folio_num: number }>>`
        SELECT COALESCE(
          MAX(CAST(NULLIF(regexp_replace("folio", '[^0-9]', '', 'g'), '') AS INTEGER)),
          0
        ) AS max_folio_num
        FROM "Reparacion"
        WHERE "tenantId" = ${tenantId} AND "folio" IS NOT NULL AND "folio" != ''
      `
      const maxExisting = Number(maxFolioRow?.[0]?.max_folio_num ?? 0)
      if (updates.siguiente_folio <= maxExisting) {
        return {
          settings: null,
          error: `El folio debe ser mayor al ultimo registrado (${String(maxExisting).padStart(3, "0")}). No se puede retroceder.`,
        }
      }
    }

    let logoUrl = updates.logo_url
    let logoStorageKey = updates.logo_storage_key
    if (typeof updates.logo_url === "string" && updates.logo_url.startsWith("data:image")) {
      const up = await updateTallerLogo({ dataUrl: updates.logo_url })
      if (up.error) return { settings: null, error: up.error }
      logoUrl = up.logoUrl
      logoStorageKey = up.logoStorageKey
    }

    const row = await prisma.configuracionTaller.upsert({
      where: { tenantId },
      create: {
        tenantId,
        nombreComercial: updates.nombre_taller ?? "Mi Taller",
        direccion: updates.direccion ?? "",
        telefono: updates.telefono ?? "",
        emailContacto: updates.email_contacto ?? "",
        ciudad: updates.ciudad ?? "",
        estado: updates.estado ?? "",
        pais: updates.pais ?? "Mexico",
        timezone: updates.zona_horaria ?? "UTC",
        logoUrl: logoUrl ?? null,
        logoStorageKey: logoStorageKey ?? null,
        whatsapp: updates.whatsapp ?? null,
        paperSize: updates.tamano_papel ?? "80mm",
        labelSize: updates.label_size ?? "2x1",
        printSettings: (updates.impresion_config as object | null | undefined) ?? {},
        terminosGarantia: updates.terminos_garantia ?? "Garantia de 30 dias en reparaciones",
        diasGarantia: updates.dias_garantia ?? 30,
        mensajeDespedida: updates.mensaje_despedida ?? "¡Gracias por confiar en nosotros!",
        alertasStockBajo: updates.alertas_stock_bajo ?? false,
        reportesCierreCaja: updates.reportes_cierre_caja ?? true,
        alertaUrgentes: updates.alerta_urgentes ?? false,
        prefijoFolio: updates.prefijo_folio ?? "REP",
        siguienteFolio: updates.siguiente_folio ?? 1,
        facebook: updates.facebook ?? null,
        instagram: updates.instagram ?? null,
        tiktok: updates.tiktok ?? null,
      },
      update: buildUpdatePayload(updates, logoUrl, logoStorageKey),
    })

    return { settings: toSettings(row, tenantId), error: null as string | null }
  } catch (e) {
    console.error("[settings-prisma] updateTallerSettings:", e)
    return { settings: null, error: "No se pudo guardar configuracion." }
  }
}

export async function getTallerPlanType(): Promise<TallerPlanTipo> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, trialEndsAt: true },
    })
    if (!tenant) return "prueba"
    if (tenant.plan === "PRO") return "activo"
    if (tenant.trialEndsAt && tenant.trialEndsAt.getTime() < Date.now()) return "suspendido"
    return "prueba"
  } catch (e) {
    console.error("[settings-prisma] getTallerPlanType:", e)
    return "prueba"
  }
}

export async function getDashboardSubscriptionBannerContext(): Promise<{
  showBanner: boolean
  isPro: boolean
  diasRestantes: number
  tieneVencimiento: boolean
  planTipo: TallerPlanTipo
  precioPlanMensual: number | null
  zonaHoraria: string | null
}> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const [tenant, cfg] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, trialEndsAt: true, createdAt: true },
      }),
      prisma.configuracionTaller.findUnique({
        where: { tenantId },
        select: { timezone: true },
      }),
    ])
    const zonaHoraria = cfg?.timezone ?? null
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

    const trialEndsAt = tenant.trialEndsAt
    const tieneVencimiento = Boolean(trialEndsAt)
    const diasRestantes = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0
    const planTipo: TallerPlanTipo = diasRestantes > 0 ? "prueba" : "activo"

    if (planTipo === "prueba") {
      return {
        showBanner: true,
        isPro: true,
        diasRestantes,
        tieneVencimiento,
        planTipo,
        precioPlanMensual: null,
        zonaHoraria,
      }
    }

    return {
      showBanner: false,
      isPro: true,
      diasRestantes: 0,
      tieneVencimiento,
      planTipo: "activo",
      precioPlanMensual: null,
      zonaHoraria,
    }
  } catch (e) {
    console.error("[settings-prisma] getDashboardSubscriptionBannerContext:", e)
    return {
      showBanner: true,
      isPro: false,
      diasRestantes: 0,
      tieneVencimiento: false,
      planTipo: "prueba",
      precioPlanMensual: null,
      zonaHoraria: null,
    }
  }
}
