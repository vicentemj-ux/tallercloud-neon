/**
 * create-admin-neon.ts
 *
 * Crea el usuario administrador inicial en Neon (taller_users).
 *
 * Uso:
 *   npx tsx scripts/create-admin-neon.ts
 *
 * Configura en .env.local:
 *   DATABASE_URL=postgresql://...
 *   ADMIN_EMAIL=tu@email.com
 *   ADMIN_PASSWORD=tu_password_seguro
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const DATABASE_URL = process.env.DATABASE_URL
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no configurado en .env.local")
  process.exit(1)
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("❌ Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env.local")
  process.exit(1)
}

async function main() {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  console.log("📦 Asegurando tabla taller_users...")
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS taller_users (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      nombre_taller text NOT NULL DEFAULT 'Admin',
      nombre_propietario text,
      email_verified boolean NOT NULL DEFAULT false,
      es_admin boolean NOT NULL DEFAULT false,
      plan_tipo text DEFAULT 'Prueba',
      fecha_vencimiento_plan timestamptz DEFAULT (now() + INTERVAL '30 days'),
      plan_activo boolean DEFAULT false,
      is_pro boolean DEFAULT false,
      activo boolean DEFAULT true,
      session_version integer DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  console.log("🔐 Generando hash bcrypt...")
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD!, 12)

  console.log(`👤 Creando admin: ${ADMIN_EMAIL}`)
  await prisma.$executeRawUnsafe(
    `INSERT INTO taller_users (email, password_hash, nombre_taller, nombre_propietario, email_verified, es_admin, plan_tipo, fecha_vencimiento_plan, plan_activo, is_pro, activo)
     VALUES ($1, $2, 'TallerCloud Admin', 'Admin', true, true, 'activo', '2099-12-31'::timestamptz, true, true, true)
     ON CONFLICT (email) DO UPDATE SET
       es_admin = true,
       email_verified = true,
       password_hash = $2,
       plan_tipo = 'activo'`,
    ADMIN_EMAIL, passwordHash,
  )

  console.log("✅ Admin creado correctamente.")
  console.log(`   Email: ${ADMIN_EMAIL}`)
  console.log(`   Login: /auth/super-admin`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("❌ Error:", e)
  process.exit(1)
})
