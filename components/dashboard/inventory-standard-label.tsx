"use client"

import { forwardRef, useEffect, useRef } from "react"

export interface InventoryStandardLabelProps {
  nombreUpper: string
  skuOrCodigo: string
  precioFormateado: string
  barcodeValue: string
  showBarcodePlaceholder: boolean
  showPrice?: boolean
}

/**
 * Etiqueta de inventario estándar 50×25 mm: nombre, código de barras, SKU/código y precio.
 * Usa jsbarcode directamente para evitar depender de react-barcode.
 */
const InventoryStandardLabel = forwardRef<HTMLDivElement, InventoryStandardLabelProps>(
  ({ nombreUpper, skuOrCodigo, precioFormateado, barcodeValue, showBarcodePlaceholder, showPrice = true }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
      if (!barcodeValue || !svgRef.current) return
      let cancelled = false
      import("jsbarcode").then(({ default: JsBarcode }) => {
        if (cancelled || !svgRef.current) return
        JsBarcode(svgRef.current, barcodeValue, {
          format: "EAN13",
          width: 1.2,
          height: 28,
          displayValue: false,
          lineColor: "#000000",
          background: "#ffffff",
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0,
        })
      })
      return () => { cancelled = true }
    }, [barcodeValue])

    return (
      <div
        ref={ref}
        className="mx-auto box-border flex h-[25mm] w-[50mm] flex-col items-center justify-between overflow-hidden bg-white p-1 font-sans text-black"
      >
        <p className="line-clamp-2 w-full text-center text-[10px] font-bold uppercase leading-tight text-black">
          {nombreUpper}
        </p>

        <div className={showPrice ? "flex w-full items-center justify-center" : "flex w-full flex-1 items-center justify-center"}>
          {barcodeValue ? (
            <div className="flex w-full items-center justify-center">
              <svg ref={svgRef} className={showPrice ? "w-full" : "h-[10.5mm] w-full"} />
            </div>
          ) : showBarcodePlaceholder ? (
            <div className="flex h-8 w-full items-center justify-center rounded-md border border-dashed border-black text-[8px] font-medium text-black">
              Sin código de barras válido (EAN-13)
            </div>
          ) : null}
        </div>

        <div className={showPrice ? "flex w-full items-end justify-between px-1" : "flex w-full items-end justify-center px-1"}>
          <p className={showPrice ? "text-[8px] font-medium text-black" : "text-center text-[8.5px] font-bold tracking-[0.02em] text-black"}>
            {skuOrCodigo}
          </p>
          {showPrice && <p className="text-xs font-extrabold text-black">{precioFormateado}</p>}
        </div>
      </div>
    )
  }
)

InventoryStandardLabel.displayName = "InventoryStandardLabel"

export { InventoryStandardLabel }
