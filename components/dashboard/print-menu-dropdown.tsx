"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Printer, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { BitacoraRepair, RepairDetail } from "@/lib/actions/repairs"

interface PrintMenuDropdownProps {
  repair: BitacoraRepair
  detail?: RepairDetail | null
  trigger?: "button" | "icon" | "headerIcon"
  shopName?: string
  warrantyText?: string
  estado?: string
}

export function PrintMenuDropdown({
  repair: _repair,
  detail: _detail,
  trigger = "button",
  shopName: _shopName,
  warrantyText: _warrantyText,
  estado: _estado,
}: PrintMenuDropdownProps) {
  const [loading] = useState(false)

  const showPro = () => {
    toast({ title: "Impresion directa (PRO)", description: "PDF proximamente." })
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
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={showPro} className="cursor-pointer">
          Impresion directa (PRO) · Proximamente
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
