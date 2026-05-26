"use server"

import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import { z } from "zod"
import { checkRateLimit } from "@/lib/auth/rate-limit"
import { getPrismaClient } from "@/lib/prisma"

type TxClient = Parameters<Parameters<ReturnType<typeof getPrismaClient>["$transaction"]>[0]>[0]

const emailSchema = z.string().email("Email invalido").max(254)
const passwordSchema = z.string().min(8, "La contrasena debe tener al menos 8 caracteres").max(128)

const registerSchema = z.object({
  nombrePropietario: z.string().min(2, "Nombre muy corto").max(100).trim(),
  nombreTaller: z.string().min(2, "Nombre del taller muy corto").max(100).trim(),
  email: emailSchema,
  password: passwordSchema,
})

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
}

async function getClientIp(): Promise<string> {
  const headerStore = await headers()
  return headerStore.get("x-forwarded-for")?.split(",")[0].trim() || headerStore.get("x-real-ip") || "unknown"
}

export async function registerWithPrisma(data: {
  nombrePropietario: string
  nombreTaller: string
  email: string
  password: string
}) {
  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const ip = await getClientIp()
  const rl = await checkRateLimit(ip, "register")
  if (!rl.allowed) {
    return { success: false, error: `Demasiados intentos. Espera ${rl.retryAfterMinutes} minutos.` }
  }

  const prisma = getPrismaClient()
  const email = data.email.toLowerCase().trim()

  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } })
  if (existing) {
    return { success: false, error: "El email ya esta registrado" }
  }

  const passwordHash = await bcrypt.hash(data.password, 12)
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 30)

  const baseSlug = slugify(data.nombreTaller) || "taller"

  const result = await prisma.$transaction(async (tx: TxClient) => {
    let slug = baseSlug
    let i = 1
    while (await tx.tenant.findUnique({ where: { slug }, select: { id: true } })) {
      i += 1
      slug = `${baseSlug}-${i}`
    }

    const tenant = await tx.tenant.create({
      data: {
        nombre: data.nombreTaller.trim(),
        slug,
        plan: "PRO",
        trialEndsAt,
        currency: "MXN",
        timezone: "America/Mexico_City",
        paperSize: "80mm",
        printSettings: {},
      },
    })

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        nombre: data.nombrePropietario.trim(),
        passwordHash,
        emailVerified: true,
        sessionVersion: 1,
        role: "OWNER",
      },
    })

    await tx.configuracionTaller.create({
      data: {
        tenantId: tenant.id,
        nombreComercial: data.nombreTaller.trim(),
        moneda: "MXN",
        timezone: "America/Mexico_City",
        paperSize: "80mm",
        printSettings: {},
      },
    })

    return { tenantId: tenant.id, userId: user.id }
  })

  return {
    success: true,
    message: "Registro exitoso.",
    data: result,
  }
}
