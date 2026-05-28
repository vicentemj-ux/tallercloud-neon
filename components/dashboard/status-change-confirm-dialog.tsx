"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

const PRIMARY = "w-full sm:w-auto bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-sm"

export interface StatusChangeConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estadoAnteriorLabel: string
  estadoNuevoLabel: string
  notaTecnica: string
  onNotaTecnicaChange: (v: string) => void
  onSoloHistorial: () => void
  onActualizarYWhatsApp: () => void
  /** null = no hay operacion en curso */
  pendingKind: "historial" | "whatsapp" | null
}

export function StatusChangeConfirmDialog({
  open,
  onOpenChange,
  estadoAnteriorLabel,
  estadoNuevoLabel,
  notaTecnica,
  onNotaTecnicaChange,
  onSoloHistorial,
  onActualizarYWhatsApp,
  pendingKind,
}: StatusChangeConfirmDialogProps) {
  const isPending = pendingKind !== null
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        overlayClassName="z-[100] bg-black/50"
        className="z-[110] flex max-h-[min(90vh,560px)] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden border border-slate-200 bg-white p-0 text-slate-900 shadow-xl sm:w-full"
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-2 border-b border-slate-100 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-lg font-semibold leading-snug text-slate-900">
            Confirmar cambio de estado
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-slate-600">
            Cambiando de{" "}
            <span className="font-semibold text-slate-800">{estadoAnteriorLabel}</span> a{" "}
            <span className="font-semibold text-slate-800">{estadoNuevoLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <Label htmlFor="nota-tecnica-status" className="text-sm font-medium text-slate-700">
            Nota tecnica <span className="font-normal text-slate-400">(opcional)</span>
          </Label>
          <Textarea
            id="nota-tecnica-status"
            value={notaTecnica}
            onChange={(e) => onNotaTecnicaChange(e.target.value)}
            placeholder="Detalle interno o motivo visible en plantillas segun el estado…"
            rows={4}
            disabled={isPending}
            className="mt-2 min-h-[96px] max-h-40 w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#2563eb]"
          />
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50 sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full border-slate-300 bg-white text-slate-800 hover:bg-slate-50 sm:w-auto"
              onClick={onSoloHistorial}
              disabled={isPending}
            >
              {pendingKind === "historial" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Solo actualizar historial"
              )}
            </Button>
            <Button type="button" className={PRIMARY} onClick={onActualizarYWhatsApp} disabled={isPending}>
              {pendingKind === "whatsapp" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Actualizar y notificar WhatsApp"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
