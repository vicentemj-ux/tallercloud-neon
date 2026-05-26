import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()
const email = `qa_login_${Date.now()}@example.com`
const password = "Passw0rd123!"
const hash = await bcrypt.hash(password, 12)

const tenant = await prisma.tenant.create({
  data: {
    nombre: "QA Tenant",
    slug: `qa-tenant-${Date.now()}`,
    plan: "PRO",
    trialEndsAt: new Date(Date.now() + 30 * 86400000),
    currency: "MXN",
    timezone: "America/Mexico_City",
    paperSize: "80mm",
    printSettings: {},
  },
})

const user = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    email,
    nombre: "QA User",
    passwordHash: hash,
    emailVerified: true,
    sessionVersion: 1,
    role: "OWNER",
    activo: true,
  },
})

await prisma.configuracionTaller.create({
  data: {
    tenantId: tenant.id,
    nombreComercial: tenant.nombre,
    moneda: "MXN",
    timezone: "America/Mexico_City",
    paperSize: "80mm",
    printSettings: {},
  },
})

console.log(JSON.stringify({ email, password, tenantId: tenant.id, userId: user.id }))
await prisma.$disconnect()
