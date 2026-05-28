"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Printer, Loader2, Ticket, Tag } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { BitacoraRepair, RepairDetail } from "@/lib/actions/repairs-prisma"
import { printWithProvider } from "@/lib/printing/repair-print-service"
import type { LabelRepairTemplateData } from "@/components/print-templates/LabelRepairTemplate"

interface PrintMenuDropdownProps {
  repair: BitacoraRepair
  detail?: RepairDetail | null
  trigger?: "button" | "icon" | "headerIcon"
  shopName?: string
  warrantyText?: string
  estado?: string
}

export function PrintMenuDropdown({
  repair,
  detail,
  trigger = "button",
  shopName,
}: PrintMenuDropdownProps) {
  const [loading, setLoading] = useState(false)

  const handlePrintTicket = async () => {
    setLoading(true)
    try {
      const folio = repair.folio
      await printWithProvider({
        webPrint: () => {
          window.open(`/print-ticket/${encodeURIComponent(folio)}`, "_blank", "noopener,noreferrer,width=400,height=700")
        },
      })
      toast({ title: "Ticket de recepcion" })
    } catch (e) {
      toast({ title: "Error al imprimir", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handlePrintLabel = async () => {
    setLoading(true)
    try {
      const st = (detail?.securityType ?? "").toLowerCase()
      const sv = (detail?.securityValue ?? "").trim()
      let accessCode: string | null = null
      if (sv && st && st !== "none") {
        if (st === "pattern") accessCode = `PATRON: ${sv}`
        else if (st === "pin") accessCode = `PIN: ${sv}`
        else accessCode = `PASS: ${sv}`
      }

      const labelData: LabelRepairTemplateData = {
        folio: repair.folio,
        deviceName: `${detail?.deviceBrand ?? ""} ${detail?.deviceModel ?? ""}`.trim() || undefined,
        customerName: repair.clienteName,
        customerPhone: repair.clientePhone,
        reportedFault: detail?.falla ?? "",
        estimatedPrice: detail?.estimatedPrice != null ? String(detail.estimatedPrice) : undefined,
        accessCode,
        tallerName: shopName ?? "",
      }
      window.localStorage.setItem("printLabel", JSON.stringify(labelData))
      await printWithProvider({
        webPrint: () => {
          window.open("/print-label", "_blank", "noopener,noreferrer,width=520,height=300")
        },
      })
      toast({ title: "Etiqueta enviada a impresora" })
    } catch (e) {
      toast({ title: "Error al imprimir", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </Button>
        ) : trigger === "headerIcon" ? (
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
          </Button>
        ) : (
          <Button size="default" variant="outline" className="gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span className="text-sm font-medium">Imprimir</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handlePrintTicket} className="cursor-pointer gap-2">
          <Ticket className="h-4 w-4" />
          Ticket de recepcion
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrintLabel} className="cursor-pointer gap-2">
          <Tag className="h-4 w-4" />
          Etiqueta 2x1"
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
