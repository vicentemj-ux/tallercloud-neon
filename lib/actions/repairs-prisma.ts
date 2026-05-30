"use server"

import { getCurrentTenant } from "@/lib/auth"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getPrismaClient } from "@/lib/prisma"
import {
  ensureChecklistIngreso,
  parseChecklistIngreso,
  checklistIngresoToJson,
  type ChecklistIngreso,
} from "@/lib/reparaciones/checklist-ingreso"
import type { ChecklistProData } from "@/lib/reparaciones/checklist-pro"
import type { SecurityTab } from "@/lib/reparaciones/security"
import { getGastosTicket, type ReparacionGasto } from "@/lib/actions/gastos-prisma"
import { getServiciosReparacion, type ReparacionServicio } from "@/lib/actions/servicios-prisma"
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

// ─── Historial de Reparación: Tipos ───────────────────────────────────────────

export type HistorialTipo =
  | "creacion"
  | "estado"
  | "abono"
  | "presupuesto"
  | "tecnico"
  | "otro"

export interface HistorialEntry {
  id: string
  tipo: HistorialTipo
  descripcion: string
  valorAnterior: string | null
  valorNuevo: string | null
  actorNombre: string | null
  nota: string | null
  createdAt: string
}

/**
 * Compatibilidad con el UI legacy. Representa un cambio de estado auditado.
 * Se deriva del modelo unificado HistorialReparacion filtrando tipo = "estado".
 */
export interface HistorialReparacionAuditRow {
  id: string
  estado_anterior: string | null
  estado_nuevo: string
  nota_tecnica: string | null
  fecha: string
  usuario_nombre: string
}

/**
 * Compatibilidad con el UI legacy. Representa un cambio genérico (presupuesto, abono, etc).
 * Se deriva del modelo unificado HistorialReparacion excluyendo tipo = "estado".
 */
export interface RepairChangeHistoryRow {
  id: string
  tipo_cambio: string
  descripcion: string
  created_at: string
  valor_anterior: string | null
  valor_nuevo: string | null
  usuario: string | null
}

// ─── Helpers de Historial (defensivos: nunca tumban el flujo principal) ───────

async function getTenantIdOrThrow() {
  const tenant = await getCurrentTenant()
  if (!tenant?.id) throw new Error("Sesion invalida")
  return tenant.id
}

/**
 * Registra una entrada en el historial de una reparación.
 * Regla MVP: si falla, solo loggea — nunca rechaza la operación principal.
 */
async function logHistorial(input: {
  reparacionId: string
  tenantId: string
  tipo: HistorialTipo
  descripcion: string
  valorAnterior?: string | null
  valorNuevo?: string | null
  nota?: string | null
}) {
  try {
    const prisma = getPrismaClient()
    const actorNombre = await getCurrentActorDisplayName()
    await prisma.historialReparacion.create({
      data: {
        tenantId: input.tenantId,
        reparacionId: input.reparacionId,
        tipo: input.tipo,
        descripcion: input.descripcion,
        valorAnterior: input.valorAnterior ?? null,
        valorNuevo: input.valorNuevo ?? null,
        actorNombre,
        nota: input.nota ?? null,
      },
    })
  } catch (err) {
    // Regla MVP: el historial es best-effort. No tumbar el flujo principal.
    console.error("[repairs-prisma] logHistorial failed (non-fatal):", err)
  }
}

// ─── Server Actions públicas de Historial ────────────────────────────────────

/**
 * Obtiene el historial de actividad de una reparación.
 * Orden cronológico descendente (más reciente primero).
 */
export async function getHistorialReparacion(reparacionId: string): Promise<HistorialEntry[]> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const rows = await prisma.historialReparacion.findMany({
      where: { reparacionId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id,
      tipo: r.tipo as HistorialTipo,
      descripcion: r.descripcion,
      valorAnterior: r.valorAnterior,
      valorNuevo: r.valorNuevo,
      actorNombre: r.actorNombre,
      nota: r.nota,
      createdAt: r.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error("[repairs-prisma] getHistorialReparacion:", err)
    return []
  }
}

/**
 * Obtiene el historial junto con el detalle de la reparación (para la vista de folio).
 * Devuelve la forma que el UI espera: `changes` + `historialAudit` derivados del
 * modelo unificado HistorialReparacion.
 */
export async function getRepairDetailPageData(repairId: string): Promise<{
  detail: RepairDetail | null
  historial: HistorialEntry[]
  changes: RepairChangeHistoryRow[]
  historialAudit: HistorialReparacionAuditRow[]
  gastos: ReparacionGasto[]
  servicios: ReparacionServicio[]
  error: string | null
}> {
  const { data: detail, error } = await getRepairDetail(repairId)
  if (!detail || error) {
    return { detail: null, historial: [], changes: [], historialAudit: [], gastos: [], servicios: [], error }
  }

  const [historial, gastosResult, serviciosResult] = await Promise.all([
    getHistorialReparacion(repairId),
    getGastosTicket(repairId),
    getServiciosReparacion(repairId),
  ])

  const historialAudit: HistorialReparacionAuditRow[] = historial
    .filter((h) => h.tipo === "estado")
    .map((h) => ({
      id: h.id,
      estado_anterior: h.valorAnterior,
      estado_nuevo: h.valorNuevo ?? "",
      nota_tecnica: h.nota,
      fecha: h.createdAt,
      usuario_nombre: h.actorNombre ?? "Sistema",
    }))

  const changes: RepairChangeHistoryRow[] = historial
    .filter((h) => h.tipo !== "estado")
    .map((h) => ({
      id: h.id,
      tipo_cambio: h.tipo,
      descripcion: h.descripcion,
      created_at: h.createdAt,
      valor_anterior: h.valorAnterior,
      valor_nuevo: h.valorNuevo,
      usuario: h.actorNombre,
    }))

  return {
    detail,
    historial,
    changes,
    historialAudit,
    gastos: gastosResult.error ? [] : gastosResult.data,
    servicios: serviciosResult.error ? [] : serviciosResult.data,
    error: null,
  }
}

/**
 * No-op: las tablas legacy ya no se usan. El historial se escribe en
 * HistorialReparacion vía Prisma. Se mantiene como stub para no romper
 * llamadas existentes durante la transición.
 */
async function ensureAuditTablesExist(): Promise<void> {
  // Las tablas legacy (historial_reparacion, cambios_reparaciones) ya no se necesitan.
  // Todo el historial se escribe en el modelo Prisma HistorialReparacion.
}

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

function normalizePhone(phone: string) {
  return onlyDigits(phone)
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
    clientePhone: onlyDigits(r.cliente?.telefono),
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
              checklistIngreso: input.checklistIngreso != null
                ? checklistIngresoToJson(input.checklistIngreso) as any
                : null,
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

      throw new Error("No se pudo reservar un folio unico para el tenant.")
    })

    const photoFailures: string[] = []
    if (input.photos?.length) {
      const prisma2 = getPrismaClient()
      const bucketName = getR2BucketName()
      const uploads = input.photos.map(async (dataUrl, i) => {
        if (!dataUrl?.startsWith("data:image")) {
          throw new Error(`Foto ${i + 1}: formato invalido`)
        }
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (!match) {
          throw new Error(`Foto ${i + 1}: data URL invalida`)
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
            // opcional; no depender de URL publica para TRACKING_VERIFIED
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

    const actorNombre = await getCurrentActorDisplayName()

    await logHistorial({
      reparacionId: result.id,
      tenantId,
      tipo: "creacion",
      descripcion: `EQUIPO RECIBIDO — ${input.tipo_equipo?.trim() || "Equipo"} ${input.deviceBrand.trim()} ${input.deviceModel.trim()} — Folio ${result.folio}`,
      valorNuevo: "Recibido",
      nota: `Recibido por ${actorNombre}`,
    })

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
    let checklistIngreso: ChecklistIngreso | null = null
    let checklistPro: ChecklistProData | null = null
    let creadoPorNombre: string | null = null

    checklistIngreso = parseChecklistIngreso(rep.checklistIngreso)

    try {
      const extra = await prisma.reparacion.findFirst({
        where: { id: repairId, tenantId },
        select: { checklistPro: true, creadoPorNombre: true },
      })
      if (extra) {
        checklistPro = extra.checklistPro as ChecklistProData | null
        creadoPorNombre = extra.creadoPorNombre
      }
    } catch (extraErr) {
      console.warn("getRepairDetail prisma extras:", extraErr)
    }

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
      checklistIngreso: ensureChecklistIngreso(rep.tipoEquipo ?? "Otro", checklistIngreso),
      checklistPro,
      creadoPorNombre,
    }
    return { data: detail, error: null }
  } catch (e) {
    console.error("getRepairDetail prisma:", e)
    return { data: null, error: "No se pudo cargar el detalle." }
  }
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
  checklistIngreso?: ChecklistIngreso | null
}) {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const phone = normalizePhone(input.customerPhone)
    const existing = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId },
      select: { id: true, clienteId: true },
    })
    if (!existing) return { success: false, error: "No se encontro la reparacion." }

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
          checklistIngreso: input.checklistIngreso !== undefined
            ? (input.checklistIngreso != null ? checklistIngresoToJson(input.checklistIngreso) as any : null)
            : undefined,
        },
      })
    })
    return { success: true }
  } catch (e) {
    console.error("updateRepairFull prisma:", e)
    return { success: false, error: "No se pudo actualizar la reparacion." }
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
    const actorNombre = await getCurrentActorDisplayName()
    const existing = await prisma.reparacion.findFirst({ where: { id: input.repairId, tenantId }, select: { id: true } })
    if (!existing) return { success: false, error: "No se encontro la reparacion." }
    await prisma.reparacion.update({ where: { id: input.repairId }, data: { estado: input.estadoNuevo } })

    const nota = input.notaTecnica?.trim() || null

    await logHistorial({
      reparacionId: input.repairId,
      tenantId,
      tipo: "estado",
      descripcion: `Estado: ${input.estadoAnterior || '?'} -> ${input.estadoNuevo}`,
      valorAnterior: input.estadoAnterior || null,
      valorNuevo: input.estadoNuevo,
      nota: nota,
    })

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
    return { technicians: [], error: "No se pudieron cargar tecnicos." }
  }
}

export interface RepairOrder {
  id: string
  folio: string
  customer: string
  phone: string
  device: string
  tipo_equipo: string
  status: "Recibido" | "Diagnostico" | "En Reparacion" | "Listo" | "Entregado"
  date: string
  problem: string
  price: string
  technician: string
}

export async function getReparacionesListas(): Promise<{ data: RepairOrder[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const rows = await prisma.reparacion.findMany({
      where: { tenantId, estado: "Listo" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        folio: true,
        cliente: { select: { nombre: true, telefono: true } },
        tipoEquipo: true,
        equipoMarca: true,
        equipoModelo: true,
        estado: true,
        createdAt: true,
        falla: true,
        costoEstimado: true,
        tecnico: true,
      },
      take: 500,
    })

    const data: RepairOrder[] = rows.map((r) => ({
      id: r.id,
      folio: r.folio,
      customer: r.cliente?.nombre ?? "Sin nombre",
      phone: r.cliente?.telefono ?? "",
      device: `${r.equipoMarca ?? ""} ${r.equipoModelo ?? ""}`.trim(),
      tipo_equipo: r.tipoEquipo ?? "",
      status: (r.estado as RepairOrder["status"]) || "Recibido",
      date: r.createdAt.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }),
      problem: r.falla ?? "",
      price: r.costoEstimado == null ? "Pendiente" : `$${Number(r.costoEstimado).toLocaleString("es-MX")}`,
      technician: r.tecnico ?? "Pendiente",
    }))

    return { data, error: null }
  } catch (e) {
    console.error("getReparacionesListas prisma:", e)
    return { data: [], error: "No se pudieron cargar las reparaciones listas." }
  }
}

export async function deleteRepair(repairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const row = await prisma.reparacion.findFirst({ where: { id: repairId, tenantId }, select: { id: true } })
    if (!row) return { success: false, error: "Reparacion no encontrada." }
    await prisma.reparacion.delete({ where: { id: repairId } })
    return { success: true }
  } catch (e) {
    console.error("deleteRepair prisma:", e)
    return { success: false, error: "No se pudo eliminar." }
  }
}

export async function getRepairByFolio(folio: string): Promise<{ data: RepairDetail | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const rep = await prisma.reparacion.findFirst({
      where: { folio, tenantId },
      include: { cliente: true },
    })
    if (!rep) return { data: null, error: "Reparacion no encontrada." }

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

    const checklistIngreso = parseChecklistIngreso(rep.checklistIngreso)

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
      checklistIngreso: ensureChecklistIngreso(rep.tipoEquipo ?? "Otro", checklistIngreso),
      checklistPro: null,
      creadoPorNombre: null,
    }
    return { data: detail, error: null }
  } catch (e) {
    console.error("getRepairByFolio prisma:", e)
    return { data: null, error: "No se pudo cargar la reparacion." }
  }
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export async function actualizarPresupuestoReparacion(
  repairId: string,
  nuevoPresupuesto: number,
  descripcion?: string
): Promise<{ success: boolean; nuevoPresupuesto?: number; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getTenantIdOrThrow()
    const rep = await prisma.reparacion.findFirst({
      where: { id: repairId, tenantId: tallerId },
      select: { costoEstimado: true },
    })
    if (!rep) return { success: false, error: "No se encontro la reparacion." }

    const prev = Number(rep.costoEstimado ?? 0)
    await prisma.reparacion.update({
      where: { id: repairId },
      data: { costoEstimado: nuevoPresupuesto },
    })

    await logHistorial({
      reparacionId: repairId,
      tenantId: tallerId,
      tipo: "presupuesto",
      descripcion: `${descripcion?.trim() || "Presupuesto actualizado"} - $${prev.toLocaleString("es-MX")} -> $${nuevoPresupuesto.toLocaleString("es-MX")}`,
      valorAnterior: String(prev),
      valorNuevo: String(nuevoPresupuesto),
    })

    return { success: true, nuevoPresupuesto }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo actualizar el presupuesto." }
  }
}

export async function registrarAbono(input: {
  repairId: string
  monto: number
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
}): Promise<{
  success: boolean
  error?: string
  nuevoAnticipo?: number
  saldoPendiente?: number
  liquidado?: boolean
  movimientoCajaId?: string | null
}> {
  try {
    if (!input.repairId) return { success: false, error: "ID de reparacion requerido." }
    if (!Number.isFinite(input.monto) || input.monto <= 0) return { success: false, error: "El monto debe ser mayor a cero." }

    const prisma = getPrismaClient()
    const tallerId = await getTenantIdOrThrow()
    const actor = await getCurrentActorDisplayName()

    const rep = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId: tallerId },
      select: { anticipo: true, costoEstimado: true, folio: true, estado: true },
    })
    if (!rep) return { success: false, error: "No se encontro la reparacion." }

    const cajaOpen = await prisma.caja.findFirst({
      where: { tenantId: tallerId, estado: "abierta" },
      orderBy: { fechaApertura: "desc" },
      select: { id: true },
    })
    const cajaId = cajaOpen?.id
    if (!cajaId) return { success: false, error: "No hay caja abierta. Abre caja en Punto de venta para registrar el cobro." }

    const current = Number(rep.anticipo ?? 0)
    const presupuesto = Number(rep.costoEstimado ?? 0)
    const nuevo = roundMoney(current + input.monto)
    const saldo = roundMoney(Math.max(0, presupuesto - nuevo))
    const liquidado = saldo <= 0.01 && presupuesto > 0

    await prisma.reparacion.update({
      where: { id: input.repairId },
      data: { anticipo: nuevo },
    })

    const movimiento = await prisma.movimientoCaja.create({
      data: {
        tenantId: tallerId,
        cajaId,
        tipo: "anticipo_reparacion",
        referenciaId: input.repairId,
        descripcion: `Abono reparacion #${rep.folio ?? ""}`,
        monto: input.monto,
        metodoPago: input.metodoPago,
        vendedorNombre: actor,
      },
    })

    await logHistorial({
      reparacionId: input.repairId,
      tenantId: tallerId,
      tipo: "abono",
      descripcion: `Abono registrado: +$${input.monto.toLocaleString("es-MX")} (${input.metodoPago})`,
      valorAnterior: String(current),
      valorNuevo: String(nuevo),
    })

    return { success: true, nuevoAnticipo: nuevo, saldoPendiente: saldo, liquidado, movimientoCajaId: movimiento.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al registrar abono" }
  }
}

export async function confirmarEntregaConLiquidacion(input: {
  repairId: string
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string }> {
  try {
    const total = roundMoney(Number(input.monto_efectivo || 0) + Number(input.monto_tarjeta || 0) + Number(input.monto_transferencia || 0))
    if (total > 0) {
      const metodo =
        input.metodoPago === "mixto"
          ? input.monto_efectivo >= input.monto_tarjeta && input.monto_efectivo >= input.monto_transferencia
            ? "efectivo"
            : input.monto_tarjeta >= input.monto_transferencia
              ? "tarjeta"
              : "transferencia"
          : input.metodoPago
      const ab = await registrarAbono({ repairId: input.repairId, monto: total, metodoPago: metodo as "efectivo" | "tarjeta" | "transferencia" })
      if (!ab.success) return { success: false, error: ab.error }
    }

    const prisma = getPrismaClient()
    const tallerId = await getTenantIdOrThrow()

    const existing = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId: tallerId },
      select: { estado: true },
    })
    const estadoAnterior = existing?.estado || "Listo"

    await prisma.reparacion.update({
      where: { id: input.repairId },
      data: { estado: "Entregado" },
    })

    await logHistorial({
      reparacionId: input.repairId,
      tenantId: tallerId,
      tipo: "estado",
      descripcion: `Estado: ${estadoAnterior} -> Entregado (liquidacion)`,
      valorAnterior: estadoAnterior,
      valorNuevo: "Entregado",
      nota: input.notaTecnica?.trim() || "Liquidacion y entrega",
    })

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo registrar la entrega." }
  }
}

export async function entregarSinReparacionConAjuste(input: {
  repairId: string
  costoRevision: number
  metodoPago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  metodoDevolucion?: "efectivo" | "transferencia"
  montoDevolucionEfectivo?: number
  montoDevolucionTransferencia?: number
  notaTecnica?: string | null
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getTenantIdOrThrow()

    const existing = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId: tallerId },
      select: { estado: true, costoEstimado: true },
    })
    const estadoAnterior = existing?.estado || "Recibido"
    const precioAnterior = existing?.costoEstimado != null ? Number(existing.costoEstimado) : 0

    await prisma.reparacion.update({
      where: { id: input.repairId },
      data: { costoEstimado: input.costoRevision, estado: "Entregado" },
    })

    await logHistorial({
      reparacionId: input.repairId,
      tenantId: tallerId,
      tipo: "estado",
      descripcion: `Estado: ${estadoAnterior} -> Entregado (sin reparacion)`,
      valorAnterior: estadoAnterior,
      valorNuevo: "Entregado",
      nota: input.notaTecnica?.trim() || "Entrega sin reparacion",
    })

    if (precioAnterior !== input.costoRevision) {
      await logHistorial({
        reparacionId: input.repairId,
        tenantId: tallerId,
        tipo: "presupuesto",
        descripcion: `Ajuste de presupuesto (sin reparacion): $${precioAnterior.toFixed(2)} -> $${input.costoRevision.toFixed(2)}`,
        valorAnterior: precioAnterior.toFixed(2),
        valorNuevo: input.costoRevision.toFixed(2),
      })
    }

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo ajustar y entregar." }
  }
}

export async function updateRepairChecklistPro(
  repairId: string,
  data: ChecklistProData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    await prisma.reparacion.update({
      where: { id: repairId, tenantId },
      data: { checklistPro: data as any },
    })
    await logHistorial({
      reparacionId: repairId,
      tenantId,
      tipo: "otro",
      descripcion: "Diagnostico PRO (health check) actualizado",
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar checklist Pro" }
  }
}

export async function updateRepairQuickNotes(
  repairId: string,
  data: { observacionesEsteticas?: string; notasInternas?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const rep = await prisma.reparacion.findFirst({
      where: { id: repairId, tenantId },
      select: { checklistIngreso: true },
    })
    if (!rep) return { success: false, error: "No se encontro la reparacion." }

    const updateData: Record<string, unknown> = {}
    if (data.observacionesEsteticas !== undefined) {
      const current = parseChecklistIngreso(rep.checklistIngreso) ?? {
        encendido: null,
        funcional: {},
        observacionesEsteticas: "",
      }
      updateData.checklistIngreso = checklistIngresoToJson({
        ...current,
        observacionesEsteticas: data.observacionesEsteticas,
      }) as any
    }
    if (data.notasInternas !== undefined) {
      updateData.notasInternas = data.notasInternas.trim() || null
    }
    if (Object.keys(updateData).length === 0) return { success: true }

    await prisma.reparacion.update({
      where: { id: repairId },
      data: updateData as any,
    })

    const logMsg: string[] = []
    if (data.observacionesEsteticas !== undefined) logMsg.push("observaciones esteticas")
    if (data.notasInternas !== undefined) logMsg.push("notas internas")
    await logHistorial({
      reparacionId: repairId,
      tenantId,
      tipo: "otro",
      descripcion: `${logMsg.join(" + ")} actualizadas`,
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar notas" }
  }
}

export async function getCancelacionSummary(repairId: string): Promise<{
  total: number
  movements: Array<{ id: string; tipo: string; monto: number; metodo_pago: string; caja_id: string | null }>
  error?: string
}> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const movements = await prisma.movimientoCaja.findMany({
      where: { referenciaId: repairId, tenantId, tipo: { in: ["anticipo_reparacion", "liquidacion_reparacion"] } },
      select: { id: true, tipo: true, monto: true, metodoPago: true, cajaId: true },
    })
    const total = movements.reduce((sum, m) => sum + Number(m.monto), 0)
    return {
      total,
      movements: movements.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        monto: Number(m.monto),
        metodo_pago: m.metodoPago ?? "efectivo",
        caja_id: m.cajaId,
      })),
    }
  } catch (e) {
    console.error("[getCancelacionSummary]", e)
    return { total: 0, movements: [], error: "Error inesperado" }
  }
}

export async function cancelarReparacion(repairId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    if (!tenantId) return { success: false, error: "Sin sesion activa." }

    const repair = await prisma.reparacion.findFirst({
      where: { id: repairId, tenantId },
      select: { id: true, estado: true, folio: true },
    })
    if (!repair) return { success: false, error: "Reparacion no encontrada." }

    const TERMINAL = ["Cancelado", "Sin Reparacion", "Entregado"]
    if (TERMINAL.includes(repair.estado)) {
      return { success: false, error: `No se puede cancelar una reparacion en estado "${repair.estado}".` }
    }

    const { movements } = await getCancelacionSummary(repairId)

    if (movements.length > 0) {
      const cajaOpen = await prisma.caja.findFirst({
        where: { tenantId, estado: "abierta" },
        orderBy: { fechaApertura: "desc" },
        select: { id: true },
      })
      if (!cajaOpen) return { success: false, error: "No hay caja abierta. Abre caja en Punto de venta para registrar devoluciones." }

      await prisma.movimientoCaja.createMany({
        data: movements.map((m) => ({
          tenantId,
          cajaId: cajaOpen.id,
          tipo: "devolucion_cancelacion",
          monto: -Math.abs(Number(m.monto)),
          metodoPago: m.metodo_pago,
          referenciaId: repairId,
          descripcion: `Devolucion por cancelacion de reparacion #${repair.folio}`,
        })),
      })
    }

    const gastosData = await prisma.gastoReparacion.findMany({
      where: { reparacionId: repairId, tenantId, tipo: "refaccion", productoId: { not: null } },
      select: { productoId: true },
    })

    for (const g of gastosData) {
      if (g.productoId) {
        await prisma.producto.update({
          where: { id: g.productoId },
          data: { stockActual: { increment: 1 } },
        }).catch((err) => console.warn("[cancelarReparacion] stock restore skip:", err))
      }
    }

    const result = await applyRepairStatusChange({
      repairId,
      estadoAnterior: repair.estado,
      estadoNuevo: "Cancelado",
      notaTecnica: "Reparacion cancelada con devolucion automatica.",
    })

    return result
  } catch (e) {
    console.error("[cancelarReparacion] fatal:", e)
    return { success: false, error: "Error inesperado al cancelar la reparacion." }
  }
}

export async function reactivarReingreso(input: {
  repairId: string
  motivo: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!input.repairId) return { success: false, error: "ID de reparacion requerido." }
    const motivo = input.motivo.trim()
    if (!motivo) return { success: false, error: "El motivo del reingreso es obligatorio." }
    if (motivo.length > 500) return { success: false, error: "El motivo no puede superar 500 caracteres." }

    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const repair = await prisma.reparacion.findFirst({
      where: { id: input.repairId, tenantId },
      select: { id: true, estado: true, folio: true },
    })
    if (!repair) return { success: false, error: "No se encontro la reparacion o no tienes acceso." }
    if (repair.estado !== "Entregado") {
      return { success: false, error: `Solo se pueden reactivar reparaciones con estatus "Entregado". Estado actual: ${repair.estado}.` }
    }

    await prisma.reparacion.update({
      where: { id: input.repairId },
      data: { estado: "Reingreso" },
    })

    await logHistorial({
      reparacionId: input.repairId,
      tenantId,
      tipo: "estado",
      descripcion: `Estado: Entregado -> Reingreso`,
      valorAnterior: "Entregado",
      valorNuevo: "Reingreso",
      nota: `Motivo: ${motivo}`,
    })

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg || "Error inesperado al reactivar el reingreso." }
  }
}

// ─── Tipo compartido para templates de impresión ─────────────────────────────

export interface RepairPrintData {
  id: string
  folio: string
  estado: string
  fecha_creacion: string
  fecha_entrega?: string | null
  cliente_nombre: string
  cliente_telefono: string
  tecnico?: string | null
  dispositivo_marca: string
  dispositivo_modelo: string
  tipo_equipo?: string | null
  imei_serie?: string | null
  color?: string | null
  falla_reportada: string
  precio_estimado?: number | null
  anticipo?: number | null
  costo_total?: number | null
  restante?: number | null
  notas_internas?: string | null
  pin_contrasena?: string | null
  fotos?: string[]
  checklist_ingreso?: ChecklistIngreso | null
  gastos: Array<{ descripcion: string; costo: number }>
}
