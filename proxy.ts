import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { calcDiasRestantes } from "./lib/utils/subscription"

function resolveAuthSecret() {
  const explicit = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (process.env.NODE_ENV === "production" && !explicit) {
    throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is required in production")
  }
  return explicit || process.env.SUPABASE_JWT_SECRET
}

const AUTH_SECRET_FALLBACK = resolveAuthSecret()

async function checkSubscription(tallerId: string): Promise<"ok" | "vencido" | "suspendido"> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return "suspendido"

    const res = await fetch(`${url}/rest/v1/taller_users?id=eq.${encodeURIComponent(tallerId)}&select=plan_tipo,fecha_vencimiento_plan`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return "suspendido"

    const rows = (await res.json()) as Array<{ plan_tipo: string; fecha_vencimiento_plan: string | null }>
    const row = rows[0]
    if (!row) return "suspendido"
    if (row.plan_tipo === "suspendido") return "suspendido"

    const diasRestantes = calcDiasRestantes(row.fecha_vencimiento_plan)
    if (diasRestantes !== null && diasRestantes <= 0) return "vencido"
    return "ok"
  } catch {
    return "suspendido"
  }
}

async function hasTallerProfile(userId: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const res = await fetch(`${url}/rest/v1/taller_users?id=eq.${encodeURIComponent(userId)}&select=id`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) return false
  const rows = (await res.json()) as unknown[]
  return Array.isArray(rows) && rows.length > 0
}

async function fetchTallerInfo(userId: string): Promise<{ nombre: string; sessionVersion: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const res = await fetch(`${url}/rest/v1/taller_users?id=eq.${encodeURIComponent(userId)}&select=nombre_taller,session_version`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ nombre_taller: string; session_version: number }>
  if (!rows[0]) return null
  return { nombre: rows[0].nombre_taller ?? "Mi Taller", sessionVersion: rows[0].session_version ?? 1 }
}

async function checkSessionVersion(tallerId: string, cookieVersion: string | undefined): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const res = await fetch(`${url}/rest/v1/taller_users?id=eq.${encodeURIComponent(tallerId)}&select=session_version`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) return false
  const rows = (await res.json()) as Array<{ session_version: number }>
  const dbVersion = rows[0]?.session_version ?? 1
  const clientVersion = parseInt(cookieVersion ?? "1", 10) || 1
  return dbVersion === clientVersion
}

const tallerCookieOpts = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const token = await getToken({ req: request, secret: AUTH_SECRET_FALLBACK })
  const authUserId = token?.sub
  const tokenTenantId = (token as any)?.tenantId as string | undefined
  const tokenTenantName = (token as any)?.tenantName as string | undefined
  const tokenSessionVersion = Number((token as any)?.sessionVersion ?? 1)
  const tokenIsAdmin = Boolean((token as any)?.isAdmin)

  const tallerId = request.cookies.get("tallerId")?.value
  const isAdminCookie = request.cookies.get("isAdmin")?.value === "true"

  if (
    pathname.startsWith("/auth/verify-email") ||
    pathname.startsWith("/auth/reset-password") ||
    pathname.startsWith("/auth/super-admin") ||
    pathname.startsWith("/auth/forgot-password") ||
    pathname.startsWith("/auth/callback")
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/admin")) {
    if (!tallerId) return NextResponse.redirect(new URL("/auth/super-admin", request.url))
    if (!isAdminCookie) return NextResponse.redirect(new URL("/dashboard", request.url))

    const adminVerified = request.cookies.get("tallercloud_admin_verified")?.value
    if (!adminVerified && !pathname.startsWith("/admin/verify")) {
      return NextResponse.redirect(new URL("/admin/verify", request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith("/onboarding")) {
    if (!authUserId) return NextResponse.redirect(new URL("/auth/login", request.url))
    if (tokenTenantId) return NextResponse.redirect(new URL("/dashboard", request.url))
    if (tallerId) return NextResponse.redirect(new URL("/dashboard", request.url))
    const profile = await hasTallerProfile(authUserId)
    if (profile) return NextResponse.redirect(new URL("/dashboard", request.url))
    return NextResponse.next()
  }

  if (pathname.startsWith("/dashboard")) {
    if (tokenTenantId) {
      const out = NextResponse.next()
      if (!tallerId || tallerId !== tokenTenantId) {
        out.cookies.set("tallerId", tokenTenantId, { httpOnly: true, ...tallerCookieOpts })
        out.cookies.set("tallerName", encodeURIComponent(tokenTenantName || "Mi Taller"), tallerCookieOpts)
        out.cookies.set("session_version", String(tokenSessionVersion), { httpOnly: true, ...tallerCookieOpts })
      }
      if (tokenIsAdmin) {
        out.cookies.set("isAdmin", "true", { httpOnly: true, ...tallerCookieOpts })
      }
      return out
    }

    if (tallerId) {
      const status = await checkSubscription(tallerId)
      if (status !== "ok") {
        const u = new URL("/acceso-suspendido", request.url)
        u.searchParams.set("razon", status)
        return NextResponse.redirect(u)
      }
      const sessionVersion = request.cookies.get("session_version")?.value
      const versionOk = await checkSessionVersion(tallerId, sessionVersion)
      if (!versionOk) {
        const out = NextResponse.redirect(new URL("/auth/login", request.url))
        out.cookies.delete("tallerId")
        out.cookies.delete("tallerName")
        out.cookies.delete("isAdmin")
        out.cookies.delete("session_version")
        return out
      }
      return NextResponse.next()
    }

    if (authUserId) {
      const profile = await hasTallerProfile(authUserId)
      if (!profile) return NextResponse.redirect(new URL("/onboarding", request.url))
      const tallerInfo = await fetchTallerInfo(authUserId)
      if (!tallerInfo) return NextResponse.redirect(new URL("/onboarding", request.url))
      const status = await checkSubscription(authUserId)
      if (status !== "ok") {
        const u = new URL("/acceso-suspendido", request.url)
        u.searchParams.set("razon", status)
        return NextResponse.redirect(u)
      }
      const out = NextResponse.next()
      out.cookies.set("tallerId", authUserId, { httpOnly: true, ...tallerCookieOpts })
      out.cookies.set("tallerName", encodeURIComponent(tallerInfo.nombre), tallerCookieOpts)
      out.cookies.set("session_version", String(tallerInfo.sessionVersion), { httpOnly: true, ...tallerCookieOpts })
      if ((token as any)?.isAdmin) {
        out.cookies.set("isAdmin", "true", { httpOnly: true, ...tallerCookieOpts })
      }
      return out
    }

    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  if (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register")) {
    if (tallerId || tokenTenantId) return NextResponse.redirect(new URL("/dashboard", request.url))
    if (authUserId) {
      const profile = await hasTallerProfile(authUserId)
      return NextResponse.redirect(new URL(profile ? "/dashboard" : "/onboarding", request.url))
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/admin/:path*", "/onboarding", "/onboarding/:path*"],
}
