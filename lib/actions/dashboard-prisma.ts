"use server"

import { getRepairsByTallerId } from "@/lib/actions/repairs-prisma"
import type { Order } from "@/components/dashboard/orders-table"

export interface DashboardPrismaStats {
  reparacionesTotales: number
  recibidas: number
  diagnostico: number
  enReparacion: number
  listas: number
  entregadas: number
  urgentes: number
  ingresosBasicosMes: number
}

function toOrderStatus(status: string): Order["status"] {
  if (status === "Recibido" || status === "Diagnostico" || status === "En Reparacion" || status === "Listo" || status === "Entregado") {
    return status
  }
  return "Recibido"
}

export async function getDashboardMvpData() {
  try {
    const repairsResult = await getRepairsByTallerId(0, 200)
    const now = Date.now()
    const month = new Date().getMonth()
    const year = new Date().getFullYear()

    const stats = repairsResult.data.reduce<DashboardPrismaStats>(
      (acc, r) => {
        acc.reparacionesTotales += 1
        if (r.status === "Recibido") acc.recibidas += 1
        if (r.status === "Diagnostico") acc.diagnostico += 1
        if (r.status === "En Reparacion") acc.enReparacion += 1
        if (r.status === "Listo") acc.listas += 1
        if (r.status === "Entregado") acc.entregadas += 1

        const updated = r.updatedAtRaw ? new Date(r.updatedAtRaw).getTime() : NaN
        if ((r.status === "Diagnostico" || r.status === "En Reparacion" || r.status === "Recibido") && Number.isFinite(updated)) {
          const days = (now - updated) / (1000 * 60 * 60 * 24)
          if (days >= 7) acc.urgentes += 1
        }

        const created = r.createdAt ? new Date(r.createdAt) : null
        if (created && !Number.isNaN(created.getTime()) && created.getMonth() === month && created.getFullYear() === year) {
          acc.ingresosBasicosMes += r.estimatedPrice == null ? 0 : Number(r.estimatedPrice)
        }

        return acc
      },
      {
        reparacionesTotales: 0,
        recibidas: 0,
        diagnostico: 0,
        enReparacion: 0,
        listas: 0,
        entregadas: 0,
        urgentes: 0,
        ingresosBasicosMes: 0,
      },
    )

    const orders: Order[] = repairsResult.data.map((r) => ({
      id: r.id,
      folio: r.folio,
      customer: r.clienteName,
      phone: r.clientePhone || "",
      device: `${r.deviceBrand || ""} ${r.deviceModel || ""}`.trim() || "Equipo",
      tipo_equipo: r.tipo_equipo || "Equipo",
      status: toOrderStatus(r.status),
      date: r.createdAt,
      problem: r.falla || "Sin falla reportada",
      price: r.estimatedPrice == null ? "Pendiente" : `$${Number(r.estimatedPrice).toLocaleString("es-MX")}`,
      technician: r.tecnico || "Sin asignar",
    }))

    return { stats, orders }
  } catch (error) {
    console.error("[dashboard] failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      stats: {
        reparacionesTotales: 0,
        recibidas: 0,
        diagnostico: 0,
        enReparacion: 0,
        listas: 0,
        entregadas: 0,
        urgentes: 0,
        ingresosBasicosMes: 0,
      },
      orders: [],
    }
  }
}
