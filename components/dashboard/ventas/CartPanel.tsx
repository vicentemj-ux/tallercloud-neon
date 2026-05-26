"use client"

import { memo } from "react"
import { ShoppingBag, Banknote, CreditCard, Landmark, Plus, Minus, X, Check, AlertCircle, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ClientAutocomplete, type ClientAutocompletePayload } from "@/components/dashboard/client-autocomplete"

export type CartItem = {
  id: string
  nombre: string
  precio: number
  costo: number
  cantidad: number
  isSpecial: boolean
  productoId?: string
  referencia?: string
  esEquipo?: boolean
  imeiSerie?: string
  color?: string
  condicion?: string
  capacidad?: string
  marca?: string
  modelo?: string
  procesador?: string
  ram?: string
  almacenamiento?: string
}

type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "mixto"

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface CartPanelProps {
  cartItems: CartItem[]
  clienteKey: number
  onClientFound: (payload: ClientAutocompletePayload | null) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  metodoPago: MetodoPago
  onSelectMetodo: (m: MetodoPago) => void
  montoEfectivo: string
  onSetMontoEfectivo: (v: string) => void
  montoTarjeta: string
  onSetMontoTarjeta: (v: string) => void
  montoTransferencia: string
  onSetMontoTransferencia: (v: string) => void
  subtotal: number
  total: number
  descuentoAplicado: number
  onOpenDescuento: () => void
  cambio: number
  mixtoTotal: number
  saleError: string
  onSetSaleError: (v: string) => void
  onFinalizar: () => void
  onEnEspera: () => void
  cajaExists: boolean
}

export const CartPanel = memo(function CartPanel({
  cartItems,
  clienteKey,
  onClientFound,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  metodoPago,
  onSelectMetodo,
  montoEfectivo,
  onSetMontoEfectivo,
  montoTarjeta,
  onSetMontoTarjeta,
  montoTransferencia,
  onSetMontoTransferencia,
  subtotal,
  total,
  descuentoAplicado,
  onOpenDescuento,
  cambio,
  mixtoTotal,
  saleError,
  onSetSaleError,
  onFinalizar,
  onEnEspera,
  cajaExists,
}: CartPanelProps) {
  const itemCount = cartItems.reduce((s, i) => s + i.cantidad, 0)
  const pagoMode = metodoPago === "mixto" ? "mixto" : "unico"

  const handleSelectUnico = (m: MetodoPago) => {
    onSelectMetodo(m)
    onSetSaleError("")
  }

  const handleSelectMixto = () => {
    onSelectMetodo("mixto")
    onSetSaleError("")
  }

  return (
    <Card className="rounded-3xl border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
          <ShoppingBag className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-900">Tu Carrito</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {itemCount} artículo{itemCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Cliente */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Cliente</p>
        <ClientAutocomplete
          key={clienteKey}
          compact
          onClientFound={onClientFound}
        />
      </div>

      {/* Cart items or empty state */}
      <div className="px-5 py-6 min-h-[180px]">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="h-12 w-12 rounded-2xl border border-slate-100 flex items-center justify-center text-slate-300">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Carrito vacío</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cartItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3"
              >
                {/* Fila 1: nombre + cantidad */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-800 truncate pr-2">
                    {item.nombre}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onDecrement(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 text-slate-400 transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">{item.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => onIncrement(item.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 hover:bg-slate-50 text-slate-400 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Fila 2: precio + inversión + eliminar */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Precio</p>
                      <p className="text-sm font-black italic text-blue-600">${fmt(item.precio)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-rose-300">Inversión</p>
                      <p className="text-sm font-black italic text-rose-300">${fmt(item.costo)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="w-full text-center text-xs text-slate-400 hover:text-red-500 py-1 transition-colors"
              >
                Vaciar carrito
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payment section */}
      <div className="px-5 py-5 border-t border-slate-100 bg-slate-50/50 space-y-4">
        {/* Subtotal + descuento + total */}
        {descuentoAplicado > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Subtotal</p>
              <p className="text-lg font-black italic text-slate-400 line-through">${fmt(subtotal)}</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Descuento</p>
              </div>
              <p className="text-lg font-black italic text-blue-500">- ${fmt(descuentoAplicado)}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total a cobrar</p>
              <p className="text-3xl font-black italic text-slate-900">${fmt(total)}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total a cobrar</p>
            <p className="text-3xl font-black italic text-slate-900">${fmt(total)}</p>
          </div>
        )}

        {/* Aplicar descuento button */}
        {cartItems.length > 0 && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onOpenDescuento}
              className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Tag className="h-3 w-3" />
              Aplicar Descuento
            </button>
          </div>
        )}

        {/* Efectivo recibido + cambio */}
        {(metodoPago === "efectivo" || metodoPago === "mixto") && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Efectivo recibido</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={montoEfectivo}
                  onChange={(e) => {
                    onSetMontoEfectivo(e.target.value)
                    onSetSaleError("")
                  }}
                  className="pl-7 h-10 rounded-xl border-slate-200 bg-white text-sm font-bold text-slate-800"
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Cambio</p>
              <p className="text-2xl font-black italic text-slate-400">${fmt(cambio)}</p>
            </div>
          </div>
        )}

        {/* Mixto inputs */}
        {metodoPago === "mixto" && (
          <div className="space-y-2">
            {(
              [
                { label: "Efectivo", value: montoEfectivo, set: onSetMontoEfectivo, icon: Banknote },
                { label: "Tarjeta", value: montoTarjeta, set: onSetMontoTarjeta, icon: CreditCard },
                { label: "Transferencia", value: montoTransferencia, set: onSetMontoTransferencia, icon: Landmark },
              ] as const
            ).map(({ label, value, set, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={value}
                    onChange={(e) => {
                      set(e.target.value)
                      onSetSaleError("")
                    }}
                    className="pl-6 h-9 rounded-xl border-slate-200 bg-white text-sm"
                  />
                </div>
                <span className="text-[10px] font-bold uppercase text-slate-400 w-14 shrink-0">{label}</span>
              </div>
            ))}
            {mixtoTotal > 0 && (
              <p className={`text-xs font-semibold ${Math.abs(mixtoTotal - total) < 0.01 ? "text-emerald-600" : "text-red-500"}`}>
                {Math.abs(mixtoTotal - total) < 0.01
                  ? <><Check className="h-3 w-3 inline mr-0.5" />Correcto</>
                  : `Diferencia: $${fmt(Math.abs(mixtoTotal - total))}`}
              </p>
            )}
          </div>
        )}

        {/* Pago único / Pago mixto tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSelectUnico("efectivo")}
            className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
              pagoMode === "unico"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            PAGO ÚNICO
          </button>
          <button
            type="button"
            onClick={handleSelectMixto}
            className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${
              pagoMode === "mixto"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            PAGO MIXTO
          </button>
        </div>

        {/* Method buttons (only for pago único) */}
        {pagoMode === "unico" && (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { m: "efectivo" as const, label: "EFECTIVO", icon: Banknote },
                { m: "tarjeta" as const, label: "TARJETA", icon: CreditCard },
                { m: "transferencia" as const, label: "TRANSF.", icon: Landmark },
              ]
            ).map(({ m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectUnico(m)}
                className={`flex flex-col items-center justify-center gap-1 h-16 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all ${
                  metodoPago === m
                    ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/20"
                    : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {saleError && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {saleError}
          </p>
        )}

        {/* Finalizar + En espera */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={onFinalizar}
            disabled={cartItems.length === 0 || !cajaExists}
            className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider disabled:opacity-40 btn-glow"
          >
            Finalizar Venta
          </Button>
          <Button
            variant="outline"
            onClick={onEnEspera}
            disabled={cartItems.length === 0}
            className="h-11 rounded-xl border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 font-black text-xs uppercase tracking-wider disabled:opacity-40"
          >
            En espera
          </Button>
        </div>
      </div>
    </Card>
  )
})
