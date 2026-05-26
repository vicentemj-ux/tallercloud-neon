import type { NextAuthOptions } from "next-auth"
import { getServerSession } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { getPrismaClient } from "@/lib/prisma"

function resolveAuthSecret() {
  const explicit = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (process.env.NODE_ENV === "production" && !explicit) {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is required in production")
  }
  return explicit || process.env.SUPABASE_JWT_SECRET
}

const AUTH_SECRET_FALLBACK = resolveAuthSecret()

export const authOptions: NextAuthOptions = {
  secret: AUTH_SECRET_FALLBACK,
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailRaw = credentials?.email?.trim()
        const email = emailRaw?.toLowerCase()
        const password = credentials?.password ?? ""
        if (!email || !password) return null

        const prisma = getPrismaClient()
        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
          },
          include: { tenant: true },
        })
        if (!user || !user.passwordHash || !user.emailVerified || !user.activo) return null

        const ok = await bcrypt.compare(password, String(user.passwordHash))
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
          name: user.nombre || user.email,
          tenantId: user.tenantId,
          tenantName: user.tenant?.nombre || "Mi Taller",
          isAdmin: user.role === "ADMIN",
          role: user.role,
          sessionVersion: Number(user.sessionVersion ?? 1),
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as any).tenantId
        token.tenantName = (user as any).tenantName
        token.isAdmin = (user as any).isAdmin
        token.role = (user as any).role
        token.sessionVersion = (user as any).sessionVersion
      }
      return token
    },
    async session({ session, token }) {
      ;(session.user as any).id = token.sub
      ;(session.user as any).tenantId = token.tenantId
      ;(session.user as any).tenantName = token.tenantName
      ;(session.user as any).isAdmin = token.isAdmin
      ;(session.user as any).role = token.role
      ;(session.user as any).sessionVersion = token.sessionVersion
      return session
    },
  },
  pages: {
    signIn: "/auth/login",
  },
}

export async function getAuthSession() {
  return getServerSession(authOptions)
}

export async function getCurrentUser() {
  const session = await getAuthSession()
  return session?.user ?? null
}

export async function getCurrentTenant() {
  const user = await getCurrentUser()
  if (!user) return null
  return {
    id: (user as any).tenantId as string,
    nombre_taller: (user as any).tenantName as string,
  }
}

export async function clearLegacySessionCookies() {
  const cookieStore = await cookies()
  cookieStore.delete("tallerId")
  cookieStore.delete("tallerName")
  cookieStore.delete("isAdmin")
  cookieStore.delete("session_version")
  cookieStore.delete("tallercloud_admin_verified")
}
