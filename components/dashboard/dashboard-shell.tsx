"use client"

import { Suspense, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { PRO_DISABLED_ROUTES, PRO_FEATURES_TEMP_DISABLED } from "@/lib/runtime-flags"

// Lazy-load sidebar con DnD (~100-150KB ahorrados en bundle inicial)
const SidebarContent = dynamic(
  () => import("@/components/dashboard/sidebar-content").then((m) => m.SidebarContent),
  { ssr: false, loading: () => <SidebarSkeleton /> }
)

// Lazy-load componentes no crÃ­ticos del header
const HelpQuickSheet = dynamic(
  () => import("@/components/dashboard/help-quick-sheet").then((m) => m.HelpQuickSheet),
  { ssr: false }
)
const DashboardHeaderProfile = dynamic(
  () => import("@/components/dashboard/dashboard-header-profile").then((m) => m.DashboardHeaderProfile),
  { ssr: false }
)
const OfflineBanner = dynamic(
  () => import("@/components/dashboard/offline-banner").then((m) => m.OfflineBanner),
  { ssr: false }
)
const OfflineSyncListener = dynamic(
  () => import("@/components/dashboard/offline-sync-listener").then((m) => m.OfflineSyncListener),
  { ssr: false }
)

// â”€â”€â”€ Skeleton para sidebar mientras carga DnD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="h-8 w-8 rounded-md bg-sidebar-accent animate-pulse" />
        <div className="h-5 w-24 rounded-md bg-sidebar-accent animate-pulse" />
      </div>
      <div className="flex-1 space-y-2 px-3 py-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-9 rounded-lg bg-sidebar-accent animate-pulse" />
        ))}
      </div>
      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-3">
        <div className="h-10 rounded-lg bg-sidebar-accent animate-pulse" />
        <div className="h-9 rounded-lg bg-sidebar-accent animate-pulse" />
      </div>
    </div>
  )
}

// â”€â”€â”€ Dashboard Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!PRO_FEATURES_TEMP_DISABLED) return
    const blocked = PRO_DISABLED_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    if (blocked) {
      router.replace("/dashboard")
    }
  }, [pathname, router])

  return (
    <div className="flex h-screen [height:100dvh] bg-muted/30">
      {/* Desktop Sidebar â€” lazy loaded */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          overlayClassName="bg-slate-900/40"
          className="h-full w-[min(88vw,360px)] max-w-[88vw] border-sidebar-border bg-sidebar p-0"
        >
          <SheetTitle className="sr-only">Menu de navegacion</SheetTitle>
          <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <OfflineBanner />

        {/* Mobile Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-slate-200 bg-white px-3 shadow-sm sm:gap-3 sm:px-4 lg:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menÃº</span>
          </Button>
          <span className="min-w-0 shrink truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">
            TallerCloud
          </span>
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <HelpQuickSheet />
            <DashboardHeaderProfile />
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 shadow-sm lg:flex">
          <span className="shrink-0 text-lg font-bold tracking-tight text-slate-900">TallerCloud</span>
          <HelpQuickSheet />
          <DashboardHeaderProfile />
          <div className="min-w-0 flex-1" />
        </header>

        <main className="flex-1 overflow-y-auto scroll-smooth bg-slate-50/50 font-sans">
          {children}
        </main>
      </div>
    </div>
  )
}

// â”€â”€â”€ Dashboard Shell (Client Component) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineSyncListener />
      <DashboardContent>{children}</DashboardContent>
    </>
  )
}
