"use client"

import { TicketVentaTemplate, type TicketVentaTemplateProps } from "./TicketVentaTemplate"
import { TicketVentaEquipoTemplate } from "./TicketVentaEquipoTemplate"

/**
 * Dispatcher de tickets de venta.
 *
 * Selecciona automaticamente el template correcto segun los articulos de la venta:
 * - Si algun articulo tiene datos de hardware (marca, modelo o IMEI/Serie)
 *   → TicketVentaEquipoTemplate (diseno especializado con seccion de dispositivo)
 * - En cualquier otro caso
 *   → TicketVentaTemplate (diseno estandar de mostrador)
 *
 * Para anadir un template nuevo (ej. Software), basta con:
 * 1. Crear TicketVentaSoftwareTemplate.tsx
 * 2. Agregar la condicion aqui antes del fallback general.
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
