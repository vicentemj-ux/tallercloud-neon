"use client"

import { memo, useEffect, useRef, useState, type CSSProperties } from "react"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { MessageCircle, Printer, Tag, X, CheckCircle2, Loader2 } from "lucide-react"
import { TicketVentaDispatcher } from "@/components/print-templates"
import type { ProductSaleLabelTemplateData } from "@/components/print-templates/ProductSaleLabelTemplate"
import type { VentaCreada } from "@/lib/actions/ventas-prisma"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"

const isTauriAvailable = async () => false
const printTicketRasterDirecto = async (..._args: unknown[]) => {}
const printTicketDirecto = async (..._args: unknown[]) => {}
const buildTicketDataFromVenta = (..._args: unknown[]) => ({})

interface SuccessModalProps {
  open: boolean
  venta: VentaCreada
  tallerNombre: string
  tallerTelefono: string
  logoUrl?: string | null
  defaultTamano?: string
  terminosGarantia?: string
  mensajeDespedida?: string
  impresoraTicket?: string | null
  direccion?: string
  onClose: () => void
}

export const SuccessModal = memo(function SuccessModal({
  open,
  venta,
  tallerNombre,
  tallerTelefono,
  logoUrl,
  terminosGarantia,
  mensajeDespedida,
  impresoraTicket,
  direccion,
  onClose,
}: SuccessModalProps) {
  const ticketPxWidth = 302

  const printRef = useRef<HTMLDivElement>(null)
  const hiddenRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [printingDirecto, setPrintingDirecto] = useState(false)

  const handleReactToPrint = useReactToPrint({
    contentRef: printRef,
    bodyClass: "print-ticket-mode",
    pageStyle: `@page { size: 80mm auto; margin: 0 !important; } body { margin: 0 !important; padding: 0 !important; }`,
    documentTitle: () => `Ticket-${venta.folio ?? venta.id}`,
  })

  const [phoneInput, setPhoneInput] = useState("")
  const [showPhoneInput, setShowPhoneInput] = useState(false)

  useEffect(() => {
    if (!open) return
    let raf = 0
    raf = requestAnimationFrame(() => {
      import("canvas-confetti")
        .then(({ default: confetti }) => {
          const duration = 1800
          const end = Date.now() + duration
          const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444"]
          const frame = () => {
            confetti({
              particleCount: 3,
              angle: 60,
              spread: 55,
              origin: { x: 0, y: 0.65 },
              colors,
              disableForReducedMotion: true,
              zIndex: 9999,
            })
            confetti({
              particleCount: 3,
              angle: 120,
              spread: 55,
              origin: { x: 1, y: 0.65 },
              colors,
              disableForReducedMotion: true,
              zIndex: 9999,
            })
            if (Date.now() < end) requestAnimationFrame(frame)
          }
          frame()
        })
        .catch(() => {})
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  function handleSendWhatsApp(overridePhone?: string) {
    const resolved = overridePhone ?? venta.cliente_telefono
    if (!resolved?.trim()) {
      setShowPhoneInput(true)
      return
    }
    const nombre = venta.cliente_nombre ?? "cliente"
    const itemLines = (venta.items ?? [])
      .map(
        (i) =>
          `  * ${i.descripcion} x${i.cantidad} - $${(i.precio_unitario * i.cantidad).toLocaleString("es-MX")}`,
      )
      .join("\n")
    const msg = [
      `¡Hola ${nombre}! 📱 Gracias por tu compra en ${tallerNombre}.`,
      `📄 Folio: ${venta.folio ?? venta.id}`,
      `📦 Articulos:\n${itemLines}`,
      `💰 Total: $${venta.total.toLocaleString("es-MX")}`,
      `¡Esperamos verte pronto! 🚀`,
    ].join("\n")
    const digits = normalizePhoneForWhatsApp(resolved)
    if (!digits) return
    const url = `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  // Detectar items de tipo equipo (tienen marca, modelo o IMEI)
  const equipoItems = (venta.items ?? []).filter(
    (i) => i.marca || i.modelo || i.imei_serie
  )
  const tieneEquipo = equipoItems.length > 0

  function handlePrintEquipoLabel() {
    const equipo = equipoItems[0]
    const deviceName =
      [equipo.marca, equipo.modelo].filter(Boolean).join(" ") ||
      equipo.descripcion ||
      "Equipo"
    const labelData: ProductSaleLabelTemplateData = {
      kind: "product-sale-label",
      shopName: tallerNombre,
      deviceName,
      marca: equipo.marca ?? null,
      modelo: equipo.modelo ?? null,
      imei: equipo.imei_serie ?? null,
      color: equipo.color ?? null,
      condicion: equipo.condicion ?? null,
      procesador: equipo.procesador ?? null,
      ram: equipo.ram ?? null,
      almacenamiento: equipo.almacenamiento ?? null,
      precio: equipo.precio_unitario,
      folio: venta.folio ?? null,
    }
    window.localStorage.setItem("printLabel", JSON.stringify(labelData))
    window.open("/print-label", "_blank", "noopener,noreferrer,width=400,height=240")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setShowPhoneInput(false)
          setPhoneInput("")
          onClose()
        }
      }}
    >
      {/* Area de impresion aislada - react-to-print la copia a un iframe propio */}
      <div
        ref={printRef}
        className="print-ticket-offscreen-layer"
        style={{ "--pos-print-width-mm": "80mm" } as CSSProperties}
        aria-hidden
      >
        <TicketVentaDispatcher
          venta={venta}
          tallerNombre={tallerNombre}
          tallerTelefono={tallerTelefono}
          logoUrl={logoUrl}
          tamanoPapel="80mm"
          terminosGarantia={terminosGarantia}
          mensajeDespedida={mensajeDespedida}
        />
      </div>

      {/* Contenedor oculto para Tauri raster (fuera de viewport pero opacity:1 para que html-to-image capture bien) */}
      <div
        ref={hiddenRef}
        style={{ position: "fixed", left: -9999, top: 0, width: "80mm", opacity: 1, pointerEvents: "none", zIndex: -1 }}
        aria-hidden
      >
        <TicketVentaDispatcher
          venta={venta}
          tallerNombre={tallerNombre}
          tallerTelefono={tallerTelefono}
          logoUrl={logoUrl}
          tamanoPapel="80mm"
          terminosGarantia={terminosGarantia}
          mensajeDespedida={mensajeDespedida}
        />
      </div>

      <DialogContent role="dialog" aria-modal="true" hideCloseButton className="max-w-lg rounded-2xl border-slate-200 bg-white p-0 shadow-lg ring-1 ring-black/5 overflow-hidden">
        {/* X grande custom arriba a la derecha */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-10 w-10" strokeWidth={2} />
        </button>

        <style>{`
          @media (prefers-reduced-motion: no-preference) {
            .pos-modal-ease {
              animation: posEaseOutQuart 260ms both;
            }
            @keyframes posEaseOutQuart {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .pos-success-bounce {
              animation: posSuccessBounce 1.2s ease-in-out infinite both;
            }
            @keyframes posSuccessBounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
          }
        `}</style>
        <DialogHeader className="pos-modal-ease bg-white px-6 pt-8 pb-0 text-center items-center">
          <div className="pos-success-bounce mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tight text-blue-600 text-center">
            ¡Venta exitosa!
          </DialogTitle>
          <DialogDescription className="mt-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-center leading-none">
            #{venta.folio}
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 flex flex-col items-center gap-4 bg-slate-50">
          <div ref={previewRef} className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden" style={{ width: ticketPxWidth }}>
            <TicketVentaDispatcher
              venta={venta}
              tallerNombre={tallerNombre}
              tallerTelefono={tallerTelefono}
              logoUrl={logoUrl}
              tamanoPapel="80mm"
              terminosGarantia={terminosGarantia}
              mensajeDespedida={mensajeDespedida}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5 pt-0 bg-slate-50">
          {showPhoneInput && (
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="Numero de WhatsApp"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="flex-1 text-sm rounded-xl"
                autoFocus
              />
              <Button
                onClick={() => handleSendWhatsApp(phoneInput)}
                disabled={phoneInput.replace(/\D/g, "").length < 6}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shrink-0 rounded-xl"
              >
                Enviar →
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-14 gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-sm btn-glow shadow-xl shadow-blue-500/30"
              disabled={printingDirecto}
              onClick={async () => {
                if (false) {
                  if (!impresoraTicket) {
                    toast({
                      variant: "destructive",
                      title: "Impresora no configurada",
                      description:
                        "Ve a Configuracion > Hardware y selecciona la impresora de tickets.",
                    })
                    return
                  }
                  setPrintingDirecto(true)
                  try {
                    // Raster: captura el ticket DOM visible como imagen de alta calidad
                    const target = previewRef.current ?? hiddenRef.current ?? printRef.current
                    if (target) {
                      await printTicketRasterDirecto(impresoraTicket, target)
                    } else {
                      // Fallback a texto plano si no hay ref
                      const data = buildTicketDataFromVenta(
                        venta,
                        tallerNombre,
                        tallerTelefono,
                        mensajeDespedida,
                        direccion
                      )
                      await printTicketDirecto(impresoraTicket, data)
                    }
                  } catch (e: any) {
                    toast({
                      variant: "destructive",
                      title: "Error de impresion",
                      description: e?.message || "No se pudo imprimir.",
                    })
                  } finally {
                    setPrintingDirecto(false)
                  }
                } else {
                  handleReactToPrint()
                }
              }}
            >
              {printingDirecto && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
              <Printer className="h-5 w-5" />
              Imprimir
            </Button>
            <Button
              className="h-14 gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-emerald-500/25"
              onClick={() => handleSendWhatsApp()}
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})



