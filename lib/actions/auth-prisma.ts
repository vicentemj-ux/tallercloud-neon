"use server"

import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { headers } from "next/headers"
import { z } from "zod"
import { checkRateLimit } from "@/lib/auth/rate-limit"
import { clearLegacySessionCookies, getCurrentTenant, getCurrentUser } from "@/lib/auth"
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

export async function getOwnerLoginEmail(): Promise<{ email: string; error: string | null }> {
  try {
    const user = await getCurrentUser()
    const userId = (user as any)?.id as string | undefined
    if (!userId) return { email: "", error: "No autenticado" }
    const prisma = getPrismaClient()
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!row?.email) return { email: "", error: "No se pudo cargar el email de acceso" }
    return { email: row.email, error: null }
  } catch (e) {
    console.error("[auth-prisma] getOwnerLoginEmail:", e)
    return { email: "", error: "No se pudo cargar el email de acceso" }
  }
}

export async function changeOwnerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const userId = (user as any)?.id as string | undefined
    if (!userId) return { success: false, error: "No autenticado" }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: "La nueva contrasena debe tener al menos 8 caracteres" }
    }

    const prisma = getPrismaClient()
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    if (!row?.passwordHash) return { success: false, error: "No se pudo cargar tu usuario" }

    const match = await bcrypt.compare(currentPassword, row.passwordHash)
    if (!match) return { success: false, error: "La contrasena actual no es correcta" }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const newSessionVersion = Math.floor(Date.now() / 1000)

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, sessionVersion: newSessionVersion },
    })

    const cookieStore = await cookies()
    cookieStore.set("session_version", String(newSessionVersion), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return { success: true }
  } catch (e) {
    console.error("[auth-prisma] changeOwnerPassword:", e)
    return { success: false, error: "No se pudo actualizar la contrasena" }
  }
}

export async function getEsUsuarioPro(): Promise<boolean> {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant?.id) return false
    const prisma = getPrismaClient()
    const row = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { plan: true, trialEndsAt: true },
    })
    if (!row) return false
    if (row.plan === "PRO") return true
    if (row.trialEndsAt && row.trialEndsAt.getTime() > Date.now()) return true
    return false
  } catch (e) {
    console.error("[auth-prisma] getEsUsuarioPro:", e)
    return false
  }
}

export async function getCurrentOwnerIdentity(): Promise<{
  nombre: string
  email: string
  error: string | null
}> {
  try {
    const user = await getCurrentUser()
    const userId = (user as any)?.id as string | undefined
    if (!userId) {
      return { nombre: "Usuario activo", email: "", error: "No autenticado" }
    }

    const prisma = getPrismaClient()
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { nombre: true, email: true },
    })

    if (!row) {
      return { nombre: "Usuario activo", email: "", error: "No se pudo cargar el usuario activo" }
    }

    return {
      nombre: row.nombre?.trim() || "Usuario activo",
      email: row.email?.trim() || "",
      error: null,
    }
  } catch (e) {
    console.error("[auth-prisma] getCurrentOwnerIdentity:", e)
    return { nombre: "Usuario activo", email: "", error: "No se pudo cargar el usuario activo" }
  }
}

export async function logoutTaller() {
  await clearLegacySessionCookies()
  return { success: true }
}
