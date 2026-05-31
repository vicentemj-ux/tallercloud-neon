import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FileText, Plus, Search, Trash2, UserRound } from "lucide-react"
import type { Cotizacion, CotizacionInput, CotizacionItemInput } from "@/lib/actions/cotizaciones"
import { searchClients, type Client } from "@/lib/actions/clients-prisma"

interface CotizacionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: Cotizacion | null
  onSubmit: (input: CotizacionInput) => Promise<void>
}

interface ItemState {
  descripcion: string
  cantidad: string
  precio_unitario: string
}

const EMPTY_ITEM: ItemState = { descripcion: "", cantidad: "1", precio_unitario: "0" }

export function CotizacionForm({ open, onOpenChange, initial, onSubmit }: CotizacionFormProps) {
  const [loading, setLoading] = useState(false)
  const [clienteId, setClienteId] = useState<string | null>(initial?.cliente_id ?? null)
  const [clienteNombre, setClienteNombre] = useState(initial?.cliente_nombre ?? "")
  const [clienteTelefono, setClienteTelefono] = useState(initial?.cliente_telefono ?? "")
  const [equipoTipo, setEquipoTipo] = useState(initial?.equipo_tipo ?? "Celular")
  const [marca, setMarca] = useState(initial?.marca ?? "")
  const [modelo, setModelo] = useState(initial?.modelo ?? "")
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "")
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "")
  const [descuento, setDescuento] = useState(initial ? String(initial.descuento) : "0")
  const [fechaExpiracion, setFechaExpiracion] = useState(initial?.fecha_expiracion ?? "")
  const [items, setItems] = useState<ItemState[]>(
    initial?.items?.length
      ? initial.items.map((it) => ({
          descripcion: it.descripcion,
          cantidad: String(it.cantidad),
          precio_unitario: String(it.precio_unitario),
        }))
      : [EMPTY_ITEM],
  )
  const [queryCliente, setQueryCliente] = useState("")
  const [results, setResults] = useState<Client[]>([])
  const [searchingClients, setSearchingClients] = useState(false)

  useEffect(() => {
    if (!open) return
    setClienteId(initial?.cliente_id ?? null)
    setClienteNombre(initial?.cliente_nombre ?? "")
    setClienteTelefono(initial?.cliente_telefono ?? "")
    setEquipoTipo(initial?.equipo_tipo ?? "Celular")
    setMarca(initial?.marca ?? "")
    setModelo(initial?.modelo ?? "")
    setDescripcion(initial?.descripcion ?? "")
    setObservaciones(initial?.observaciones ?? "")
    setDescuento(initial ? String(initial.descuento) : "0")
    setFechaExpiracion(initial?.fecha_expiracion ?? "")
    setItems(
      initial?.items?.length
        ? initial.items.map((it) => ({
            descripcion: it.descripcion,
            cantidad: String(it.cantidad),
            precio_unitario: String(it.precio_unitario),
          }))
        : [EMPTY_ITEM],
    )
    setQueryCliente(initial?.cliente_nombre ?? "")
    setResults([])
  }, [open, initial])

  const selectedClientLabel = useMemo(() => {
    if (!clienteId) return ""
    return `${clienteNombre} (${clienteTelefono || "Sin telefono"})`
  }, [clienteId, clienteNombre, clienteTelefono])

  const parsedItems = useMemo<CotizacionItemInput[]>(
    () =>
      items
        .map((item) => ({
          descripcion: item.descripcion.trim(),
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        }))
        .filter((item) => item.descripcion && item.cantidad > 0 && item.precio_unitario >= 0),
    [items],
  )

  const subtotal = useMemo(
    () => parsedItems.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0),
    [parsedItems],
  )
  const descuentoNum = Math.min(Math.max(Number(descuento || 0), 0), subtotal)
  const total = Math.max(0, subtotal - descuentoNum)

  const setItemField = (idx: number, key: keyof ItemState, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item)))
  }

  const resetAndClose = () => {
    onOpenChange(false)
  }

  const runClientSearch = async (value: string) => {
    setQueryCliente(value)
    if (clienteId) setClienteId(null)
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setSearchingClients(true)
    const { clients, error } = await searchClients(q)
    if (!error) {
      setResults(clients.slice(0, 8))
    }
    setSearchingClients(false)
  }

  const selectClient = (client: Client) => {
    setClienteId(client.id)
    setClienteNombre(client.nombre)
    setClienteTelefono(client.telefono || "")
    setQueryCliente(client.nombre)
    setResults([])
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clienteNombre.trim() || !parsedItems.length) return

    setLoading(true)
    await onSubmit({
      cliente_id: clienteId,
      cliente_nombre: clienteNombre.trim(),
      cliente_telefono: clienteTelefono.trim() || null,
      equipo_tipo: equipoTipo.trim() || "Celular",
      marca: marca.trim(),
      modelo: modelo.trim(),
      descripcion: descripcion.trim(),
      observaciones: observaciones.trim() || null,
      descuento: descuentoNum,
      fecha_expiracion: fechaExpiracion || null,
      items: parsedItems,
    })
    setLoading(false)
    resetAndClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl">
        <DialogHeader className="rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight text-slate-900">
                {initial ? `Editar cotizacion ${initial.folio}` : "Nueva cotizacion"}
              </DialogTitle>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                Genera un presupuesto formal de reparacion
              </p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 p-5 md:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              Cliente registrado (opcional)
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={queryCliente}
                onChange={(e) => runClientSearch(e.target.value)}
                placeholder="Buscar cliente por nombre o telefono..."
                className="bg-white pl-9"
              />
            </div>
            {searchingClients ? <p className="mt-2 text-xs text-slate-500">Buscando clientes...</p> : null}
            {!searchingClients && results.length > 0 ? (
              <div className="mt-2 rounded-xl border border-slate-200 bg-white">
                {results.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{client.nombre}</span>
                    <span className="text-xs text-slate-500">{client.telefono}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {clienteId ? (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs font-semibold text-blue-700">{selectedClientLabel}</p>
                <Button
                  type="button"
                  onClick={() => {
                    setClienteId(null)
                    setQueryCliente("")
                  }}
                  className="h-7 rounded-lg border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Quitar
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Informacion del cliente</p>
              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={clienteNombre}
                    onChange={(e) => {
                      setClienteNombre(e.target.value)
                      if (clienteId) setClienteId(null)
                    }}
                    placeholder="Nombre del cliente *"
                    className="pl-9"
                  />
                </div>
                <Input
                  value={clienteTelefono}
                  onChange={(e) => {
                    setClienteTelefono(e.target.value)
                    if (clienteId) setClienteId(null)
                  }}
                  placeholder="Telefono para WhatsApp"
                />
              </div>
            </section>
            <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Dispositivo</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input value={equipoTipo} onChange={(e) => setEquipoTipo(e.target.value)} placeholder="Tipo de equipo" />
                <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Modelo" />
                <Input type="date" value={fechaExpiracion} onChange={(e) => setFechaExpiracion(e.target.value)} />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Detalles de la falla</p>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe la falla reportada por el cliente y el diagnostico preliminar..."
                className="min-h-28"
              />
            </section>
            <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Notas adicionales</p>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Garantia, condiciones, tiempos estimados o notas internas."
                className="min-h-28"
              />
            </section>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Servicios y refacciones</p>
              <Button
                type="button"
                onClick={() => setItems((prev) => [...prev, EMPTY_ITEM])}
                className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Agregar item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={`item-${idx}`} className="grid grid-cols-12 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                  <Input
                    value={item.descripcion}
                    onChange={(e) => setItemField(idx, "descripcion", e.target.value)}
                    placeholder="Descripcion"
                    className="col-span-12 md:col-span-6"
                  />
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={item.cantidad}
                    onChange={(e) => setItemField(idx, "cantidad", e.target.value)}
                    placeholder="Cantidad"
                    className="col-span-4 md:col-span-2"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.precio_unitario}
                    onChange={(e) => setItemField(idx, "precio_unitario", e.target.value)}
                    placeholder="Precio unitario"
                    className="col-span-6 md:col-span-3"
                  />
                  <Button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-2 h-10 rounded-lg border border-slate-200 bg-white px-0 text-slate-500 hover:bg-slate-100"
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
            <div />
            <div className="w-full rounded-2xl border border-blue-200 bg-blue-50/60 p-4 md:w-[320px]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Costo total estimado</p>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                placeholder="Descuento"
                className="mt-3 bg-white"
              />
              <div className="mt-3 space-y-1.5 border-t border-blue-200 pt-3">
                <p className="flex justify-between text-sm text-slate-700"><span>Subtotal</span><strong>${subtotal.toFixed(2)}</strong></p>
                <p className="flex justify-between text-sm text-slate-700"><span>Descuento</span><strong>${descuentoNum.toFixed(2)}</strong></p>
                <p className="flex justify-between text-lg font-black text-blue-700"><span>Total</span><strong>${total.toFixed(2)}</strong></p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" onClick={resetAndClose} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-100">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !clienteNombre.trim() || !parsedItems.length}
              className="btn-glow h-11 rounded-xl bg-blue-600 px-6 text-white hover:bg-blue-700"
            >
              {loading ? "Guardando..." : initial ? "Guardar cambios" : "Crear cotizacion"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
