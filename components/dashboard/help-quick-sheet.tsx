"use client"

import { useState } from "react"
import Link from "next/link"
import { BookOpen, HelpCircle, LifeBuoy, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function HelpQuickSheet({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 shrink-0 rounded-full border-0 bg-blue-50 text-blue-600 shadow-none transition-colors",
              "hover:bg-blue-600 hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              className,
            )}
            onClick={() => setOpen(true)}
            aria-label="Centro de Ayuda y Soporte"
          >
            <HelpCircle className="h-5 w-5" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-[16rem]">
          ✨ Centro de Ayuda y Soporte
        </TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full border-slate-200 bg-white sm:max-w-md"
          overlayClassName="z-[80]"
        >
          <SheetHeader className="border-b border-slate-200 pb-4 text-left">
            <SheetTitle className="text-lg font-semibold text-slate-900">Ayuda rapida</SheetTitle>
            <SheetDescription className="text-sm text-slate-600">
              Atajos al manual y al centro de documentacion del panel.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 py-4">
            <Link
              href="/dashboard/ayuda"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300/80 hover:bg-amber-50/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100/80 text-amber-800">
                <BookOpen className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Centro de Ayuda</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  Manual de recepcion, modo offline, diagnostico PRO, firma digital y preguntas frecuentes.
                </p>
              </div>
            </Link>

            <Link
              href="/dashboard/reparaciones?openNewTicket=1"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/80"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Wrench className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Nueva reparacion</p>
                <p className="mt-0.5 text-xs text-slate-600">Abrir el flujo de nuevo ticket.</p>
              </div>
            </Link>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
              <div className="flex gap-2 text-slate-600">
                <LifeBuoy className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs leading-relaxed">
                  ¿Sin conexion? Los tickets nuevos pueden guardarse en cola y sincronizarse al volver la red. Mira el
                  indicador en la barra superior.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t border-slate-200 pt-4">
            <Button className="w-full bg-blue-600 hover:bg-blue-700" asChild>
              <Link href="/dashboard/ayuda" onClick={() => setOpen(false)}>
                Abrir Centro de Ayuda completo
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
