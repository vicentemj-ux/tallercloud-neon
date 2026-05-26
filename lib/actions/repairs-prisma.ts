"use server"

import { getCurrentTenant } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"
import type { ChecklistIngreso } from "@/lib/reparaciones/checklist-ingreso"
import type { ChecklistProData } from "@/lib/reparaciones/checklist-pro"
import type { SecurityTab } from "@/lib/reparaciones/security"
import type { ReparacionGasto } from "@/lib/actions/gastos"
import * as legacyRepairs from "@/lib/actions/repairs"
import {
  getPublicTrackPhotoKey,
  getR2BucketName,
  sanitizeFileName,
  uploadFileToR2,
} from "@/lib/r2"
import { getArchivoDisplayUrl } from "@/lib/archivo-url"
import { last4 as phoneLast4, onlyDigits } from "@/lib/phone"

type TxClient = Parameters<Parameters<ReturnType<typeof getPrismaClient>["$transaction"]>[0]>[0]
type ArchivoRow = { publicUrl: string | null; storageKey: string | null; key: string | null }
type TechnicianRow = { id: string; nombre: string | null }

function getPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  const maybeCode = (error as { code?: unknown }).code
  return typeof maybeCode === "string" ? maybeCode : null
}

export interface CreateRepairInput {
  folio?: string | null
  customerName: string
  customerPhone: string
  customerEmail?: string
  tipo_equipo?: string
  deviceBrand: string
  deviceModel: string
  deviceSerial?: string
  deviceColor?: string
  reportedFault: string
  estimatedPrice?: string
  deposit?: string
  clienteId?: string
  technician?: string
  pinContrasena?: string
  patronDesbloqueo?: string
  securityType?: string
  securityValue?: string
  notasInternas?: string
  checklistIngreso?: ChecklistIngreso | null
  checklistPro?: ChecklistProData | null
  checklist_pro?: unknown | null
  photos?: string[]
  metodoPagoAnticipo?: string | null
  servicios?: { servicio_id: string; cantidad?: number }[]
}

export interface BitacoraRepair {
  id: string
  folio: string
  clienteName: string
  clientePhone: string
  deviceBrand: string
  deviceModel: string
  tipo_equipo?: string | null
  estimatedPrice: number | null
  anticipo: number
  status: "Recibido" | "Diagnostico" | "En Reparacion" | "Listo" | "Entregado" | "Cancelado" | "Sin Reparacion" | "Reingreso"
  createdAt: string
  updatedAtRaw?: string | null
  tecnico?: string
  falla?: string | null
  securityType?: string | null
  securityValue?: string | null
  pinContrasena?: string | null
}

export interface RepairDetail extends Omit<BitacoraRepair, "status" | "securityType"> {
  status?: BitacoraRepair["status"]
  pinContrasena?: string | null
  patronDesbloqueo?: string | null
  securityType?: SecurityTab | null
  securityValue?: string | null
  fotos?: string[] | null
  fotosSignedUrls?: string[] | null
  falla?: string | null
  createdAtRaw?: string | null
  tipo_equipo?: string | null
  imei?: string | null
  color?: string | null
  clienteEmail?: string | null
  costoTotal?: number | null
  restante?: number | null
  creadoPorNombre?: string | null
  notasInternas?: string | null
  checklistIngreso?: ChecklistIngreso | null
  checklistPro?: ChecklistProData | null
}

export interface HistorialReparacionAuditRow {
  id: string
  estado_anterior: string | null
  estado_nuevo: string
  nota_tecnica: string | null
  fecha: string
  usuario_nombre: string
}

export type RepairChangeHistoryRow = {
  id: string
  tipo_cambio: string
  descripcion: string
  created_at: string
  valor_anterior?: string | null
  valor_nuevo?: string | null
  usuario?: string | null
}

function normalizePhone(phone: string) {
  return onlyDigits(phone)
}

async function getTenantIdOrThrow() {
  const tenant = await getCurrentTenant()
  if (!tenant?.id) throw new Error("Sesion invalida")
  return tenant.id
}

function asStatus(value?: string | null): BitacoraRepair["status"] {
  const v = (value ?? "").trim()
  if (
    v === "Recibido" ||
    v === "Diagnostico" ||
    v === "En Reparacion" ||
    v === "Listo" ||
    v === "Entregado" ||
    v === "Cancelado" ||
    v === "Sin Reparacion" ||
    v === "Reingreso"
  ) {
    return v
  }
  return "Recibido"
}

function toMxDate(d: Date) {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function toBitacoraRepair(r: {
  id: string
  folio: string
  estado: string
  tipoEquipo: string | null
  equipoMarca: string | null
  equipoModelo: string | null
  falla: string | null
  tecnico: string | null
  securityType: string | null
  securityValue: string | null
  pinContrasena: string | null
  costoEstimado: any
  anticipo: any
  createdAt: Date
  updatedAt: Date
  cliente: { nombre: string; telefono: string | null }
}): BitacoraRepair {
  return {
    id: r.id,
    folio: r.folio,
    clienteName: r.cliente?.nombre ?? "Sin nombre",
    clientePhone: r.cliente?.telefono ?? "",
    deviceBrand: r.equipoMarca ?? "N/A",
    deviceModel: r.equipoModelo ?? "N/A",
    tipo_equipo: r.tipoEquipo,
    estimatedPrice: r.costoEstimado == null ? null : Number(r.costoEstimado),
    anticipo: r.anticipo == null ? 0 : Number(r.anticipo),
    status: asStatus(r.estado),
    createdAt: toMxDate(r.createdAt),
    updatedAtRaw: r.updatedAt.toISOString(),
    tecnico: r.tecnico ?? "No asignado",
    falla: r.falla ?? null,
    securityType: r.securityType ?? null,
    securityValue: r.securityValue ?? null,
    pinContrasena: r.pinContrasena ?? null,
  }
}

export async function getNextFolio() {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const last = await prisma.reparacion.findMany({
      where: { tenantId },
      select: { folio: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    let maxNum = 0
    for (const row of last) {
      const n = Number(String(row.folio).replace(/\D/g, ""))
      if (Number.isFinite(n)) maxNum = Math.max(maxNum, n)
    }
    return { folio: String(maxNum + 1).padStart(3, "0"), error: null as string | null }
  } catch (e) {
    console.error("getNextFolio prisma:", e)
    return { folio: null, error: "No se pudo generar folio" }
  }
}

export async function searchClientByPhone(phone: string) {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const cleaned = normalizePhone(phone)
    const client = await prisma.cliente.findFirst({
      where: { tenantId, telefono: cleaned },
      select: { id: true, nombre: true, telefono: true, email: true },
    })
    if (!client) return { client: null, error: null }
    return {
      client: {
        id: client.id,
        nombre: client.nombre,
        telefono: client.telefono ?? "",
        correo: client.email ?? "",
      },
      error: null,
    }
  } catch (e) {
    console.error("searchClientByPhone prisma:", e)
    return { client: null, error: "Error al buscar cliente" }
  }
}

export async function createRepair(input: CreateRepairInput) {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const phone = normalizePhone(input.customerPhone)
    if (!input.customerName?.trim() || !phone || !input.deviceBrand?.trim() || !input.deviceModel?.trim() || !input.reportedFault?.trim()) {
      return { success: false, error: "Faltan campos requeridos." }
    }

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const nextFolioForTenant = async () => {
        const rows = await tx.$queryRaw<Array<{ max_folio_num: number }>>`
          SELECT COALESCE(
            MAX(CAST(NULLIF(regexp_replace("folio", '[^0-9]', '', 'g'), '') AS INTEGER)),
            0
          ) AS max_folio_num
          FROM "Reparacion"
          WHERE "tenantId" = ${tenantId}
        `
        const maxNum = Number(rows?.[0]?.max_folio_num ?? 0)
        return String(maxNum + 1).padStart(3, "0")
      }

      let clientId = input.clienteId?.trim() || ""
      if (clientId) {
        const existing = await tx.cliente.findFirst({ where: { id: clientId, tenantId }, select: { id: true } })
        if (!existing) clientId = ""
      }

      if (!clientId) {
        const existingByPhone = await tx.cliente.findFirst({
          where: { tenantId, telefono: phone },
          select: { id: true },
        })
        if (existingByPhone) {
          clientId = existingByPhone.id
          await tx.cliente.update({
            where: { id: existingByPhone.id },
            data: {
              nombre: input.customerName.trim(),
              email: input.customerEmail?.trim() || null,
            },
          })
        } else {
          const createdClient = await tx.cliente.create({
            data: {
              tenantId,
              nombre: input.customerName.trim(),
              telefono: phone,
              email: input.customerEmail?.trim() || null,
            },
          })
          clientId = createdClient.id
        }
      }

      let folio = input.folio?.trim() || ""
      for (let attempt = 0; attempt < 3; attempt++) {
        const folioCandidate = folio || (await nextFolioForTenant())
        try {
          const rep = await tx.reparacion.create({
            data: {
              tenantId,
              clienteId: clientId,
              folio: folioCandidate,
              estado: "Recibido",
              tipoEquipo: input.tipo_equipo?.trim() || "Celular",
              equipoMarca: input.deviceBrand.trim(),
              equipoModelo: input.deviceModel.trim(),
              numeroSerie: input.deviceSerial?.trim() || null,
              color: input.deviceColor?.trim() || null,
              falla: input.reportedFault.trim(),
              tecnico: input.technician?.trim() || "Sin asignar",
              costoEstimado: input.estimatedPrice?.trim() ? Number(input.estimatedPrice) : null,
              anticipo: input.deposit?.trim() ? Number(input.deposit) : null,
              securityType: input.securityType ?? null,
              securityValue: input.securityValue ?? null,
              pinContrasena: input.pinContrasena ?? null,
              patronDesbloqueo: input.patronDesbloqueo ?? null,
              notasInternas: input.notasInternas?.trim() || null,
            },
            select: { id: true, folio: true },
          })
          return rep
        } catch (err) {
          if (
            !folio &&
            getPrismaErrorCode(err) === "P2002" &&
            attempt < 2
          ) {
            continue
          }
          throw err
        }
      }

      throw new Error("No se pudo reservar un folio único para el tenant.")
    })

    const photoFailures: string[] = []
    if (input.photos?.length) {
      const prisma2 = getPrismaClient()
      const bucketName = getR2BucketName()
      const uploads = input.photos.map(async (dataUrl, i) => {
        if (!dataUrl?.startsWith("data:image")) {
          throw new Error(`Foto ${i + 1}: formato inválido`)
        }
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (!match) {
          throw new Error(`Foto ${i + 1}: data URL inválida`)
        }
        const mimeType = match[1]
        const base64 = match[2]
        const bytes = Buffer.from(base64, "base64")
        const ext = mimeType.includes("png")
          ? "png"
          : mimeType.includes("jpeg") || mimeType.includes("jpg")
          ? "jpg"
          : "webp"
        const archivoId = `${result.id}-${Date.now()}-${i + 1}`
        const fileName = sanitizeFileName(`foto-${i + 1}.${ext}`)
        const storageKey = getPublicTrackPhotoKey({
          tenantId,
          reparacionId: result.id,
          archivoId,
          fileName,
        })

        await uploadFileToR2({
          key: storageKey,
          body: bytes,
          contentType: mimeType,
        })

        await prisma2.archivo.create({
          data: {
            tenantId,
            reparacionId: result.id,
            tipo: "REPAIR_INTAKE_PHOTO",
            visibility: "TRACKING_VERIFIED",
            bucket: bucketName,
            key: storageKey,
            storageKey,
            // opcional; no depender de URL pública para TRACKING_VERIFIED
            publicUrl: null,
            fileName,
            mimeType,
            sizeBytes: bytes.length,
            size: bytes.length,
            sortOrder: i,
          },
        })
      })

      const settled = await Promise.allSettled(uploads)
      settled.forEach((r, idx) => {
        if (r.status === "rejected") {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
          photoFailures.push(`Foto ${idx + 1}: ${reason}`)
        }
      })
      if (photoFailures.length > 0) {
        console.error("createRepair prisma photos failures:", photoFailures)
      }
    }

    return {
      success: true,
      repairId: result.id,
      folio: result.folio,
      photoSummary: {
        total: input.photos?.length ?? 0,
        failed: photoFailures.length,
        failures: photoFailures,
      },
    }
  } catch (e) {
    console.error("createRepair prisma:", e)
    const prismaCode = getPrismaErrorCode(e)
    if (prismaCode) {
      if (prismaCode === "P2002") {
        return { success: false, error: "Folio duplicado detectado. Intenta de nuevo." }
      }
      return {
        success: false,
        error: `Prisma ${prismaCode}: ${e instanceof Error ? e.message : "Error desconocido"}`,
      }
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "No se pudo crear la reparacion.",
    }
  }
}

export const crearReparacion = createRepair

export async function getRepairsByTallerId(
  page = 0,
  pageSize = 50,
  search?: string,
  estatusFilter?: string,
): Promise<{ data: BitacoraRepair[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const where: any = { tenantId }
    if (estatusFilter) where.estado = estatusFilter
    if (search?.trim()) {
      const term = search.trim()
      where.OR = [
        { folio: { contains: term, mode: "insensitive" } },
        { equipoMarca: { contains: term, mode: "insensitive" } },
        { equipoModelo: { contains: term, mode: "insensitive" } },
        { cliente: { nombre: { contains: term, mode: "insensitive" } } },
        { cliente: { telefono: { contains: normalizePhone(term) } } },
      ]
    }
    const [rows, total] = await Promise.all([
      prisma.reparacion.findMany({
        where,
        include: { cliente: { select: { nombre: true, telefono: true } } },
        orderBy: { createdAt: "desc" },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.reparacion.count({ where }),
    ])
    return { data: rows.map(toBitacoraRepair), error: null, total }
  } catch (e) {
    console.error("getRepairsByTallerId prisma:", e)
    return { data: [], error: "No se pudieron cargar las reparaciones.", total: 0 }
  }
}

export async function getRepairDetail(repairId: string): Promise<{ data: RepairDetail | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const rep = await prisma.reparacion.findFirst({
      where: { id: repairId, tenantId },
      include: { cliente: true },
    })
    if (!rep) return { data: null, error: null }
    const estimated = rep.costoEstimado == null ? null : Number(rep.costoEstimado)
    const anticipo = rep.anticipo == null ? 0 : Number(rep.anticipo)
    const archivos = await prisma.archivo.findMany({
      where: {
        tenantId,
        reparacionId: rep.id,
        visibility: "TRACKING_VERIFIED",
        tipo: "REPAIR_INTAKE_PHOTO",
      },
      orderBy: { createdAt: "asc" },
      select: { publicUrl: true, storageKey: true, key: true },
    })
    const fotos = archivos
      .map((a: ArchivoRow) => getArchivoDisplayUrl(a))
      .filter((u: string | null | undefined): u is string => Boolean(u))
    const detail: RepairDetail = {
      ...toBitacoraRepair({ ...rep, cliente: { nombre: rep.cliente.nombre, telefono: rep.cliente.telefono } }),
      status: asStatus(rep.estado),
      securityType:
        rep.securityType === "none" || rep.securityType === "pin" || rep.securityType === "password" || rep.securityType === "pattern"
          ? rep.securityType
          : null,
      securityValue: rep.securityValue ?? null,
      createdAtRaw: rep.createdAt.toISOString(),
      clienteEmail: rep.cliente.email ?? null,
      imei: rep.numeroSerie ?? null,
      color: rep.color ?? null,
      tipo_equipo: rep.tipoEquipo ?? null,
      pinContrasena: rep.pinContrasena ?? null,
      patronDesbloqueo: rep.patronDesbloqueo ?? null,
      fotos,
      fotosSignedUrls: fotos,
      falla: rep.falla ?? null,
      costoTotal: estimated,
      restante: estimated == null ? null : Math.max(0, estimated - anticipo),
      notasInternas: rep.notasInternas ?? null,
      checklistIngreso: null,
      checklistPro: null,
      creadoPorNombre: null,
    }
    return { data: detail, error: null }
  } catch (e) {
    console.error("getRepairDetail prisma:", e)
    return { data: null, error: "No se pudo cargar el detalle." }
  }
}

export async function getRepairDetailPageData(repairId: string): Promise<{
  detail: RepairDetail | null
  changes: RepairChangeHistoryRow[]
  gastos: ReparacionGasto[]
  historialAudit: HistorialReparacionAuditRow[]
  servicios: import("@/lib/actions/servicios").ReparacionServicio[]
  error: string | null
}> {
  const { data, error } = await getRepairDetail(repairId)
  return { detail: data, changes: [], gastos: [], historialAudit: [], servicios: [], error }
}

export async function getTrackingTallerInfo(ticketId: string): Promise<{ name: string; logoUrl: string | null; telefono: string | null; whatsapp: string | null } | null> {
  if (!ticketId) return null
  try {
    const prisma = getPrismaClient()
    const rep = await prisma.reparacion.findUnique({
      where: { id: ticketId },
      select: {
        tenant: {
          select: {
            nombre: true,
            configuracion: {
              select: {
                nombreComercial: true,
                logoUrl: true,
                telefono: true,
                whatsapp: true,
              },
            },
          },
        },
      },
    })
    if (!rep?.tenant?.nombre) return null
    return {
      name: rep.tenant.configuracion?.nombreComercial?.trim() || rep.tenant.nombre,
      logoUrl: rep.tenant.configuracion?.logoUrl ?? null,
      telefono: rep.tenant.configuracion?.telefono ?? null,
      whatsapp: rep.tenant.configuracion?.whatsapp ?? null,
    }
  } catch (e) {
    console.error("getTrackingTallerInfo prisma:", e)
    return null
  }
}

export async function getTrackingPhotoUrls(ticketId: string, last4: string): Promise<string[]> {
  if (!ticketId || !last4 || last4.length !== 4) return []
  try {
    const expectedLast4 = onlyDigits(last4).slice(-4)
    if (expectedLast4.length !== 4) return []
    const prisma = getPrismaClient()
    const rep = await prisma.reparacion.findUnique({
      where: { id: ticketId },
      include: {
        cliente: { select: { telefono: true } },
        archivos: {
          where: {
            visibility: "TRACKING_VERIFIED",
            tipo: "REPAIR_INTAKE_PHOTO",
          },
          orderBy: { sortOrder: "asc" },
          select: { publicUrl: true, storageKey: true, key: true },
        },
      },
    })
    if (!rep) return []
    if (phoneLast4(rep.cliente?.telefono) !== expectedLast4) return []
    return rep.archivos
      .map((a: ArchivoRow) => getArchivoDisplayUrl(a))
      .filter((u: string | null | undefined): u is string => Boolean(u))
  } catch (e) {
    console.error("getTrackingPhotoUrls prisma:", e)
    return []
  }
}

export async function updateRepairFull(input: {
  repairId: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  clienteId?: string
  tipo_equipo?: string
  deviceBrand: string
  deviceModel: string
  deviceSerial?: string
  deviceColor?: string
  reportedFault: string
  estimatedPrice?: string
  technician?: string
  pinContrasena?: string
  patronDesbloqueo?: string
  securityType?: string
  securityValue?: string
  newPhotos?: string[]
  removedPhotos?: string[]
  keptPhotos?: string[]
  notasInternas?: string
}) {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const phone = normalizePhone(input.customerPhone)
    const existing = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId },
      select: { id: true, clienteId: true },
    })
    if (!existing) return { success: false, error: "No se encontró la reparación." }

    await prisma.$transaction(async (tx: TxClient) => {
      let clientId = input.clienteId?.trim() || existing.clienteId
      if (input.clienteId?.trim()) {
        const c = await tx.cliente.findFirst({ where: { id: input.clienteId.trim(), tenantId }, select: { id: true } })
        if (!c) clientId = existing.clienteId
      } else {
        const byPhone = await tx.cliente.findFirst({ where: { tenantId, telefono: phone }, select: { id: true } })
        if (byPhone) clientId = byPhone.id
      }
      await tx.cliente.update({
        where: { id: clientId },
        data: { nombre: input.customerName.trim(), telefono: phone, email: input.customerEmail?.trim() || null },
      })
      await tx.reparacion.update({
        where: { id: input.repairId },
        data: {
          clienteId: clientId,
          tipoEquipo: input.tipo_equipo?.trim() || null,
          equipoMarca: input.deviceBrand.trim(),
          equipoModelo: input.deviceModel.trim(),
          numeroSerie: input.deviceSerial?.trim() || null,
          color: input.deviceColor?.trim() || null,
          falla: input.reportedFault.trim(),
          tecnico: input.technician?.trim() || null,
          costoEstimado: input.estimatedPrice?.trim() ? Number(input.estimatedPrice) : null,
          securityType: input.securityType ?? null,
          securityValue: input.securityValue ?? null,
          pinContrasena: input.pinContrasena ?? null,
          patronDesbloqueo: input.patronDesbloqueo ?? null,
          notasInternas: input.notasInternas?.trim() || null,
        },
      })
    })
    return { success: true }
  } catch (e) {
    console.error("updateRepairFull prisma:", e)
    return { success: false, error: "No se pudo actualizar la reparación." }
  }
}

export async function applyRepairStatusChange(input: {
  repairId: string
  estadoAnterior: string
  estadoNuevo: string
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const existing = await prisma.reparacion.findFirst({ where: { id: input.repairId, tenantId }, select: { id: true } })
    if (!existing) return { success: false, error: "No se encontró la reparación." }
    await prisma.reparacion.update({ where: { id: input.repairId }, data: { estado: input.estadoNuevo } })
    return { success: true }
  } catch (e) {
    console.error("applyRepairStatusChange prisma:", e)
    return { success: false, error: "No se pudo actualizar el estado." }
  }
}

export const updateRepairStatus = applyRepairStatusChange

export async function getAllActiveTechnicians() {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const users = await prisma.user.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
      take: 100,
    })
    const technicians = users.map((u: TechnicianRow) => ({ id: u.id, nombre: u.nombre || "Sin nombre" }))
    return { technicians, error: null as string | null }
  } catch (e) {
    console.error("getAllActiveTechnicians prisma:", e)
    return { technicians: [], error: "No se pudieron cargar técnicos." }
  }
}

export async function deleteRepair(repairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const row = await prisma.reparacion.findFirst({ where: { id: repairId, tenantId }, select: { id: true } })
    if (!row) return { success: false, error: "Reparación no encontrada." }
    await prisma.reparacion.delete({ where: { id: repairId } })
    return { success: true }
  } catch (e) {
    console.error("deleteRepair prisma:", e)
    return { success: false, error: "No se pudo eliminar." }
  }
}

export async function updateRepairChecklistPro(...args: Parameters<typeof legacyRepairs.updateRepairChecklistPro>) {
  return legacyRepairs.updateRepairChecklistPro(...args)
}
export async function updateRepairQuickNotes(...args: Parameters<typeof legacyRepairs.updateRepairQuickNotes>) {
  return legacyRepairs.updateRepairQuickNotes(...args)
}
export async function getCancelacionSummary(...args: Parameters<typeof legacyRepairs.getCancelacionSummary>) {
  return legacyRepairs.getCancelacionSummary(...args)
}
export async function cancelarReparacion(...args: Parameters<typeof legacyRepairs.cancelarReparacion>) {
  return legacyRepairs.cancelarReparacion(...args)
}
export async function reactivarReingreso(...args: Parameters<typeof legacyRepairs.reactivarReingreso>) {
  return legacyRepairs.reactivarReingreso(...args)
}
