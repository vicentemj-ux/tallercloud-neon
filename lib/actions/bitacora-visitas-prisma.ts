"use server"

import { revalidatePath } from "next/cache"
import { getCurrentTenant } from "@/lib/auth"
import { getPrismaClient } from "@/lib/prisma"

export interface BitacoraVisita {
  id: string
  taller_id: string
  fecha_hora_entrada: string
  fecha_hora_salida: string | null
  foto_entrada_url: string | null
  foto_salida_url: string | null
  camara_ip: string | null
  evento_tipo: string | null
  motivo_visita: string | null
  motivo_otro: string | null
  estado_atencion: "pendiente" | "atendido" | "no_atendido" | "se_fue"
  reparacion_folio: string | null
  venta_folio: string | null
  atendido_por: string | null
  notas: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  created_at: string
  updated_at: string
}

export type MotivoVisita =
  | "reparacion"
  | "cotizacion"
  | "compra"
  | "venta"
  | "recoger"
  | "personal"
  | "otro"

function mapVisita(v: {
  id: string
  tenantId: string
  fechaLlegada: Date
  fechaSalida: Date | null
  fotoEntradaUrl: string | null
  fotoSalidaUrl: string | null
  camaraIp: string | null
  eventoTipo: string | null
  motivo: string | null
  motivoOtro: string | null
  estado: string
  reparacionFolio: string | null
  ventaFolio: string | null
  atendidoPor: string | null
  notas: string | null
  clienteNombre: string | null
  clienteTelefono: string | null
  createdAt: Date
  updatedAt: Date
}): BitacoraVisita {
  return {
    id: v.id,
    taller_id: v.tenantId,
    fecha_hora_entrada: v.fechaLlegada.toISOString(),
    fecha_hora_salida: v.fechaSalida?.toISOString() ?? null,
    foto_entrada_url: v.fotoEntradaUrl,
    foto_salida_url: v.fotoSalidaUrl,
    camara_ip: v.camaraIp,
    evento_tipo: v.eventoTipo,
    motivo_visita: v.motivo,
    motivo_otro: v.motivoOtro,
    estado_atencion: (v.estado as BitacoraVisita["estado_atencion"]),
    reparacion_folio: v.reparacionFolio,
    venta_folio: v.ventaFolio,
    atendido_por: v.atendidoPor,
    notas: v.notas,
    cliente_nombre: v.clienteNombre,
    cliente_telefono: v.clienteTelefono,
    created_at: v.createdAt.toISOString(),
    updated_at: v.updatedAt.toISOString(),
  }
}

async function getTenantIdOrThrow() {
  const tenant = await getCurrentTenant()
  if (!tenant?.id) throw new Error("Sesion invalida")
  return tenant.id
}

export async function getVisitas(params: {
  tallerId: string
  estado?: "pendiente" | "atendido" | "no_atendido" | "se_fue"
  desde?: string
  hasta?: string
  limite?: number
}): Promise<{ data: BitacoraVisita[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const where: Record<string, unknown> = { tenantId: params.tallerId }

    if (params.estado) where.estado = params.estado
    if (params.desde) where.fechaLlegada = { ...(where.fechaLlegada as object || {}), gte: new Date(params.desde) }
    if (params.hasta) where.fechaLlegada = { ...(where.fechaLlegada as object || {}), lte: new Date(params.hasta) }

    const rows = await prisma.visita.findMany({
      where: where as any,
      orderBy: { fechaLlegada: "desc" },
      take: params.limite,
    })

    return { data: rows.map(mapVisita), error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Error al cargar visitas" }
  }
}

export async function getVisitasPendientesCount(
  tallerId: string
): Promise<{ count: number; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const count = await prisma.visita.count({
      where: { tenantId: tallerId, estado: "pendiente" },
    })
    return { count, error: null }
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : "Error al contar visitas" }
  }
}

export async function responderEncuestaVisita(params: {
  visitaId: string
  motivoVisita: MotivoVisita
  motivoOtro?: string
  notas?: string
  atendidoPor: string
  reparacionFolio?: string
  ventaFolio?: string
  clienteNombre?: string
  clienteTelefono?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    await prisma.visita.update({
      where: { id: params.visitaId },
      data: {
        motivo: params.motivoVisita,
        motivoOtro: params.motivoOtro || null,
        estado: "atendido",
        atendidoPor: params.atendidoPor,
        notas: params.notas || null,
        reparacionFolio: params.reparacionFolio || null,
        ventaFolio: params.ventaFolio || null,
        clienteNombre: params.clienteNombre || null,
        clienteTelefono: params.clienteTelefono || null,
      },
    })

    revalidatePath("/dashboard")
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al responder encuesta" }
  }
}

export async function marcarVisitaSalida(params: {
  visitaId: string
  fotoSalidaUrl?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    await prisma.visita.update({
      where: { id: params.visitaId },
      data: {
        estado: "se_fue",
        fechaSalida: new Date(),
        fotoSalidaUrl: params.fotoSalidaUrl || null,
      },
    })

    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al marcar salida" }
  }
}

export async function verificarVisitasPendientesCierre(
  tallerId: string,
  fechaAperturaCaja: string
): Promise<{
  puedeCerrar: boolean
  visitasPendientes: number
  error: string | null
}> {
  try {
    const prisma = getPrismaClient()
    const count = await prisma.visita.count({
      where: {
        tenantId: tallerId,
        estado: "pendiente",
        fechaLlegada: { gte: new Date(fechaAperturaCaja) },
      },
    })

    return {
      puedeCerrar: count === 0,
      visitasPendientes: count,
      error: null,
    }
  } catch (e) {
    return { puedeCerrar: false, visitasPendientes: 0, error: e instanceof Error ? e.message : "Error al verificar visitas pendientes" }
  }
}

export async function getCurrentTallerIdPublic(): Promise<string | null> {
  try {
    const tenant = await getCurrentTenant()
    return tenant?.id ?? null
  } catch {
    return null
  }
}

export async function registrarVisitaManual(params: {
  motivoVisita: string
  motivoOtro?: string
  notas?: string
  clienteNombre?: string
  clienteTelefono?: string
}): Promise<{ success: boolean; error: string | null; visita: BitacoraVisita | null }> {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant?.id) return { success: false, error: "Sesion invalida", visita: null }

    const prisma = getPrismaClient()
    const created = await prisma.visita.create({
      data: {
        tenantId: tenant.id,
        eventoTipo: "manual",
        estado: "pendiente",
        motivo: params.motivoVisita,
        motivoOtro: params.motivoOtro || null,
        notas: params.notas || null,
        clienteNombre: params.clienteNombre || null,
        clienteTelefono: params.clienteTelefono || null,
      },
    })

    revalidatePath("/dashboard")
    return { success: true, error: null, visita: mapVisita(created) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al registrar visita", visita: null }
  }
}

export async function getCamaraConfig(tallerId: string): Promise<{
  config: Record<string, unknown> | null
  error: string | null
}> {
  try {
    const prisma = getPrismaClient()
    const row = await prisma.configuracionTaller.findUnique({
      where: { tenantId: tallerId },
      select: { camaraConfig: true },
    })

    return { config: (row?.camaraConfig as Record<string, unknown>) || null, error: null }
  } catch (e) {
    return { config: null, error: e instanceof Error ? e.message : "Error al obtener configuracion de camara" }
  }
}

export async function updateCamaraConfig(
  tallerId: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    await prisma.configuracionTaller.update({
      where: { tenantId: tallerId },
      data: { camaraConfig: config as any },
    })

    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar configuracion de camara" }
  }
}
