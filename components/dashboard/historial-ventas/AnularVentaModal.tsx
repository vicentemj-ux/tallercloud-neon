"use client"

import { useEffect, useState } from "react"
import { Wallet, CheckCircle2, Loader2 } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { anularVenta, getCajaAbierta, type CajaRow } from "@/lib/actions/ventas-prisma"
import { formatMoneyCompact } from "@/lib/utils/currency"

interface AnularVentaModalProps {
  open: boolean
  ventaId: string
  folio: string
  onClose: () => void
  onAnulada?: () => void
}

type Step = "confirm" | "success"

export function AnularVentaModal({ open, ventaId, folio, onClose, onAnulada }: AnularVentaModalProps) {
  const [step, setStep] = useState<Step>("confirm")
  const [caja, setCaja] = useState<CajaRow | null>(null)
  const [cajaError, setCajaError] = useState<string | null>(null)
  const [loadingCaja, setLoadingCaja] = useState(false)
  const [anulando, setAnulando] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep("confirm")
      setCaja(null)
      setCajaError(null)
      return
    }
    setLoadingCaja(true)
    getCajaAbierta()
      .then((res) => {
        if (res.error) setCajaError(res.error)
        else setCaja(res.caja)
      })
      .catch(() => setCajaError("No se pudo cargar la caja."))
      .finally(() => setLoadingCaja(false))
  }, [open])

  const handleConfirm = async () => {
    setAnulando(true)
    try {
      const res = await anularVenta(ventaId, null)
      if (!res.success) {
        toast({ variant: "destructive", title: "No se pudo anular", description: res.error ?? "" })
        return
      }
      setStep("success")
      onAnulada?.()
    } finally {
      setAnulando(false)
    }
  }

  const cajaTotal = caja
    ? (caja.total_efectivo ?? 0) + (caja.total_tarjeta ?? 0) + (caja.total_transferencia ?? 0)
    : 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm border-slate-200 bg-white p-0 shadow-xl sm:rounded-3xl">
        {step === "confirm" ? (
          <div className="flex flex-col items-center p-8">
            {/* Icon */}
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
              <Wallet className="h-6 w-6 text-orange-500" />
            </div>

            {/* Title */}
            <h3 className="mb-3 text-center text-lg font-black uppercase italic tracking-wide text-slate-900">
              ¿DE DÓNDE SALE EL DINERO?
            </h3>

            {/* Subtitle */}
            <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Estas anulando la <span className="text-amber-500">Venta #{folio}</span>.
            </p>
            <p className="mb-6 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Selecciona la caja abierta que entregará el efectivo al cliente.
            </p>

            {/* Caja card */}
            {loadingCaja ? (
              <div className="flex w-full items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : cajaError || !caja ? (
              <div className="mb-5 w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                {cajaError || "No hay una caja abierta actualmente."}
              </div>
            ) : (
              <div
                className="group mb-6 w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-all duration-300 ease-out hover:border-amber-300 hover:bg-amber-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-800 transition-colors duration-300 group-hover:text-amber-700">
                    Caja #{caja.numero_corte ?? 1}
                  </span>
                  <span className="text-sm font-black text-slate-900 transition-colors duration-300 group-hover:text-amber-700">
                    {formatMoneyCompact(cajaTotal)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 transition-colors duration-300 group-hover:text-amber-500">
                    Efectivo disponible
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 transition-colors duration-300 group-hover:text-amber-500">
                    Saldo actual
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 transition-colors duration-300 group-hover:text-amber-600">
                    {formatMoneyCompact(caja.total_efectivo ?? 0)}
                  </span>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex w-full flex-col gap-3">
              <Button
                variant="outline"
                className="w-full rounded-full border-slate-200 py-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
                onClick={onClose}
                disabled={anulando}
              >
                Cancelar operación
              </Button>
              <Button
                className="w-full rounded-full bg-blue-600 py-5 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-blue-700 btn-glow"
                onClick={handleConfirm}
                disabled={anulando || !caja}
              >
                {anulando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar anulación"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center p-8">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="mb-1 text-center text-lg font-black text-slate-900">Venta Anulada</h3>
            <p className="mb-6 text-center text-sm text-slate-500">
              Se revirtió el inventario y se actualizó la caja correctamente.
            </p>
            <Button
              className="w-full rounded-full bg-blue-600 py-5 text-xs font-bold uppercase tracking-[0.2em] text-white hover:bg-blue-700 btn-glow"
              onClick={onClose}
            >
              Aceptar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


