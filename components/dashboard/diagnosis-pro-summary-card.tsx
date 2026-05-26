"use client"

import { ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EncendidoRecepcion } from "@/lib/reparaciones/checklist-ingreso"

export interface DiagnosisProSummaryCardProps {
  /** Revisión rápida (encendido) desde `checklist_ingreso` — mismo criterio que el modal de ingreso. */
  encendido?: EncendidoRecepcion | null
  onOpenDetails: () => void
  className?: string
}

function RevisionRapidaResumen({ encendido }: { encendido: EncendidoRecepcion | null | undefined }) {
  if (encendido == null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white/80 px-2.5 py-2 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Revisión rápida</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Sin registrar en recepción</p>
      </div>
    )
  }

  if (encendido === "ok") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-2.5 py-2 shadow-sm ring-1 ring-emerald-200/80">
        <span className="text-lg leading-none" aria-hidden>
          ✅
        </span>
        <div className="min-w-0 text-left">
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800">Revisión rápida</p>
          <p className="text-xs font-semibold leading-tight text-emerald-900">Enciende bien</p>
          <p className="text-[10px] leading-snug text-emerald-800/90">Entra a sistema</p>
        </div>
      </div>
    )
  }

  if (encendido === "intermitente") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border-2 border-amber-400 bg-amber-50 px-2.5 py-2 shadow-sm ring-1 ring-amber-200/80">
        <span className="text-lg leading-none" aria-hidden>
          ⚡
        </span>
        <div className="min-w-0 text-left">
          <p className="text-[9px] font-bold uppercase tracking-wide text-amber-900">Revisión rápida</p>
          <p className="text-xs font-semibold leading-tight text-amber-950">Con dificultad</p>
          <p className="text-[10px] leading-snug text-amber-900/90">Encendido intermitente</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border-2 border-rose-400 bg-rose-50 px-2.5 py-2 shadow-sm ring-1 ring-rose-200/80">
      <span className="text-lg leading-none" aria-hidden>
        ❌
      </span>
      <div className="min-w-0 text-left">
        <p className="text-[9px] font-bold uppercase tracking-wide text-rose-900">Revisión rápida</p>
        <p className="text-xs font-semibold leading-tight text-rose-950">No enciende</p>
        <p className="text-[10px] leading-snug text-rose-900/90">Reportado en recepción</p>
      </div>
    </div>
  )
}

/**
 * Resumen compacto en el visor: revisión rápida + botón Health Check en un solo bloque.
 */
export function DiagnosisProSummaryCard({ encendido, onOpenDetails, className }: DiagnosisProSummaryCardProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3 shadow-sm",
        className,
      )}
    >
      <RevisionRapidaResumen encendido={encendido ?? null} />

      <Button
        type="button"
        variant="outline"
        className="h-9 w-full shrink-0 gap-2 border-amber-300/90 bg-gradient-to-b from-amber-50 to-white text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-50"
        onClick={onOpenDetails}
      >
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        Ver Detalles del Health Check
      </Button>
    </div>
  )
}
