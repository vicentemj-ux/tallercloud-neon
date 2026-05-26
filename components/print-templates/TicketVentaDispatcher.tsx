"use client"

import { TicketVentaTemplate, type TicketVentaTemplateProps } from "./TicketVentaTemplate"
import { TicketVentaEquipoTemplate } from "./TicketVentaEquipoTemplate"

/**
 * Dispatcher de tickets de venta.
 *
 * Selecciona automáticamente el template correcto según los artículos de la venta:
 * - Si algún artículo tiene datos de hardware (marca, modelo o IMEI/Serie)
 *   → TicketVentaEquipoTemplate (diseño especializado con sección de dispositivo)
 * - En cualquier otro caso
 *   → TicketVentaTemplate (diseño estándar de mostrador)
 *
 * Para añadir un template nuevo (ej. Software), basta con:
 * 1. Crear TicketVentaSoftwareTemplate.tsx
 * 2. Agregar la condición aquí antes del fallback general.
 */
export function TicketVentaDispatcher(props: TicketVentaTemplateProps) {
  const hasEquipo = props.venta.items.some(
    (item) => item.marca || item.modelo || item.imei_serie
  )

  if (hasEquipo) {
    return <TicketVentaEquipoTemplate {...props} />
  }

  return <TicketVentaTemplate {...props} />
}
