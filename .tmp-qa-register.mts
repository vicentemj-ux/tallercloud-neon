import { registerWithPrisma } from "./lib/actions/auth-prisma"
import { getPrismaClient } from "./lib/prisma"

const email = process.argv[2]
const password = "Passw0rd123!"

const result = await registerWithPrisma({
  nombrePropietario: "QA Owner",
  nombreTaller: "QA Taller Prisma",
  email,
  password,
})

const prisma = getPrismaClient()
const user = await prisma.user.findFirst({ where: { email } })
const tenant = user ? await prisma.tenant.findUnique({ where: { id: user.tenantId } }) : null
const cfg = user ? await prisma.configuracionTaller.findUnique({ where: { tenantId: user.tenantId } }) : null

console.log(JSON.stringify({ email, password, result, hasUser: !!user, hasTenant: !!tenant, hasConfig: !!cfg, user }, null, 2))
