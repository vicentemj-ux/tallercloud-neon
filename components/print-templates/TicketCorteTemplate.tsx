"use client"

import { cn } from "@/lib/utils"

type CorteVentaLinea = {
  id: string
  folio: string
  created_at: string
  total: number
}

type CorteMovimientoLinea = {
  id: string
  tipo: string
  descripcion: string | null
  folio?: string | null
  monto: number
}

type CorteGastoLinea = {
  id: string
  descripcion: string | null
  monto: number
}

export interface TicketCorteTemplateProps {
  businessName: string
  numeroCorte: number | null
  fechaApertura: string
  fechaCierre?: string | null
  cajeroNombre?: string
  tipoCierre?: string
  montoInicial: number
  ventasRegistradas: number
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
  totalAbonosEfectivo?: number
  totalAbonosTarjeta?: number
  totalAbonosTransferencia?: number
  efectivoEsperado: number
  efectivoContado?: number | null
  diferencia?: number | null
  totalVentasPdv?: number
  totalCobrosRep?: number
  totalGastos?: number
  notaCierre?: string | null
  ventas?: CorteVentaLinea[]
  cobrosRep?: CorteMovimientoLinea[]
  gastos?: CorteGastoLinea[]
  className?: string
}

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtCorte(n: number | null) {
  if (n === null) return "—"
  return `#${String(n).padStart(3, "0")}`
}

const TIPO_LABELS: Record<string, string> = {
  anticipo_reparacion: "ANTICIPO",
  liquidacion_reparacion: "LIQUIDACION",
  gasto: "GASTO",
}

export function TicketCorteTemplate({
  businessName,
  numeroCorte,
  fechaApertura,
  fechaCierre,
  cajeroNombre,
  tipoCierre,
  montoInicial,
  ventasRegistradas,
  totalEfectivo,
  totalTarjeta,
  totalTransferencia,
  totalAbonosEfectivo = 0,
  totalAbonosTarjeta = 0,
  totalAbonosTransferencia = 0,
  efectivoEsperado,
  efectivoContado,
  diferencia,
  totalVentasPdv = 0,
  totalCobrosRep = 0,
  totalGastos = 0,
  notaCierre,
  ventas = [],
  cobrosRep = [],
  gastos = [],
  className = "",
}: TicketCorteTemplateProps) {
  return (
    <div
      className={cn(
        "receipt-ticket box-border w-[76mm] max-w-[76mm] mx-auto bg-white text-black text-sm font-sans p-0.5 print:block",
        className
      )}
    >
      <div className="text-center leading-tight">
        <div className="text-xl font-extrabold uppercase text-black">{businessName}</div>
        <div className="text-base font-bold uppercase text-black">CORTE DE CAJA</div>
        <div className="text-sm font-semibold text-black">{fmtDate(fechaApertura)}</div>
        {cajeroNombre ? <div className="text-xs text-black">Cajero: {cajeroNombre}</div> : null}
      </div>

      <div className="border-y border-dashed border-black py-1 my-2 text-center font-bold uppercase text-black">
        Resumen General
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Corte</span>
          <span className="font-mono font-semibold text-black">{fmtCorte(numeroCorte)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Apertura</span>
          <span className="font-semibold text-black">{fmtTime(fechaApertura)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Cierre</span>
          <span className="font-semibold text-black">{fechaCierre ? fmtTime(fechaCierre) : "—"}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Tipo Cierre</span>
          <span className="font-semibold text-black">{tipoCierre ?? (notaCierre ? "Automatico" : "Manual")}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Fondo Inicial</span>
          <span className="font-mono font-semibold text-black">${fmt(montoInicial)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Ventas Registradas</span>
          <span className="font-semibold text-black">{ventasRegistradas}</span>
        </div>
      </div>

      <div className="border-y border-dashed border-black py-1 my-2 text-center font-bold uppercase text-black">
        Ventas PDV
      </div>
      {ventas.length === 0 ? (
        <p className="py-1 text-sm font-semibold text-black">Sin ventas registradas</p>
      ) : (
        <div className="space-y-1">
          {ventas.map((v) => (
            <div key={v.id} className="flex justify-between items-center w-full">
              <span className="min-w-0 truncate text-black">
                {v.folio} · {fmtTime(v.created_at)}
              </span>
              <span className="font-mono font-semibold text-black">${fmt(v.total)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center w-full py-1">
            <span className="font-semibold text-black">Subtotal PDV</span>
            <span className="font-mono font-semibold text-black">${fmt(totalVentasPdv)}</span>
          </div>
        </div>
      )}

      <div className="border-y border-dashed border-black py-1 my-2 text-center font-bold uppercase text-black">
        Cobros Reparaciones
      </div>
      {cobrosRep.length === 0 ? (
        <p className="py-1 text-sm font-semibold text-black">Sin cobros de reparaciones registrados</p>
      ) : (
        <div className="space-y-1">
          {cobrosRep.map((m) => (
            <div key={m.id} className="flex justify-between items-center w-full">
              <span className="min-w-0 truncate text-black">
                {m.folio ? `${m.folio} ` : ""}{TIPO_LABELS[m.tipo] ?? m.tipo.toUpperCase()}
              </span>
              <span className="font-mono font-semibold text-black">${fmt(m.monto)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center w-full py-1">
            <span className="font-semibold text-black">Subtotal Reparaciones</span>
            <span className="font-mono font-semibold text-black">${fmt(totalCobrosRep)}</span>
          </div>
        </div>
      )}

      <div className="border-y border-dashed border-black py-1 my-2 text-center font-bold uppercase text-black">
        Gastos Operativos
      </div>
      {gastos.length === 0 ? (
        <p className="py-1 text-sm font-semibold text-black">Sin gastos registrados</p>
      ) : (
        <div className="space-y-1">
          {gastos.map((g) => (
            <div key={g.id} className="flex justify-between items-center w-full">
              <span className="min-w-0 truncate text-black">{g.descripcion || "Gasto"}</span>
              <span className="font-mono font-semibold text-black">-${fmt(g.monto)}</span>
            </div>
          ))}
          <div className="flex justify-between items-center w-full py-1">
            <span className="font-semibold text-black">Total Gastos</span>
            <span className="font-mono font-semibold text-black">-${fmt(totalGastos)}</span>
          </div>
        </div>
      )}

      <div className="border-y border-dashed border-black py-1 my-2 text-center font-bold uppercase text-black">
        Resumen Final
      </div>
      <div className="space-y-1">
        {/* Desglose por metodo de pago */}
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Efectivo PDV</span>
          <span className="font-mono font-semibold text-black">${fmt(totalEfectivo)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Anticipos Efectivo</span>
          <span className="font-mono font-semibold text-black">${fmt(totalAbonosEfectivo)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Tarjeta</span>
          <span className="font-mono font-semibold text-black">${fmt(totalTarjeta + totalAbonosTarjeta)}</span>
        </div>
        <div className="flex justify-between items-center w-full">
          <span className="text-black">Transferencia</span>
          <span className="font-mono font-semibold text-black">${fmt(totalTransferencia + totalAbonosTransferencia)}</span>
        </div>

        {/* Formula del efectivo esperado en caja */}
        <div className="border-t border-dashed border-black pt-1 mt-1 space-y-0.5">
          <div className="flex justify-between items-center w-full">
            <span className="text-black">(+) Fondo Inicial</span>
            <span className="font-mono font-semibold text-black">${fmt(montoInicial)}</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-black">(+) Ventas PDV en efectivo + Anticipos</span>
            <span className="font-mono font-semibold text-black">${fmt(totalEfectivo + totalAbonosEfectivo)}</span>
          </div>
          <div className="flex justify-between items-center w-full">
            <span className="text-black">(-) Gastos</span>
            <span className="font-mono font-semibold text-black">-${fmt(totalGastos)}</span>
          </div>
          <div className="flex justify-between items-center w-full border-t border-black pt-1 font-bold">
            <span className="text-black">(=) Efectivo Esperado</span>
            <span className="font-mono text-black">${fmt(efectivoEsperado)}</span>
          </div>
        </div>

        {typeof efectivoContado === "number" && (
          <div className="flex justify-between items-center w-full pt-1">
            <span className="text-black">Efectivo Contado</span>
            <span className="font-mono font-semibold text-black">${fmt(efectivoContado)}</span>
          </div>
        )}
        {typeof diferencia === "number" && (
          <div className="flex justify-between items-center w-full border-t-2 border-black pt-2 text-lg font-extrabold">
            <span className="text-black">Diferencia</span>
            <span className="font-mono text-black">
              {diferencia >= 0 ? "+" : ""}${fmt(diferencia)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
