"use client"

import { memo, useRef, type CSSProperties } from "react"
import { useReactToPrint } from "react-to-print"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Printer, MessageCircle, Mail, X, CheckCircle2 } from "lucide-react"
import { TicketCorteTemplate } from "@/components/print-templates/TicketCorteTemplate"
import type { CortePrintData } from "@/lib/actions/ventas-prisma"
import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface CorteExitoModalProps {
  open: boolean
  cortes: CortePrintData
  tallerNombre: string
  tallerTelefono: string
  montoCierre: number
  onClose: () => void
}

export const CorteExitoModal = memo(function CorteExitoModal({
  open,
  cortes,
  tallerNombre,
  tallerTelefono,
  montoCierre,
  onClose,
}: CorteExitoModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handleReactToPrint = useReactToPrint({
    contentRef: printRef,
    bodyClass: "print-ticket-mode",
    pageStyle: `@page { size: 80mm auto; margin: 0 !important; } body { margin: 0 !important; padding: 0 !important; }`,
    documentTitle: () => `Corte-${cortes.numero_corte}`,
  })

  const diferencia = montoCierre - (cortes.saldo_final ?? 0)

  function handleSendWhatsApp() {
    const digits = normalizePhoneForWhatsApp(tallerTelefono)
    const msg = [
      `🧾 *CORTE DE CAJA #${cortes.numero_corte}*`,
      `📅 ${fmtDate(cortes.fecha_apertura)} - ${fmtDate(cortes.fecha_cierre)}`,
      ``,
      `💰 *Resumen:*`,
      `Ventas PDV: $${fmt(cortes.totalVentasPdv)}`,
      `Efectivo: $${fmt(cortes.total_efectivo)}`,
      `Tarjeta: $${fmt(cortes.total_tarjeta)}`,
      `Transferencia: $${fmt(cortes.total_transferencia)}`,
      `Gastos: -$${fmt(cortes.total_gastos)}`,
      `Saldo Final: $${fmt(cortes.saldo_final)}`,
      ``,
      diferencia !== 0 ? `⚠️ *Diferencia:* $${fmt(diferencia)}` : `✅ *Diferencia:* $0.00`,
    ].join("\n")
    const url = `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  function handleSendEmail() {
    const subject = encodeURIComponent(`Corte de Caja #${cortes.numero_corte}`)
    const body = encodeURIComponent([
      `CORTE DE CAJA #${cortes.numero_corte}`,
      `Fecha: ${fmtDate(cortes.fecha_apertura)}`,
      ``,
      `Ventas PDV: $${fmt(cortes.totalVentasPdv)}`,
      `Efectivo: $${fmt(cortes.total_efectivo)}`,
      `Tarjeta: $${fmt(cortes.total_tarjeta)}`,
      `Transferencia: $${fmt(cortes.total_transferencia)}`,
      `Gastos: -$${fmt(cortes.total_gastos)}`,
      `Saldo Final: $${fmt(cortes.saldo_final)}`,
      diferencia !== 0 ? `Diferencia: $${fmt(diferencia)}` : `Diferencia: $0.00`,
      ``,
      `Monto de cierre: $${fmt(montoCierre)}`,
      `Generado por TallerCloud`,
    ].join("\n"))
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <div
        ref={printRef}
        className="print-ticket-offscreen-layer"
        style={{ "--pos-print-width-mm": "80mm" } as CSSProperties}
        aria-hidden
      >
        <TicketCorteTemplate
          businessName={tallerNombre}
          numeroCorte={cortes.numero_corte}
          fechaApertura={cortes.fecha_apertura}
          fechaCierre={cortes.fecha_cierre}
          montoInicial={cortes.monto_inicial}
          ventasRegistradas={cortes.total_ventas}
          totalEfectivo={cortes.total_efectivo}
          totalTarjeta={cortes.total_tarjeta}
          totalTransferencia={cortes.total_transferencia}
          totalAbonosEfectivo={cortes.total_abonos_efectivo}
          totalAbonosTarjeta={cortes.total_abonos_tarjeta}
          totalAbonosTransferencia={cortes.total_abonos_transferencia}
          efectivoEsperado={cortes.saldo_final ?? cortes.total_efectivo}
          efectivoContado={montoCierre}
          diferencia={diferencia}
          totalVentasPdv={cortes.totalVentasPdv}
          totalCobrosRep={cortes.total_abonos}
          totalGastos={cortes.total_gastos}
          notaCierre={cortes.nota_cierre ?? null}
          ventas={cortes.ventas}
          cobrosRep={cortes.cobrosRep}
          gastos={cortes.listaGastos}
        />
      </div>

      <DialogContent role="dialog" aria-modal="true" hideCloseButton className="max-w-lg rounded-2xl border-slate-200 bg-white p-0 shadow-lg ring-1 ring-black/5 overflow-hidden">
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
            .corte-modal-ease {
              animation: cortEaseOutQuart 260ms both;
            }
            @keyframes cortEaseOutQuart {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .corte-success-bounce {
              animation: cortSuccessBounce 1.2s ease-in-out infinite both;
            }
            @keyframes cortSuccessBounce {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
          }
        `}</style>

        <DialogHeader className="corte-modal-ease bg-white px-6 pt-8 pb-0 text-center items-center">
          <div className="corte-success-bounce mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} />
          </div>
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tight text-blue-600 text-center">
            Corte exitoso
          </DialogTitle>
          <DialogDescription className="mt-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-center leading-none">
            Corte #{cortes.numero_corte}
          </DialogDescription>
        </DialogHeader>

        {/* Resumen */}
        <div className="px-6 py-4 bg-slate-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ventas PDV</span>
              <span className="text-sm font-black text-slate-900">${fmt(cortes.totalVentasPdv)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Efectivo</span>
              <span className="text-sm font-black text-slate-900">${fmt(cortes.total_efectivo)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tarjeta</span>
              <span className="text-sm font-black text-slate-900">${fmt(cortes.total_tarjeta)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Transferencia</span>
              <span className="text-sm font-black text-slate-900">${fmt(cortes.total_transferencia)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gastos</span>
              <span className="text-sm font-black text-red-500">-${fmt(cortes.total_gastos)}</span>
            </div>
            <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-600">Saldo Final</span>
              <span className="text-lg font-black text-blue-600">${fmt(cortes.saldo_final)}</span>
            </div>
            {diferencia !== 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase tracking-wider text-red-500">Diferencia</span>
                <span className="text-sm font-black text-red-500">${fmt(diferencia)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-3 px-6 pb-6 bg-slate-50">
          <div className="grid grid-cols-3 gap-3">
            <Button
              className="h-14 gap-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-sm btn-glow shadow-xl shadow-blue-500/30"
              onClick={() => handleReactToPrint()}
            >
              <Printer className="h-5 w-5" />
              Imprimir
            </Button>
            <Button
              className="h-14 gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-emerald-500/25"
              onClick={handleSendWhatsApp}
            >
              <MessageCircle className="h-5 w-5" />
              WhatsApp
            </Button>
            <Button
              className="h-14 gap-2 rounded-2xl bg-slate-700 hover:bg-slate-800 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-slate-500/25"
              onClick={handleSendEmail}
            >
              <Mail className="h-5 w-5" />
              Correo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})
