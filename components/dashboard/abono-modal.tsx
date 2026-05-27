"use client"

import { useState, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, DollarSign, Loader2, Printer } from "lucide-react"
import {
  getRepairDetail,
  registrarAbono,
  applyRepairStatusChange,
} from "@/lib/actions/repairs-prisma"
import { getTallerSettings, type TallerSettings } from "@/lib/actions/settings-prisma"
import { toast } from "@/hooks/use-toast"
import { AbonoReceipt } from "@/components/dashboard/abono-receipt"
import { printWithProvider } from "@/lib/printing/repair-print-service"

const isTauriAvailable = async () => false
const domToPngBase64 = async (..._args: unknown[]) => ""
const printEscposImage = async (..._args: unknown[]) => {}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MetodoPago = "efectivo" | "tarjeta" | "transferencia"

interface PaymentInfo {
  monto: number
  metodo: string
  nuevoAnticipo: number
  movimientoCajaId: string | null
}

export interface AbonoModalProps {
  isOpen: boolean
  repairId: string | null
  repairFolio: string
  estimatedPrice?: number | null
  onClose: () => void
  /** Called after the abono is saved and the user dismisses the success modal. */
  onSuccess: (nuevoAnticipo: number) => void
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmtPeso(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function metodoLabel(m: string): string {
  const map: Record<string, string> = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    mixto: "Mixto",
  }
  return map[m] ?? m
}

// â”€â”€â”€ Method button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MetodoBtn({
  value,
  current,
  label,
  onChange,
}: {
  value: MetodoPago
  current: MetodoPago
  label: string
  onChange: (v: MetodoPago) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`rounded-lg border py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
        current === value
          ? "bg-slate-900 text-white border-slate-900"
          : "border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  )
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function AbonoModal({
  isOpen,
  repairId,
  repairFolio,
  estimatedPrice,
  onClose,
  onSuccess,
}: AbonoModalProps) {
  // Loading / saving
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Fetched financial data
  const [currentAnticipo, setCurrentAnticipo] = useState(0)
  const [presupuesto, setPresupuesto] = useState(0)

  // Fetched customer / device info (for comprobante)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [deviceBrand, setDeviceBrand] = useState("")
  const [deviceModel, setDeviceModel] = useState("")

  // Form state
  const [monto, setMonto] = useState("")
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo")
  const [efectivoRecibido, setEfectivoRecibido] = useState("")

  // Post-save "change to Listo?" dialog
  const [listoDialogOpen, setListoDialogOpen] = useState(false)
  const [pendingAnticipo, setPendingAnticipo] = useState<number | null>(null)

  // Success modal
  const [showSuccess, setShowSuccess] = useState(false)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  // Settings for hidden ticket render
  const [shopSettings, setShopSettings] = useState<TallerSettings | null>(null)
  const hiddenRef = useRef<HTMLDivElement>(null)

  // â”€â”€ Load detail on open â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isOpen || !repairId) {
      setCurrentAnticipo(0)
      setPresupuesto(estimatedPrice ?? 0)
      setCustomerName("")
      setCustomerPhone("")
      setDeviceBrand("")
      setDeviceModel("")
      setMonto("")
      setEfectivoRecibido("")
      setMetodoPago("efectivo")
      setPaymentInfo(null)
      setShowSuccess(false)
      setPendingAnticipo(null)
      return
    }
    const load = async () => {
      setIsLoading(true)
      const [{ data }, { settings }] = await Promise.all([
        getRepairDetail(repairId),
        getTallerSettings(),
      ])
      if (data) {
        setCurrentAnticipo(data.anticipo ?? 0)
        setPresupuesto(data.estimatedPrice ?? estimatedPrice ?? 0)
        setCustomerName(data.clienteName || "")
        setCustomerPhone(data.clientePhone || "")
        setDeviceBrand(data.deviceBrand || "")
        setDeviceModel(data.deviceModel || "")
      } else if (estimatedPrice != null) {
        setPresupuesto(estimatedPrice)
      }
      setShopSettings(settings)
      setIsLoading(false)
    }
    load()
  }, [isOpen, repairId]) // eslint-disable-line react-hooks/exhaustive-deps

  // â”€â”€ Derived values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const saldoPendiente = Math.max(0, presupuesto - currentAnticipo)

  const montoNum = parseFloat(monto) || 0

  // When paying with cash and the entered amount exceeds the balance,
  // cap the abono at saldo â€” the rest is change returned to the customer.
  const montoEfectivoReal = metodoPago === "efectivo" && montoNum > saldoPendiente ? saldoPendiente : montoNum
  const abonoTotal = montoEfectivoReal

  const efectivoNum = parseFloat(efectivoRecibido) || 0
  const cambio = metodoPago === "efectivo" && montoEfectivoReal > 0 && efectivoNum > montoEfectivoReal ? efectivoNum - montoEfectivoReal : 0

  const nuevoSaldo = Math.max(0, saldoPendiente - abonoTotal)

  // â”€â”€ Submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleSubmit = async () => {
    if (!repairId) return
    if (abonoTotal <= 0) {
      toast({ title: "Monto invÃ¡lido", description: "Ingresa un monto mayor a $0.", variant: "destructive" })
      return
    }

    const metodoFinal: "efectivo" | "tarjeta" | "transferencia" = metodoPago

    setIsSaving(true)
    try {
      const result = await registrarAbono({ repairId, monto: abonoTotal, metodoPago: metodoFinal })
      if (!result.success) {
        toast({ title: "Error", description: result.error ?? "No se pudo registrar el abono.", variant: "destructive" })
        return
      }

      const info: PaymentInfo = {
        monto: abonoTotal,
        metodo: metodoFinal,
        nuevoAnticipo: result.nuevoAnticipo!,
        movimientoCajaId: result.movimientoCajaId ?? null,
      }
      setPaymentInfo(info)

      if (result.liquidado) {
        setPendingAnticipo(result.nuevoAnticipo!)
        setListoDialogOpen(true)
      } else {
        setShowSuccess(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // â”€â”€ Post-liquidation: ask to change status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleListoChoice = async (cambiarAListo: boolean) => {
    setListoDialogOpen(false)
    if (pendingAnticipo !== null && repairId) {
      if (cambiarAListo) {
        const { data: d } = await getRepairDetail(repairId)
        const prev = d?.status ?? "Recibido"
        await applyRepairStatusChange({
          repairId,
          estadoAnterior: prev,
          estadoNuevo: "Listo",
          notaTecnica: "LiquidaciÃ³n de pago",
        })
      }
    }
    setShowSuccess(true)
  }

  // â”€â”€ Success modal actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleSuccessClose = () => {
    const nuevoAnticipo = paymentInfo?.nuevoAnticipo ?? pendingAnticipo ?? currentAnticipo
    setShowSuccess(false)
    setPaymentInfo(null)
    onSuccess(nuevoAnticipo)
    onClose()
  }

  const handlePrint = async () => {
    if (!paymentInfo) return
    if (!paymentInfo.movimientoCajaId) {
      toast({
        title: "Comprobante no disponible",
        description: "No se encontrÃ³ el abono registrado para impresiÃ³n.",
        variant: "destructive",
      })
      return
    }
    const nuevoAnticipo = paymentInfo.nuevoAnticipo
    setIsPrinting(true)

    try {
      const result = await printWithProvider({
        tauriPrint: async () => {
          if (!(await isTauriAvailable())) throw new Error("Tauri no disponible")
          const { settings } = await getTallerSettings()
          const printerName = settings?.impresora_ticket?.trim()
          if (!printerName) throw new Error("Impresora no configurada")
          flushSync(() => {})
          await new Promise<void>((resolve) => setTimeout(resolve, 100))
          if (!hiddenRef.current) throw new Error("Vista de comprobante no disponible")
          const base64 = await domToPngBase64(hiddenRef.current, { pixelRatio: 2 })
          await printEscposImage(printerName, base64, 576)
        },
        webPrint: () => {
          const abonoId = encodeURIComponent(paymentInfo.movimientoCajaId!)
          window.open(`/print-abono/${abonoId}`, "_blank", "noopener,noreferrer,width=400,height=620")
        },
      })

      if (result.provider === "tauri") {
        toast({ title: "Comprobante enviado a impresora" })
      } else if (result.usedFallback) {
        toast({
          title: "ImpresiÃ³n web en uso",
          description: `${result.errorMessage || "Se usÃ³ impresiÃ³n web como respaldo."}`,
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al imprimir"
      toast({ title: "Error de impresion", description: msg, variant: "destructive" })
    } finally {
      setIsPrinting(false)
    }
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <>
      {/* â”€â”€ Main abono form dialog â”€â”€ */}
      <Dialog open={isOpen && !showSuccess} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md bg-white p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold uppercase tracking-wider">
              <DollarSign className="h-4 w-4 text-green-600" />
              REGISTRAR ABONO
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Ticket #{repairFolio} Â· Saldo pendiente: {fmtPeso(saldoPendiente)}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Monto a abonar
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder={`MÃ¡x. ${fmtPeso(saldoPendiente)}`}
                    className="bg-white border-slate-200 min-h-[44px] text-lg font-bold"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    MÃ©todo de pago
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <MetodoBtn value="efectivo" current={metodoPago} label="EFECTIVO" onChange={setMetodoPago} />
                    <MetodoBtn value="tarjeta" current={metodoPago} label="TARJETA" onChange={setMetodoPago} />
                    <MetodoBtn value="transferencia" current={metodoPago} label="TRANSF." onChange={setMetodoPago} />
                  </div>
                </div>

                {metodoPago === "efectivo" && montoNum > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Efectivo recibido
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={efectivoRecibido}
                        onChange={(e) => setEfectivoRecibido(e.target.value)}
                        placeholder="0.00"
                        className="bg-white border-slate-200 min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Cambio
                      </Label>
                      <div
                        className={`flex items-center min-h-[44px] rounded-md border px-3 text-base font-bold ${
                          cambio > 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {cambio > 0 ? fmtPeso(cambio) : "â€”"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Balance summary */}
              {presupuesto > 0 && (
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-xs text-slate-500 space-y-1.5">
                  <div className="flex justify-between">
                    <span>Presupuesto total</span>
                    <span className="font-semibold text-slate-700">{fmtPeso(presupuesto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ya abonado</span>
                    <span className="font-semibold text-amber-600">{fmtPeso(currentAnticipo)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5">
                    <span className="font-semibold">RestarÃ¡ pendiente</span>
                    <span className={`font-bold ${nuevoSaldo <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {nuevoSaldo <= 0 ? "LIQUIDADO âœ“" : fmtPeso(nuevoSaldo)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" onClick={onClose} disabled={isSaving} className="flex-1">
              CANCELAR
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving || isLoading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2 font-bold uppercase tracking-wider"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              + REGISTRAR ABONO
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* â”€â”€ Liquidation: ask to change status to Listo â”€â”€ */}
      <AlertDialog open={listoDialogOpen} onOpenChange={setListoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Saldo liquidado</AlertDialogTitle>
            <AlertDialogDescription>
              Este abono cubre el total del presupuesto. Â¿Deseas cambiar el estado del ticket a{" "}
              <strong>Finalizado</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleListoChoice(false)}>
              No, mantener estado actual
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleListoChoice(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              SÃ­, marcar como Listo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* â”€â”€ Abono registrado: success + print â”€â”€ */}
      <Dialog open={showSuccess} onOpenChange={(o) => !o && handleSuccessClose()}>
        <DialogContent className="sm:max-w-sm bg-white">
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Abono registrado correctamente</h3>
              {paymentInfo && (
                <p className="text-xl font-extrabold text-emerald-700">
                  {fmtPeso(paymentInfo.monto)}{" "}
                  <span className="text-base font-semibold text-slate-500">
                    en {metodoLabel(paymentInfo.metodo)}
                  </span>
                </p>
              )}
              <p className="text-xs text-slate-400">Folio: #{repairFolio}</p>
            </div>
            <div className="flex gap-2 w-full pt-1">
              <Button variant="outline" onClick={handleSuccessClose} className="flex-1">
                Cerrar
              </Button>
              <Button
                onClick={handlePrint}
                disabled={isPrinting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2 btn-glow disabled:opacity-70"
              >
                {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {isPrinting ? "Imprimiendo..." : "Imprimir comprobante"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden ticket for Tauri raster print (fuera de viewport pero opacity:1 para que html-to-image capture bien) */}
      <div style={{ position: "fixed", left: -9999, top: 0, width: "80mm", opacity: 1, pointerEvents: "none", zIndex: -1 }}>
        <AbonoReceipt
          ref={hiddenRef}
          data={{
            folio: repairFolio,
            customerName,
            customerPhone,
            deviceName: `${deviceBrand} ${deviceModel}`.trim() || "N/A",
            metodoPago: paymentInfo?.metodo || "efectivo",
            monto: paymentInfo?.monto || 0,
            totalPagado: paymentInfo?.nuevoAnticipo ?? currentAnticipo,
            presupuesto,
            saldoRestante: Math.max(0, presupuesto - (paymentInfo?.nuevoAnticipo ?? currentAnticipo)),
            date: new Date().toLocaleString("es-MX", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            cambio: cambio > 0 ? cambio : undefined,
          }}
          businessName={shopSettings?.nombre_taller || "Mi Taller"}
          businessPhone={shopSettings?.telefono || ""}
          logoUrl={shopSettings?.logo_url || undefined}
          mensajeDespedida={shopSettings?.mensaje_despedida || undefined}
        />
      </div>
    </>
  )
}


