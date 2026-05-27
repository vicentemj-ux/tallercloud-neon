"use server"

import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"

export interface Servicio {
  id: string
  nombre: string
  descripcion: string
  precio: number
  created_at: string
  updated_at: string
}

export interface ReparacionServicio {
  id: string
  reparacion_id: string
  servicio_id: string | null
  nombre_snapshot: string
  precio_snapshot: number
  cantidad: number
  created_at: string
}

export async function getServicios(): Promise<{ data: Servicio[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, nombre, descripcion, precio, created_at, updated_at
       FROM catalogo_servicios
       WHERE taller_id = $1
       ORDER BY nombre ASC`,
      tallerId,
    )

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        nombre: String(r.nombre ?? ""),
        descripcion: String(r.descripcion ?? ""),
        precio: Number(r.precio ?? 0),
        created_at: String(r.created_at ?? ""),
        updated_at: String(r.updated_at ?? ""),
      })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar servicios" }
  }
}

export async function getServiciosReparacion(
  reparacionId: string
): Promise<{ data: ReparacionServicio[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, reparacion_id, servicio_id, nombre_snapshot, precio_snapshot, cantidad, created_at
       FROM reparacion_servicios
       WHERE taller_id = $1 AND reparacion_id = $2
       ORDER BY created_at ASC`,
      tallerId,
      reparacionId,
    )

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        reparacion_id: String(r.reparacion_id ?? ""),
        servicio_id: r.servicio_id == null ? null : String(r.servicio_id),
        nombre_snapshot: String(r.nombre_snapshot ?? ""),
        precio_snapshot: Number(r.precio_snapshot ?? 0),
        cantidad: Number(r.cantidad ?? 1),
        created_at: String(r.created_at ?? ""),
      })),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar servicios de reparacion" }
  }
}

