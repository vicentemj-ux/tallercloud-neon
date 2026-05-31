"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const PRICE_CORE_MONTHLY = 189
const PRICE_PRO_MONTHLY = 299
const PRICE_CORE_ANNUAL = 1699
const PRICE_PRO_ANNUAL = 2499
const PRICE_CORE_ANNUAL_MONTHLY = Math.round(PRICE_CORE_ANNUAL / 12)
const PRICE_PRO_ANNUAL_MONTHLY = Math.round(PRICE_PRO_ANNUAL / 12)
const ANNUAL_SAVINGS_CORE = PRICE_CORE_MONTHLY * 12 - PRICE_CORE_ANNUAL
const ANNUAL_SAVINGS_PRO = PRICE_PRO_MONTHLY * 12 - PRICE_PRO_ANNUAL

const includedCore = [
  "POS / Ventas con ticket",
  "Modulo de reparaciones",
  "Inventario y productos",
  "Historial de ventas",
  "Base de clientes",
  "Bitacora de gastos",
  "REVISION RAPIDA (Checklist basico)",
  "Gestion de equipo (hasta 3 miembros)",
  "Dashboard y configuracion",
]

const includedPro = [
  "Todo lo de PLAN CORE (miembros ilimitados)",
  "Bitacora de visitas",
  "Chat interno del taller",
  "Compras y ordenes de compra",
  "Control de utilidad",
  "Reportes avanzados",
  "Catalogo de servicios",
  "Firma digital QR",
  "Health Check PRO (Checklist de 10 puntos)",
]

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <section id="precios" className="bg-muted/40 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Precios
          </span>
          <h2 className="max-w-2xl text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple y transparente
          </h2>
          <p className="max-w-xl text-pretty leading-relaxed text-muted-foreground">
            PLAN CORE para la operacion diaria; PLAN PRO para escalar con herramientas avanzadas.
          </p>

          <div className="mt-2 flex items-center gap-1 rounded-full border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setIsAnnual(false)}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-all ${
                !isAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setIsAnnual(true)}
              className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-all ${
                isAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Anual
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isAnnual ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                Ahorra
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* PLAN CORE */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-slate-900/5">
            <div className="bg-slate-100 px-6 py-3">
              <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-800">
                PLAN CORE
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col items-center gap-1">
                {isAnnual ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight text-foreground">
                        ${PRICE_CORE_ANNUAL_MONTHLY}
                      </span>
                      <span className="text-lg text-muted-foreground">/mes</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${PRICE_CORE_ANNUAL.toLocaleString("es-MX")} MXN facturado anualmente
                    </p>
                    <span className="mt-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Ahorras ${ANNUAL_SAVINGS_CORE} MXN al ano
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight text-foreground">
                        ${PRICE_CORE_MONTHLY}
                      </span>
                      <span className="text-lg text-muted-foreground">MXN/mes</span>
                    </div>
                    <p className="text-sm text-muted-foreground">facturado mensualmente</p>
                  </>
                )}
              </div>
              <div className="border-t border-border" />
              <ul className="flex flex-col gap-2.5">
                {includedCore.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                variant="outline"
                className="mt-auto h-12 w-full border-primary/30 text-base font-bold text-primary hover:bg-primary/5"
                asChild
              >
                <Link href="/auth/register">Comenzar 30 dias gratis</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Sin tarjeta de credito · Cancela cuando quieras
              </p>
            </div>
          </div>

          {/* PLAN PRO */}
          <div className="relative flex flex-col overflow-hidden rounded-2xl border-2 border-primary bg-card shadow-xl shadow-primary/10">
            <div className="bg-primary px-6 py-3">
              <p className="text-center text-sm font-bold uppercase tracking-widest text-primary-foreground">
                PLAN PRO
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col items-center gap-1">
                {isAnnual ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight text-foreground">
                        ${PRICE_PRO_ANNUAL_MONTHLY}
                      </span>
                      <span className="text-lg text-muted-foreground">/mes</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${PRICE_PRO_ANNUAL.toLocaleString("es-MX")} MXN facturado anualmente
                    </p>
                    <span className="mt-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      Ahorras ${ANNUAL_SAVINGS_PRO.toLocaleString("es-MX")} MXN al ano
                    </span>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight text-foreground">
                        ${PRICE_PRO_MONTHLY}
                      </span>
                      <span className="text-lg text-muted-foreground">MXN/mes</span>
                    </div>
                    <p className="text-sm text-muted-foreground">facturado mensualmente</p>
                  </>
                )}
              </div>
              <div className="border-t border-border" />
              <ul className="flex flex-col gap-2.5">
                {includedPro.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="mt-auto h-12 w-full text-base font-bold"
                asChild
              >
                <Link href="/auth/register">Comenzar 30 dias gratis</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Sin tarjeta de credito · Cancela cuando quieras
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
