"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

const OPEN_NEW_TICKET_HREF = "/dashboard/reparaciones?openNewTicket=1"

/**
 * Boton "+ Nueva Reparacion" que abre el modal de nuevo ticket en la pagina Reparaciones.
 * Navega a Reparaciones con ?openNewTicket=1 para que el modal se abra limpio.
 */
export function NewRepairButton({
  className,
  variant = "default",
}: {
  className?: string
  variant?: "default" | "sidebar"
}) {
  if (variant === "sidebar") {
    return (
      <Button className={className} asChild>
        <Link href={OPEN_NEW_TICKET_HREF}>
          <Plus className="h-4 w-4" />
          Nueva Reparacion
        </Link>
      </Button>
    )
  }

  return (
    <Button className={className} asChild>
      <Link href={OPEN_NEW_TICKET_HREF}>
        <Plus className="h-5 w-5" />
        <span>Nueva Reparacion</span>
      </Link>
    </Button>
  )
}
