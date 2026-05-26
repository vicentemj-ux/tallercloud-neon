"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  BarChart,
  Briefcase,
  CreditCard,
  ClipboardList,
  FileText,
  GripVertical,
  History,
  LayoutDashboard,
  LogOut,
  Lock,
  MessageSquare,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  Video,
  Wallet,
  Wrench,
} from "lucide-react"
import { useTallerNegocioNombre } from "@/lib/hooks/use-taller-negocio-nombre"
import { getEsUsuarioPro, logoutTaller } from "@/lib/actions/auth-prisma"
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type NavStatus = "active" | "pro" | "v2"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  status: NavStatus
}

const NAV_ITEMS: NavItem[] = [
  { label: "Vista General",       href: "/dashboard",                  icon: LayoutDashboard, status: "active"  },
  { label: "Mi Suscripcion",      href: "/dashboard/facturacion",      icon: FileText,        status: "active"  },
  { label: "Ventas (POS)",        href: "/dashboard/ventas",           icon: CreditCard,      status: "active"  },
  { label: "Reparaciones",        href: "/dashboard/reparaciones",     icon: Wrench,          status: "active"  },
  { label: "Historial de Ventas", href: "/dashboard/historial-ventas", icon: History,         status: "active"  },
  { label: "Inventario",          href: "/dashboard/inventario",       icon: Package,         status: "active"  },
  { label: "Clientes",            href: "/dashboard/clientes",         icon: Users,           status: "active"  },
  { label: "Bitacora de Gastos",  href: "/dashboard/bitacora-gastos",  icon: Wallet,          status: "active"  },
  { label: "Mi Equipo",           href: "/dashboard/equipo",           icon: ShieldCheck,     status: "active"  },
  { label: "Configuracion",       href: "/dashboard/configuracion",    icon: Settings,        status: "active"  },

  { label: "Bitacora de Visitas", href: "/dashboard/bitacora-visitas", icon: Video,           status: "pro"     },
  { label: "Chat Taller",         href: "/dashboard/chat",             icon: MessageSquare,   status: "pro"     },
  { label: "Cotizaciones",        href: "/dashboard/cotizaciones",     icon: ClipboardList,   status: "pro"     },
  { label: "Compras",             href: "/dashboard/compras",          icon: ShoppingCart,    status: "pro"     },
  { label: "Control de Utilidad", href: "/dashboard/utilidad",         icon: TrendingUp,      status: "pro"     },
  { label: "Mercado",             href: "/dashboard/mercado",          icon: Store,           status: "pro"     },
  { label: "Reportes",            href: "/dashboard/reportes",         icon: BarChart,        status: "pro"     },
  { label: "Servicios",           href: "/dashboard/servicios",        icon: Briefcase,       status: "pro"     },
]

const MAIN_NAV_ITEMS = NAV_ITEMS.filter((i) => i.status === "active")
const PRO_NAV_ITEMS = NAV_ITEMS.filter((i) => i.status === "pro")
const V2_NAV_ITEMS = NAV_ITEMS.filter((i) => i.status === "v2")

const PINNED_MAIN_HREF = "/dashboard"
const PINNED_MAIN_ITEM = MAIN_NAV_ITEMS.find((i) => i.href === PINNED_MAIN_HREF) ?? null
const DRAGGABLE_MAIN_ITEMS = MAIN_NAV_ITEMS.filter((i) => i.href !== PINNED_MAIN_HREF)

const DEFAULT_MAIN_ORDER = [
  "/dashboard/facturacion",
  "/dashboard/ventas",
  "/dashboard/reparaciones",
  "/dashboard/historial-ventas",
  "/dashboard/inventario",
  "/dashboard/clientes",
  "/dashboard/bitacora-gastos",
  "/dashboard/equipo",
  "/dashboard/configuracion",
]

function prioritizeSubscriptionFirst(hrefs: string[]): string[] {
  const subscriptionHref = "/dashboard/facturacion"
  const withoutSubscription = hrefs.filter((h) => h !== subscriptionHref)
  return [subscriptionHref, ...withoutSubscription]
}

const BADGE_CONFIG: Record<NavStatus, { text: string; className: string; tooltip: string } | null> = {
  active: null,
  pro: {
    text: "Pro",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    tooltip: "Incluido en PLAN PRO",
  },
  v2: {
    text: "V2",
    className: "bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500",
    tooltip: "Disponible en V2.0",
  },
}

function NavItemRow({
  item,
  pathname,
  isUsuarioPro,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  isUsuarioPro: boolean
  onNavigate?: () => void
}) {
  const badge = BADGE_CONFIG[item.status]
  const isActive = pathname === item.href
  const requiresPro = item.status === "pro"
  const isDisabled = item.status === "v2" || (requiresPro && !isUsuarioPro)

  const rowClass = cn(
    "flex h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors",
    isDisabled
      ? "cursor-default opacity-60"
      : isActive
        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  )

  const inner = (
    <>
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge?.text === "Pro" ? (
        <Badge
          variant="secondary"
          className="h-5 rounded-full bg-purple-100 px-2.5 text-[10px] font-bold uppercase leading-none text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
        >
          Pro
        </Badge>
      ) : badge ? (
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none", badge.className)}>
          {badge.text}
        </span>
      ) : null}
      {isDisabled && <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
    </>
  )

  if (isDisabled) return <div title={badge?.tooltip} className={rowClass}>{inner}</div>
  return (
    <Link href={item.href} onClick={onNavigate} title={badge?.tooltip} className={rowClass}>
      {inner}
    </Link>
  )
}

function SortableNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href })
  const isActive = pathname === item.href

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? "transform 150ms ease", opacity: isDragging ? 0.4 : 1 }}
      className={cn(
        "flex items-center rounded-2xl transition-colors",
        isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        suppressHydrationWarning
        className="flex h-12 items-center justify-center pl-2 pr-1 cursor-grab active:cursor-grabbing touch-none focus:outline-none"
        aria-label="Reordenar"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-40" />
      </div>
      <Link href={item.href} onClick={onNavigate} className="flex h-12 flex-1 items-center gap-3 pr-3 text-sm font-semibold">
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    </div>
  )
}

function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try { await signOut({ redirect: false }) } catch {}
    await logoutTaller()
    router.push("/")
  }

  return (
    <Button
      onClick={handleLogout}
      disabled={loading}
      variant="ghost"
      className="h-10 w-full justify-start gap-2 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      <span>{loading ? "Cerrando..." : "Cerrar sesion"}</span>
    </Button>
  )
}

function useTallerId() {
  const [id, setId] = useState("")
  useEffect(() => {
    try {
      const raw = document.cookie.split("tallerId=")[1]?.split(";")[0]
      if (raw) setId(raw)
    } catch {}
  }, [])
  return id
}

export function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const tallerName = useTallerNegocioNombre()
  const tallerId = useTallerId()
  const [isUsuarioPro, setIsUsuarioPro] = useState(false)
  const [orderedMainHrefs, setOrderedMainHrefs] = useState<string[]>(DEFAULT_MAIN_ORDER)

  useEffect(() => {
    if (!tallerId) return
    try {
      const saved = localStorage.getItem(`sidebar_order_${tallerId}`)
      if (saved) {
        const parsed: string[] = JSON.parse(saved)
        const draggableHrefs = DRAGGABLE_MAIN_ITEMS.map((i) => i.href)
        const valid = parsed.filter((h) => draggableHrefs.includes(h))
        const missing = draggableHrefs.filter((h) => !valid.includes(h))
        setOrderedMainHrefs(prioritizeSubscriptionFirst([...valid, ...missing]))
      }
    } catch {}
  }, [tallerId])

  useEffect(() => {
    let cancelled = false
    getEsUsuarioPro()
      .then((isPro) => { if (!cancelled) setIsUsuarioPro(Boolean(isPro)) })
      .catch(() => { if (!cancelled) setIsUsuarioPro(false) })
    return () => { cancelled = true }
  }, [])

  const sortedMainItems = useMemo(
    () => orderedMainHrefs.map((href) => DRAGGABLE_MAIN_ITEMS.find((i) => i.href === href)).filter(Boolean) as NavItem[],
    [orderedMainHrefs],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrderedMainHrefs((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      const newOrder = arrayMove(prev, oldIndex, newIndex)
      if (tallerId) localStorage.setItem(`sidebar_order_${tallerId}`, JSON.stringify(newOrder))
      return newOrder
    })
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
        <img src="/images/logo.png" alt="TallerCloud" className="h-8 w-8" />
        <span className="truncate text-lg font-bold text-sidebar-foreground">TallerCloud</span>
      </div>

      <div className="shrink-0 px-3 py-3 lg:hidden">
        <Button className="btn-glow h-12 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700" asChild>
          <Link href="/dashboard/reparaciones?openNewTicket=1" onClick={onNavigate}>
            <PlusCircle className="h-5 w-5" />
            Nueva Reparacion
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Principal</p>
        <nav className="flex flex-col gap-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            {PINNED_MAIN_ITEM ? (
              <NavItemRow item={PINNED_MAIN_ITEM} pathname={pathname} isUsuarioPro={isUsuarioPro} onNavigate={onNavigate} />
            ) : null}
            <SortableContext items={orderedMainHrefs} strategy={verticalListSortingStrategy}>
              {sortedMainItems.map((item) => (
                <SortableNavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <p className="px-3 pb-2 pt-5 text-[11px] font-black uppercase tracking-[0.22em] text-purple-500">Pro</p>
        <nav className="flex flex-col gap-1">
          {PRO_NAV_ITEMS.map((item) => (
            <NavItemRow key={item.href} item={item} pathname={pathname} isUsuarioPro={isUsuarioPro} onNavigate={onNavigate} />
          ))}
        </nav>

        {V2_NAV_ITEMS.length > 0 ? (
          <>
            <p className="px-3 pb-2 pt-5 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Proximamente</p>
            <nav className="flex flex-col gap-1">
              {V2_NAV_ITEMS.map((item) => (
                <NavItemRow key={item.href} item={item} pathname={pathname} isUsuarioPro={isUsuarioPro} onNavigate={onNavigate} />
              ))}
            </nav>
          </>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-3">
        <Button className="hidden h-10 w-full gap-2 rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-700 lg:flex" asChild>
          <Link href="/dashboard/reparaciones?openNewTicket=1">
            <PlusCircle className="h-4 w-4" />
            Nueva Reparacion
          </Link>
        </Button>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary/10 text-sm font-semibold text-sidebar-primary">
            {tallerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{tallerName}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </div>
  )
}
