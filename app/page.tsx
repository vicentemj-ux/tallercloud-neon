import { Header } from "@/components/header"
import { FeaturesSection } from "@/components/features-section"
import { PricingSection } from "@/components/pricing-section"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Smartphone,
  Laptop,
  Gamepad2,
  MessageCircle,
} from "lucide-react"
import Link from "next/link"
import { buildWhatsAppSendUrl, TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS } from "@/lib/whatsapp-send-url"

const WHATSAPP_URL = buildWhatsAppSendUrl(
  TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS,
  "Hola, me interesa TallerCloud y tengo algunas preguntas",
)

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--primary)_0%,transparent_55%)] opacity-[0.05]" />

          <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 px-4 pb-20 pt-20 text-center sm:px-6 sm:pb-28 sm:pt-28 lg:px-8">

            {/* Headline */}
            <div className="flex flex-col items-center gap-5 max-w-3xl">
              <h1 className="text-balance text-4xl font-black leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                El sistema que tu taller necesita, al precio que puedes pagar
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                TallerCloud es la plataforma de gestion para talleres de reparacion de celulares,
                laptops y consolas. Controla tus reparaciones, ventas e inventario desde cualquier
                dispositivo.
              </p>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {[
                { icon: CheckCircle2, text: "30 dias gratis · Sin tarjeta" },
                { icon: Clock,        text: "Configuracion en 5 minutos" },
                { icon: Smartphone,   text: "Celular, tablet y PC" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {text}
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-13 w-full px-8 text-base font-bold sm:w-auto"
                asChild
              >
                <Link href="/auth/register">
                  Comenzar prueba gratuita
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-13 w-full px-8 text-base sm:w-auto"
                asChild
              >
                <Link href="#caracteristicas">Ver como funciona</Link>
              </Button>
            </div>

            {/* Dashboard preview — clean mockup */}
            <div className="mt-4 w-full max-w-4xl">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
                {/* Browser bar */}
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-300" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-300" />
                  </div>
                  <div className="mx-auto flex h-6 w-full max-w-xs items-center rounded-md bg-background px-3">
                    <span className="text-xs text-muted-foreground">tallercloud.net/dashboard</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
                  {[
                    { label: "Reparaciones activas", value: "12", color: "bg-blue-50 text-blue-700" },
                    { label: "Listos para entrega",   value: "4",  color: "bg-emerald-50 text-emerald-700" },
                    { label: "Ingresos del mes",      value: "$8,240", color: "bg-primary/5 text-primary" },
                    { label: "Clientes atendidos",    value: "38", color: "bg-amber-50 text-amber-700" },
                  ].map((stat) => (
                    <div key={stat.label} className={`rounded-xl p-4 ${stat.color.split(" ")[0]}`}>
                      <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
                      <p className={`mt-1 text-2xl font-black ${stat.color.split(" ")[1]}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Mini repair list */}
                <div className="px-5 pb-5">
                  <div className="overflow-hidden rounded-xl border border-border">
                    <div className="grid grid-cols-4 bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Folio</span>
                      <span>Cliente</span>
                      <span className="hidden sm:block">Equipo</span>
                      <span>Estatus</span>
                    </div>
                    {[
                      { folio: "TC-0041", cliente: "Juan Perez",    equipo: "iPhone 13",    status: "En Reparacion", color: "bg-amber-100 text-amber-700" },
                      { folio: "TC-0040", cliente: "Maria Lopez",   equipo: "Laptop HP",    status: "Listo",         color: "bg-emerald-100 text-emerald-700" },
                      { folio: "TC-0039", cliente: "Carlos Ruiz",   equipo: "PS5",          status: "Recibido",      color: "bg-blue-100 text-blue-700" },
                    ].map((row) => (
                      <div key={row.folio} className="grid grid-cols-4 items-center border-t border-border px-4 py-3 text-sm">
                        <span className="font-semibold text-primary">{row.folio}</span>
                        <span className="text-muted-foreground truncate">{row.cliente}</span>
                        <span className="hidden text-muted-foreground sm:block truncate">{row.equipo}</span>
                        <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${row.color}`}>
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PARA QUIeN ES ────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-24 border-t border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 flex flex-col items-center gap-3 text-center">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Disenado para talleres como el tuyo
              </h2>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {[
                {
                  emoji: "📱",
                  title: "Talleres de celulares",
                  desc: "Controla cada reparacion con folio digital y manten a tu cliente informado por WhatsApp.",
                  icon: Smartphone,
                },
                {
                  emoji: "💻",
                  title: "Reparacion de laptops y PC",
                  desc: "Gestiona diagnosticos, presupuestos y entregas sin perder ningun detalle.",
                  icon: Laptop,
                },
                {
                  emoji: "🎮",
                  title: "Venta y reparacion de consolas",
                  desc: "Lleva el control de tu inventario con numero de serie e IMEI.",
                  icon: Gamepad2,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-7 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all"
                >
                  <span className="text-4xl">{item.emoji}</span>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CARACTERiSTICAS ──────────────────────────────────────────────── */}
        <FeaturesSection />

        {/* ── PRECIOS ──────────────────────────────────────────────────────── */}
        <PricingSection />

        {/* ── TESTIMONIAL ──────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-24 border-t border-border">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="flex flex-col items-center gap-6">
              <div className="text-4xl">🛠️</div>
              <blockquote className="text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
                "Siendo de Los Mochis, construimos TallerCloud entendiendo exactamente los retos
                de un taller de reparacion local. Cada funcion existe porque la vivimos en el negocio."
              </blockquote>
              <div className="flex flex-col items-center gap-1">
                <p className="font-bold text-foreground">Vicente Munguia</p>
                <p className="text-sm text-muted-foreground">Fundador · Los Mochis, Sinaloa</p>
              </div>
              <p className="max-w-lg text-sm text-muted-foreground">
                Se parte de los primeros talleres en Los Mochis en digitalizar su operacion.
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ────────────────────────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-blue-700 px-6 py-16 text-center sm:px-16 sm:py-20">
              <div className="relative flex flex-col items-center gap-6">
                <h2 className="max-w-2xl text-balance text-3xl font-black tracking-tight text-white sm:text-4xl">
                  ¿Listo para modernizar tu taller?
                </h2>
                <p className="max-w-lg text-pretty text-white/80 text-lg">
                  Comienza gratis hoy. Sin tarjeta, sin compromiso.
                </p>
                <Button
                  size="lg"
                  className="h-13 bg-white px-8 text-base font-bold text-primary hover:bg-white/90"
                  asChild
                >
                  <Link href="/auth/register">
                    Crear cuenta gratis
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-white/80 text-sm hover:text-white transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  ¿Tienes dudas? Escribenos por WhatsApp →
                </a>
              </div>
            </div>
          </div>
        </section>

      </main>

      <Footer />

      {/* ── BOToN FLOTANTE WHATSAPP ─────────────────────────────────────── */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        title="¿Tienes dudas? Escribenos"
        className="fixed bottom-6 right-6 z-50 group"
      >
        {/* Anillo de pulso */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] opacity-30 animate-ping" />
        {/* Boton principal */}
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg shadow-[#25D366]/40 transition-transform group-hover:scale-110">
          <svg
            viewBox="0 0 24 24"
            fill="white"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        </span>
      </a>
    </div>
  )
}
