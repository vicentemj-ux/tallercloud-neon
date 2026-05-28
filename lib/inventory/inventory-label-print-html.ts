import type { ProductoRow } from "@/lib/actions/productos"
import {
  getProductoCapacidad,
  getProductoModelo,
  isEquipoExhibitionCategory,
} from "@/components/dashboard/inventory-label-utils"

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const PAGE_AND_BODY = `
        * { margin:0; padding:0; box-sizing:border-box; }
        @media print {
          @page { margin: 0 !important; size: 50mm 25mm; }
          body { margin: 0 !important; }
        }
        html, body {
          width: 50mm;
          height: 25mm;
          overflow: hidden;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          background: #fff;
        }
`

/**
 * Documento completo para iframe de impresion (etiqueta inventario estandar o exhibicion EQUIPO).
 */
export function buildInventoryLabelPrintDocument(params: {
  producto: ProductoRow
  tallerNombre: string
  precioFormateado: string
  barcodeSvg: string
  showPrice?: boolean
}): string {
  const { producto, tallerNombre, precioFormateado, barcodeSvg, showPrice = true } = params

  if (isEquipoExhibitionCategory(producto)) {
    const modelo = getProductoModelo(producto)
    const capacidad = getProductoCapacidad(producto)
    const condicion = (producto.condicion ?? "").trim()
    const taller = esc((tallerNombre || "Mi Taller").toUpperCase())

    // Mismo layout que InventoryExhibitionLabel: flex-col 3 filas; sin IMEI/serie.
    const bodyHtml = `
      <div class="label label--exhibition">
        <div class="ex-inner">
          <div class="row1">
            <span class="taller-left">${taller}</span>
            <span class="cond-right">${condicion ? esc(condicion.toUpperCase()) : "&nbsp;"}</span>
          </div>
          <div class="row2">
            <div class="nombre">${esc(modelo.toUpperCase())}</div>
          </div>
          <div class="row3">
            <span class="cap-left">${capacidad ? esc(capacidad) : "&nbsp;"}</span>
            ${showPrice ? `<span class="price-right">${esc(precioFormateado)}</span>` : ""}
          </div>
        </div>
      </div>`

    return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <style>
        ${PAGE_AND_BODY}
        .label--exhibition {
          width: 50mm;
          height: 25mm;
          overflow: hidden;
          background: #fff;
          color: #000;
          box-sizing: border-box;
          box-shadow: none;
          border: none;
        }
        .label--exhibition .ex-inner {
          width: 100%;
          height: 100%;
          padding: 1mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }
        .label--exhibition .row1 {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          width: 100%;
          line-height: 1;
          flex-shrink: 0;
        }
        .label--exhibition .taller-left {
          font-size: 8px;
          font-weight: 700;
          text-transform: uppercase;
          color: #000;
          line-height: 1;
        }
        .label--exhibition .cond-right {
          font-size: 8px;
          text-transform: uppercase;
          text-align: right;
          max-width: 50%;
          color: #000;
          line-height: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .label--exhibition .row2 {
          width: 100%;
          flex: 1;
          min-height: 0;
          margin-top: auto;
          margin-bottom: auto;
          display: flex;
          align-items: center;
        }
        .label--exhibition .nombre {
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          line-height: 1.1;
          color: #000;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          width: 100%;
        }
        .label--exhibition .row3 {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          width: 100%;
          line-height: 1;
          flex-shrink: 0;
        }
        .label--exhibition .cap-left {
          font-size: 10px;
          font-weight: 800;
          color: #000;
          line-height: 1;
        }
        .label--exhibition .price-right {
          font-size: 1.25rem;
          font-weight: 900;
          letter-spacing: -0.05em;
          color: #000;
          line-height: 1;
        }
      </style>
    </head><body>${bodyHtml}</body></html>`
  }

  const nombreProd = (producto.nombre ?? "").toUpperCase()
  const numero = (producto.sku || producto.codigo_barras || "").trim()

  const bodyHtml = `
      <div class="label${showPrice ? "" : " label--no-price"}">
        <div class="name">${esc(nombreProd)}</div>
        ${barcodeSvg ? `<div class="barcode">${barcodeSvg}</div>` : ""}
        <div class="meta">
          ${numero ? `<div class="num">${esc(numero)}</div>` : `<div class="num">-</div>`}
          ${showPrice ? `<div class="price">${esc(precioFormateado)}</div>` : ""}
        </div>
      </div>`

  return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <style>
        ${PAGE_AND_BODY}
        .label {
          width: 50mm;
          height: 25mm;
          overflow: hidden;
          background: #fff;
          color: #000;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          padding: 1mm;
          box-sizing: border-box;
        }
        .name {
          width: 100%;
          text-align: center;
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 700;
          line-height: 1.1;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          color: #000;
        }
        .barcode {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0;
          padding: 0;
        }
        .barcode svg {
          width: 100%;
          height: 9mm;
        }
        .label--no-price .barcode {
          flex: 1;
        }
        .label--no-price .barcode svg {
          height: 10.5mm;
        }
        .meta {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: end;
          padding: 0 1mm;
          color: #000;
        }
        .num {
          font-size: 8px;
          font-weight: 500;
          color: #000;
          line-height: 1;
        }
        .label--no-price .meta {
          justify-content: center;
        }
        .label--no-price .num {
          font-size: 8.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-align: center;
        }
        .price {
          font-size: 12px;
          font-weight: 800;
          color: #000;
          line-height: 1;
        }
      </style>
    </head><body>${bodyHtml}</body></html>`
}
