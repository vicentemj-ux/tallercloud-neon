"use client"

import { forwardRef } from "react"
import type { ProductoRow } from "@/lib/actions/productos-prisma"
import { getProductoCapacidad, getProductoModelo } from "@/components/dashboard/inventory-label-utils"

export interface InventoryExhibitionLabelProps {
  tallerNombre: string
  /**
   * Solo campos seguros para vitrina. Nunca incluir `imei_serie` ni datos de serie en props ni en UI.
   */
  producto: Pick<ProductoRow, "nombre" | "capacidad" | "almacenamiento" | "condicion" | "precio_venta">
  /** Formato de moneda ya localizado, ej. $1,234.56 */
  precioFormateado: string
  showPrice?: boolean
}

/**
 * Etiqueta de exhibicion 50Ã—25 mm (EQUIPO) â€” impresora termica.
 * Layout flex-col de 3 filas; nombre con line-clamp-2 para nombres largos. Sin IMEI/serie.
 */
const InventoryExhibitionLabel = forwardRef<HTMLDivElement, InventoryExhibitionLabelProps>(
  ({ tallerNombre, producto, precioFormateado, showPrice = true }, ref) => {
    const nombreProducto = getProductoModelo(producto)
    const capacidad = getProductoCapacidad(producto)
    const condicion = (producto.condicion ?? "").trim()

    return (
      <div
        ref={ref}
        className="inventory-exhibition-label mx-auto box-border h-[25mm] w-[50mm] bg-white font-sans text-black"
        style={{ color: "#000000", background: "#ffffff", boxShadow: "none" }}
      >
        <div className="flex h-full w-full flex-col justify-between overflow-hidden p-1 text-black">
          {/* Fila 1: taller | condicion */}
          <div className="flex w-full flex-none items-start justify-between leading-none">
            <span className="text-[8px] font-bold uppercase leading-none text-black">
              {(tallerNombre || "Mi Taller").toUpperCase()}
            </span>
            <span className="max-w-[50%] text-right text-[8px] uppercase leading-none text-black line-clamp-1">
              {condicion || "\u00A0"}
            </span>
          </div>

          {/* Fila 2: nombre del producto (critico) â€” max. 2 lineas */}
          <div className="my-auto flex min-h-0 w-full flex-1 items-center">
            <p className="line-clamp-2 w-full text-xs font-black uppercase leading-[1.1] text-black">
              {nombreProducto}
            </p>
          </div>

          {/* Fila 3: capacidad | precio */}
          <div className="flex w-full flex-none items-end justify-between leading-none">
            <span className="text-[10px] font-extrabold leading-none text-black">
              {capacidad || "\u00A0"}
            </span>
            {showPrice && (
              <span className="text-xl font-black tracking-tighter text-black">{precioFormateado}</span>
            )}
          </div>
        </div>
      </div>
    )
  }
)

InventoryExhibitionLabel.displayName = "InventoryExhibitionLabel"

export { InventoryExhibitionLabel }

