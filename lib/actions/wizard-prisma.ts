"use server"

import { getTenantIdOrThrow } from "@/lib/auth/tenant-utils"
import { getPrismaClient } from "@/lib/prisma"

export async function checkWizardNeeded(): Promise<boolean> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()
    const cfg = await prisma.configuracionTaller.findUnique({
      where: { tenantId },
      select: { wizardCompletado: true },
    })
    return cfg?.wizardCompletado === false
  } catch {
    return false
  }
}

export async function completeWizard(data: {
  nombreTaller: string
  telefono: string
  zonaHoraria: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const prisma = getPrismaClient()
    const tenantId = await getTenantIdOrThrow()

    const nombre = data.nombreTaller.trim()
    if (!nombre || nombre.length < 2) {
      return { success: false, error: "El nombre del taller debe tener al menos 2 caracteres" }
    }
    const tel = data.telefono.trim()
    if (!tel) {
      return { success: false, error: "El telefono es obligatorio" }
    }

    await prisma.configuracionTaller.upsert({
      where: { tenantId },
      create: {
        tenantId,
        nombreComercial: nombre,
        telefono: tel,
        timezone: data.zonaHoraria,
        wizardCompletado: true,
      },
      update: {
        nombreComercial: nombre,
        telefono: tel,
        timezone: data.zonaHoraria,
        wizardCompletado: true,
      },
    })

    return { success: true }
  } catch (e) {
    console.error("[wizard] completeWizard error:", e)
    return { success: false, error: "Error al guardar configuracion" }
  }
}
