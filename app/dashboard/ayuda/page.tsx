"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ClipboardList,
  PenLine,
  Search,
  Stethoscope,
  WifiOff,
  HelpCircle,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const TOPICS = [
  {
    id: "recepcion",
    title: "Recepcion",
    description: "Nuevo ticket y validacion en recepcion.",
    icon: ClipboardList,
    keywords:
      "cliente equipo marca falla revision patron seguridad pin badge ayuda footer critico",
  },
  {
    id: "offline",
    title: "Modo offline",
    description: "Emergencia, cola local y sincronizacion.",
    icon: WifiOff,
    keywords: "indexeddb cola sincronizar nube indicador verde rojo emergencia red",
  },
  {
    id: "diagnostico-pro",
    title: "Diagnostico PRO",
    description: "Health check y pruebas por tipo de equipo.",
    icon: Stethoscope,
    keywords: "funciona falla sin probar smartphone laptop health checklist pro",
  },
  {
    id: "firma",
    title: "Firma digital",
    description: "QR de ingreso y firma en el dispositivo del cliente.",
    icon: PenLine,
    keywords: "qr firma preventa celular enlace token",
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Respuestas rapidas a dudas habituales.",
    icon: HelpCircle,
    keywords: "boton deshabilitado crear ticket express diagnostico",
  },
] as const

function matchesQuery(text: string, q: string) {
  if (!q.trim()) return true
  const n = q.trim().toLowerCase()
  return text.toLowerCase().includes(n)
}

export default function AyudaPage() {
  const [query, setQuery] = useState("")

  const visibleTopics = useMemo(() => {
    return TOPICS.filter(
      (t) =>
        matchesQuery(t.title + " " + t.description + " " + t.keywords, query) ||
        matchesQuery(t.id, query),
    )
  }, [query])

  return (
    <div className="min-h-full bg-white font-sans">
      <div className="border-b border-slate-200 bg-gradient-to-b from-amber-50/40 to-white shadow-sm">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-800/80">
            Manual de operaciones
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Centro de Ayuda
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Documentacion para el staff de TallerCloud: recepcion, resiliencia offline, diagnostico PRO y firma
            digital.
          </p>
          <div className="relative mt-8 max-w-xl">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Buscar temas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 border-slate-200 bg-white pl-10 shadow-sm placeholder:text-slate-400 focus-visible:ring-amber-500/30"
              aria-label="Buscar en la ayuda"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTopics.map((topic) => {
            const Icon = topic.icon
            return (
              <Link key={topic.id} href={`#${topic.id}`} scroll className="group block">
                <Card className="h-full border-slate-200 bg-white shadow-sm transition hover:border-amber-200/90 hover:shadow-md">
                  <CardHeader className="space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-800 ring-1 ring-amber-100 transition group-hover:bg-amber-100/80">
                      <Icon className="h-7 w-7 opacity-90" strokeWidth={1.25} aria-hidden />
                    </div>
                    <CardTitle className="text-lg font-semibold text-slate-900">{topic.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed text-slate-600">
                      {topic.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>

        {visibleTopics.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">No hay temas que coincidan con tu busqueda.</p>
        ) : null}

        <div className="mt-16 space-y-12 scroll-mt-24">
          <ManualSection
            id="recepcion"
            title="Gestion de recepcion (nuevo ticket)"
            visible={matchesQuery(
              "recepcion nuevo ticket cliente " + TOPICS[0].keywords,
              query,
            )}
          >
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>
                Antes de crear el ticket, el sistema valida{" "}
                <strong className="font-semibold text-slate-900">cinco puntos criticos</strong>: cliente valido
                (nombre y telefono), tipo de equipo, marca, descripcion de la falla y{" "}
                <strong className="font-semibold text-slate-900">revision rapida</strong> (encendido / checklist de
                ingreso).
              </li>
              <li>
                En el pie del formulario encontraras un <strong className="font-semibold text-slate-900">badge de ayuda</strong>{" "}
                que resume que falta por completar para poder registrar la orden con seguridad.
              </li>
              <li>
                Si el equipo tiene <strong className="font-semibold text-slate-900">patron de desbloqueo</strong>, abre el
                sub-modal de seguridad: la secuencia se registra en una cuadricula numerada para no equivocar el orden al
                diagnosticar o entregar el equipo.
              </li>
            </ul>
          </ManualSection>

          <ManualSection
            id="offline"
            title="Modo de emergencia (offline)"
            visible={matchesQuery("offline modo emergencia cola " + TOPICS[1].keywords, query)}
          >
            <p className="text-sm leading-relaxed text-slate-700">
              Si no hay red al pulsar <strong className="font-semibold text-slate-900">Crear ticket</strong>, el sistema no
              muestra un error generico: guarda el borrador y puede encolar el ticket en el navegador (IndexedDB o
              respaldo en almacenamiento local). Al recuperar la conexion, la cola se sincroniza automaticamente con la
              nube.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              En la <strong className="font-semibold text-slate-900">barra superior</strong> veras el estado{" "}
              <span className="text-emerald-600">Cloud Online</span> o <span className="text-red-600">Offline</span> y,
              si hay pendientes, un contador <strong className="font-semibold text-slate-900">en cola</strong>. Una franja
              de aviso tambien indica cuando TallerCloud opera en local.
            </p>
          </ManualSection>

          <ManualSection
            id="diagnostico-pro"
            title="Health Check PRO (diagnostico)"
            visible={matchesQuery("diagnostico health pro " + TOPICS[2].keywords, query)}
          >
            <p className="text-sm leading-relaxed text-slate-700">
              Cada prueba usa una logica <strong className="font-semibold text-slate-900">ternaria</strong>:{" "}
              <span className="whitespace-nowrap">✅ FUNCIONA</span>, <span className="whitespace-nowrap">❌ FALLA</span> o{" "}
              <span className="whitespace-nowrap">➖ SIN PROBAR</span>, para dejar claro que se comprobo en recepcion.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              El conjunto de items se adapta al <strong className="font-semibold text-slate-900">ADN del equipo</strong>{" "}
              (por ejemplo smartphone frente a laptop): no veras teclas fisicas en un celular ni pantalla tactil en un
              equipo que no la tenga.
            </p>
          </ManualSection>

          <ManualSection
            id="firma"
            title="Firma digital de ingreso"
            visible={matchesQuery("firma digital qr " + TOPICS[3].keywords, query)}
          >
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>
                En planes con firma PRO puedes generar un <strong className="font-semibold text-slate-900">codigo QR</strong>{" "}
                asociado al proceso de ingreso (incluso antes de persistir el ticket, segun el flujo activo).
              </li>
              <li>
                El <strong className="font-semibold text-slate-900">cliente escanea el QR con su propio dispositivo</strong>,
                abre la pagina de firma y acepta el consentimiento desde su celular, sin compartir la sesion del mostrador.
              </li>
            </ul>
          </ManualSection>

          <section
            id="faq"
            className={cn(
              "scroll-mt-24",
              !matchesQuery("faq preguntas " + TOPICS[4].keywords, query) && query.trim() ? "hidden" : "",
            )}
          >
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Preguntas frecuentes</h2>
            <p className="mt-2 text-sm text-slate-600">
              Respuestas sobre el flujo de ticket y el diagnostico express.
            </p>
            <Card className="mt-6 border-slate-200 bg-white shadow-sm">
              <CardContent className="pt-6">
                <Accordion type="multiple" className="w-full">
                  <AccordionItem value="faq-1" className="border-slate-200">
                    <AccordionTrigger className="text-left text-sm font-medium text-slate-900 hover:no-underline">
                      ¿Por que el boton «Crear ticket» sigue deshabilitado?
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-slate-700">
                      El boton solo se habilita cuando el cliente cumple la validacion minima (por ejemplo telefono con
                      suficientes digitos y datos coherentes). Completa los puntos criticos del formulario y revisa el
                      badge de ayuda en el pie si algo falta.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="faq-2" className="border-slate-200">
                    <AccordionTrigger className="text-left text-sm font-medium text-slate-900 hover:no-underline">
                      ¿Que es el diagnostico express y como se relaciona con la revision rapida?
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-slate-700">
                      La <strong className="font-semibold text-slate-900">revision rapida</strong> cubre encendido y checklist
                      de ingreso obligatorio para registrar el equipo. El <strong className="font-semibold text-slate-900">Health Check PRO</strong>{" "}
                      amplia pruebas funcionales con la logica ternaria; ambos ayudan a documentar el estado real del
                      dispositivo antes del taller.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="faq-3" className="border-slate-200">
                    <AccordionTrigger className="text-left text-sm font-medium text-slate-900 hover:no-underline">
                      ¿Puedo trabajar sin internet?
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-slate-700">
                      Si, en modo offline puedes seguir capturando y dejar tickets en cola; al volver la red se
                      sincronizan. La edicion de tickets ya existentes puede requerir conexion segun la accion.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}

function ManualSection({
  id,
  title,
  children,
  visible,
}: {
  id: string
  title: string
  children: ReactNode
  visible: boolean
}) {
  if (!visible) return null
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}
