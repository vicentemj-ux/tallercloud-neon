"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="/images/logo.png"
            alt="TallerCloud logo"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
            fetchPriority="high"
            decoding="async"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">
            TallerCloud
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegacion principal">
          <Link href="#caracteristicas" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Caracteristicas
          </Link>
          <Link href="#precios" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Precios
          </Link>
          <Link href="#contacto" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Contacto
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">Iniciar Sesion</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/auth/register">Prueba Gratis</Link>
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Menu movil">
            <Link href="#caracteristicas" className="py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Caracteristicas
            </Link>
            <Link href="#precios" className="py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Precios
            </Link>
            <Link href="#contacto" className="py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => setMobileMenuOpen(false)}>
              Contacto
            </Link>
          </nav>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/dashboard">Iniciar Sesion</Link>
            </Button>
            <Button size="sm" className="w-full" asChild>
              <Link href="/auth/register" onClick={() => setMobileMenuOpen(false)}>Prueba Gratis</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
