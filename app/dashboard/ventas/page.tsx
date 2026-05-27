"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useDataFetchPerf } from "@/hooks/use-data-fetch-perf"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Download,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Smartphone,
  User,
  Wrench,
  X,
} from "lucide-react"
import { getInventoryCanonicalImageUrl } from "@/lib/storage"
import {
  getProductosDisponibles,
  crearVenta,
  type ProductoDisponible,
  type DetalleVentaInput,
  type VentaCreada,
} from "@/lib/actions/ventas"
import { HistorialCaja } from "@/components/dashboard/historial-caja"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { ArqueoModal } from "@/components/dashboard/ventas/ArqueoModal"
import { CartPanel } from "@/components/dashboard/ventas/CartPanel"
import { DescuentoModal } from "@/components/dashboard/ventas/DescuentoModal"
import { SpecialModal } from "@/components/dashboard/ventas/SpecialModal"
import { ConfirmModal } from "@/components/dashboard/ventas/ConfirmModal"
import { SuccessModal } from "@/components/dashboard/ventas/SuccessModal"
import { VentaEnEsperaConfirm } from "@/components/dashboard/ventas/VentaEnEsperaConfirm"
import { VentasEnEsperaModal } from "@/components/dashboard/ventas/VentasEnEsperaModal"
import { type ClientAutocompletePayload } from "@/components/dashboard/client-autocomplete"
import { CajaProvider, useCajaContext } from "@/lib/context/caja-context"
import { getReparacionesListas, type RepairOrder } from "@/lib/actions/repairs"
import { guardarVentaEnEspera, getVentasEnEspera, type VentaEnEspera } from "@/lib/ventas-en-espera"

// ─── Types ───────────────────────────────────────────────────────────────────

type CartItem = {
  id: string
  nombre: string
  precio: number
  costo: number
  cantidad: number
  isSpecial: boolean
  productoId?: string
  referencia?: string
  categoria?: string
  // Device fields (es_equipo = true)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ProductThumb({ src, alt, productId, tallerId }: { src: string | null; alt: string; productId?: string; tallerId?: string }) {
  const [broken, setBroken] = useState(false)
  const canonical =
    tallerId && productId ? getInventoryCanonicalImageUrl(tallerId, productId) : null
  const effectiveSrc =
    src && src.toLowerCase().endsWith(".webp") ? src : canonical ?? src

  if (!effectiveSrc || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </div>
    )
  }
  return (
    <img
      src={effectiveSrc}
      alt={alt}
      onError={() => setBroken(true)}
      className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
      loading="lazy"
    />
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function VentasPageContent() {
  const router = useRouter()
  const { startFetch, stopFetch } = useDataFetchPerf("ventas")
  const { caja, refresh } = useCajaContext()

  // ── Products state ──────────────────────────────────────────────────────────
  const [productos, setProductos] = useState<ProductoDisponible[]>([])
  const [productosLoading, setProductosLoading] = useState(true)
  const [productosError, setProductosError] = useState<string | null>(null)
  const [searchProduct, setSearchProduct] = useState("")

  // ── Cart state ──────────────────────────────────────────────────────────────
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [clienteNombre, setClienteNombre] = useState("")
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteTelefono, setClienteTelefono] = useState("")
  const [clienteKey, setClienteKey] = useState(0)

  // ── Special product modal ───────────────────────────────────────────────────
  const [showSpecial, setShowSpecial] = useState(false)

  // ── Payment state ───────────────────────────────────────────────────────────
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("efectivo")
  const [montoEfectivo, setMontoEfectivo] = useState("")
  const [montoTarjeta, setMontoTarjeta] = useState("")
  const [montoTransferencia, setMontoTransferencia] = useState("")

  // ── Sale flow ───────────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  const [saleLoading, setSaleLoading] = useState(false)
  const [ventaCreada, setVentaCreada] = useState<VentaCreada | null>(null)
  const [saleError, setSaleError] = useState("")

  // ── Discount state ───────────────────────────────────────────────────────────
  const [descuentoAplicado, setDescuentoAplicado] = useState(0)
  const [showDescuento, setShowDescuento] = useState(false)

  // ── Ventas en espera ─────────────────────────────────────────────────────────
  const [showVentaEnEsperaConfirm, setShowVentaEnEsperaConfirm] = useState(false)
  const [showVentasEnEspera, setShowVentasEnEspera] = useState(false)
  const [ventasEnEsperaCount, setVentasEnEsperaCount] = useState(0)

  // ── Tab navigation ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"pos" | "historial">("pos")
  const [bottomTab, setBottomTab] = useState<"inventario" | "reparaciones" | "aprobaciones">("inventario")

  // ── User info ───────────────────────────────────────────────────────────────
  const [userName, setUserName] = useState<string>("Usuario")

  // ── Arqueo modal ────────────────────────────────────────────────────────────
  const [showArqueo, setShowArqueo] = useState(false)

  // ── Reparaciones listas ─────────────────────────────────────────────────────
  const [reparacionesListas, setReparacionesListas] = useState<RepairOrder[]>([])
  const [reparacionesLoading, setReparacionesLoading] = useState(false)
  const [searchReparacion, setSearchReparacion] = useState("")

  // ── Taller settings ──────────────────────────────────────────────────────────
  const [tallerSettings, setTallerSettings] = useState({
    nombre_taller: "Mi Taller",
    telefono: "",
    tamano_papel: "80mm" as "58mm" | "80mm",
    logo_url: null as string | null,
    terminos_garantia: "",
    mensaje_despedida: "",
    impresora_ticket: null as string | null,
    direccion: "",
  })
  useEffect(() => {
    // Quick name from cookie (sync)
    try {
      const raw = document.cookie.split("tallerName=")[1]?.split(";")[0]
      if (raw) setTallerSettings((p) => ({ ...p, nombre_taller: decodeURIComponent(raw) }))
    } catch {}
    // Full settings from DB (async)
    getTallerSettings().then(({ settings }) => {
      if (settings) {
        const s = settings as {
          nombre_taller?: string
          telefono?: string
          tamano_papel?: string
          logo_url?: string | null
          terminos_garantia?: string
          impresora_ticket?: string | null
          direccion?: string
        }
        setTallerSettings({
          nombre_taller: s.nombre_taller || "Mi Taller",
          telefono: s.telefono || "",
          tamano_papel: (s.tamano_papel as "58mm" | "80mm") || "80mm",
          logo_url: s.logo_url ?? null,
          terminos_garantia: s.terminos_garantia || "",
          mensaje_despedida: (s as any).mensaje_despedida || "",
          impresora_ticket: s.impresora_ticket ?? null,
          direccion: s.direccion || "",
        })
      }
    })
  }, [])

  // ── Load user name on mount ────────────────────────────────────────────────
  useEffect(() => {
    const raw = document.cookie.split("tallerName=")[1]?.split(";")[0]
    if (raw) setUserName(decodeURIComponent(raw).split(" ")[0] || "Usuario")
  }, [])

  // Load reparaciones on mount (eager fetch)
  useEffect(() => {
    setReparacionesLoading(true)
    getReparacionesListas().then(({ data }) => {
      if (data) setReparacionesListas(data)
      setReparacionesLoading(false)
    })
  }, [])

  // ── Load productos on mount ────────────────────────────────────────────────
  const loadProductos = useCallback(async () => {
    setProductosLoading(true)
    setProductosError(null)
    startFetch()
    const { data, error } = await getProductosDisponibles()
    setProductos(data)
    if (error) setProductosError(error)
    setProductosLoading(false)
    stopFetch()
  }, [startFetch, stopFetch])

  useEffect(() => {
    loadProductos()
  }, [loadProductos])

  // ── Count ventas en espera on mount ──────────────────────────────────────────
  useEffect(() => {
    setVentasEnEsperaCount(getVentasEnEspera().length)
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => Math.round(cartItems.reduce((sum, item) => sum + item.precio * item.cantidad, 0) * 100) / 100,
    [cartItems]
  )
  const total = useMemo(
    () => Math.max(0, Math.round((subtotal - descuentoAplicado) * 100) / 100),
    [subtotal, descuentoAplicado]
  )

  const cambio = useMemo(() => {
    if (metodoPago === "efectivo") {
      const recibido = Math.round((parseFloat(montoEfectivo.replace(",", ".")) || 0) * 100) / 100
      return Math.max(0, Math.round((recibido - total) * 100) / 100)
    }
    return 0
  }, [metodoPago, montoEfectivo, total])

  const filteredProductos = useMemo(() => {
    const q = searchProduct.toLowerCase().trim()
    if (!q) return productos
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.categoria ?? "").toLowerCase().includes(q) ||
        (p.imei_serie ?? "").toLowerCase().includes(q)
    )
  }, [productos, searchProduct])

  const filteredReparaciones = useMemo(() => {
    const q = searchReparacion.toLowerCase().trim()
    if (!q) return reparacionesListas
    return reparacionesListas.filter(
      (r) =>
        r.folio.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.device.toLowerCase().includes(q) ||
        r.phone.includes(q)
    )
  }, [reparacionesListas, searchReparacion])

  // ── Payment totals for mixto ─────────────────────────────────────────────────
  const mixtoTotal = useMemo(() => {
    if (metodoPago !== "mixto") return 0
    const e = parseFloat(montoEfectivo.replace(",", ".")) || 0
    const t = parseFloat(montoTarjeta.replace(",", ".")) || 0
    const tr = parseFloat(montoTransferencia.replace(",", ".")) || 0
    return e + t + tr
  }, [metodoPago, montoEfectivo, montoTarjeta, montoTransferencia])

  // ── Cart actions ─────────────────────────────────────────────────────────────
  function addProducto(p: ProductoDisponible) {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productoId === p.id)
      if (existing) {
        // Devices with IMEI are unique — never more than 1
        if (p.es_equipo && p.imei_serie) return prev
        if (existing.cantidad >= p.stock_actual) return prev
        return prev.map((i) =>
          i.productoId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i
        )
      }
      return [
        ...prev,
        {
          id: `prod-${p.id}`,
          nombre: p.nombre,
          precio: Math.round(Number(p.precio_venta) * 100) / 100,
          costo: Math.round(Number(p.costo) * 100) / 100,
          cantidad: 1,
          isSpecial: false,
          productoId: p.id,
          categoria: p.categoria ?? undefined,
          esEquipo: p.es_equipo,
          imeiSerie: p.imei_serie ?? undefined,
          color: p.color ?? undefined,
          condicion: p.condicion ?? undefined,
          capacidad: p.capacidad ?? undefined,
          marca: p.marca ?? undefined,
          modelo: p.modelo ?? undefined,
          procesador: p.procesador ?? undefined,
          ram: p.ram ?? undefined,
          almacenamiento: p.almacenamiento ?? undefined,
        },
      ]
    })
  }

  function increment(id: string) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const maxStock = item.productoId
          ? (productos.find((p) => p.id === item.productoId)?.stock_actual ?? Infinity)
          : Infinity
        if (item.cantidad >= maxStock) return item
        return { ...item, cantidad: item.cantidad + 1 }
      })
    )
  }

  function decrement(id: string) {
    setCartItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, cantidad: item.cantidad - 1 } : item))
        .filter((item) => item.cantidad > 0)
    )
  }

  function removeItem(id: string) {
    setCartItems((prev) => prev.filter((item) => item.id !== id))
  }

  function clearCart() {
    setCartItems([])
    setClienteNombre("")
    setClienteId(null)
    setClienteTelefono("")
    setClienteKey((k) => k + 1)
    setMetodoPago("efectivo")
    setMontoEfectivo("")
    setMontoTarjeta("")
    setMontoTransferencia("")
    setSaleError("")
    setDescuentoAplicado(0)
  }

  // ── Ventas en espera ─────────────────────────────────────────────────────────
  function handleEnEspera() {
    if (cartItems.length === 0) return
    const venta: VentaEnEspera = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      cartItems: cartItems.map((item) => ({ ...item })),
      clienteNombre,
      clienteId,
      clienteTelefono,
      descuentoAplicado,
      metodoPago,
      montoEfectivo,
      montoTarjeta,
      montoTransferencia,
    }
    guardarVentaEnEspera(venta)
    clearCart()
    setVentasEnEsperaCount(getVentasEnEspera().length)
    setShowVentaEnEsperaConfirm(true)
  }

  function handleRecuperarVentaEnEspera(venta: VentaEnEspera) {
    setCartItems(venta.cartItems.map((item) => ({ ...item })))
    setClienteNombre(venta.clienteNombre)
    setClienteId(venta.clienteId)
    setClienteTelefono(venta.clienteTelefono)
    setDescuentoAplicado(venta.descuentoAplicado)
    setMetodoPago(venta.metodoPago as MetodoPago)
    setMontoEfectivo(venta.montoEfectivo)
    setMontoTarjeta(venta.montoTarjeta)
    setMontoTransferencia(venta.montoTransferencia)
    setClienteKey((k) => k + 1)
    setVentasEnEsperaCount(getVentasEnEspera().length)
  }

  // ── Payment method selection ─────────────────────────────────────────────────
  function selectMetodo(m: MetodoPago) {
    setMetodoPago(m)
    setMontoEfectivo("")
    setMontoTarjeta("")
    setMontoTransferencia("")
    setSaleError("")
  }

  // ── Validate & open confirm modal ────────────────────────────────────────────
  function handleFinalizarVenta() {
    setSaleError("")
    if (cartItems.length === 0) {
      setSaleError("El carrito está vacío")
      return
    }
    if (metodoPago === "efectivo") {
      const recibido = Math.round((parseFloat(montoEfectivo.replace(",", ".")) || 0) * 100) / 100
      if (Number(recibido.toFixed(2)) < Number(total.toFixed(2))) {
        setSaleError(`El monto recibido ($${fmt(recibido)}) es menor al total ($${fmt(total)})`)
        return
      }
    }
    if (metodoPago === "mixto") {
      const diff = Math.abs(mixtoTotal - total)
      if (diff > 0.01) {
        setSaleError(
          `La suma de métodos ($${fmt(mixtoTotal)}) no coincide con el total ($${fmt(total)})`
        )
        return
      }
    }
    setShowConfirm(true)
  }

  // ── Confirm sale ─────────────────────────────────────────────────────────────
  async function handleConfirmSale() {
    setSaleLoading(true)
    setSaleError("")

    const efectivo =
      metodoPago === "efectivo"
        ? Math.round((parseFloat(montoEfectivo.replace(",", ".")) || total) * 100) / 100
        : metodoPago === "mixto"
          ? Math.round((parseFloat(montoEfectivo.replace(",", ".")) || 0) * 100) / 100
          : 0

    const tarjeta =
      metodoPago === "tarjeta"
        ? total
        : metodoPago === "mixto"
          ? parseFloat(montoTarjeta.replace(",", ".")) || 0
          : 0

    const transferencia =
      metodoPago === "transferencia"
        ? total
        : metodoPago === "mixto"
          ? parseFloat(montoTransferencia.replace(",", ".")) || 0
          : 0

    const items: DetalleVentaInput[] = cartItems.map((item) => ({
      producto_id: item.productoId,
      descripcion: item.nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      costo_unitario: item.costo,
      es_especial: item.isSpecial,
      categoria: item.categoria,
      imei_serie: item.imeiSerie,
      color: item.color,
      condicion: item.condicion,
      marca: item.marca,
      modelo: item.modelo,
      procesador: item.procesador,
      ram: item.ram,
      almacenamiento: item.almacenamiento,
    }))

    const { venta, error: err } = await crearVenta({
      caja_id: caja?.id ?? null,
      cliente_nombre: clienteNombre.trim() || undefined,
      cliente_id: clienteId ?? undefined,
      cliente_telefono: clienteTelefono || undefined,
      total,
      descuento: descuentoAplicado,
      metodo_pago: metodoPago,
      monto_efectivo: efectivo,
      monto_tarjeta: tarjeta,
      monto_transferencia: transferencia,
      cambio,
      items,
    })

    setSaleLoading(false)
    setShowConfirm(false)

    if (err || !venta) {
      setSaleError(err ?? "Error al guardar la venta")
      return
    }

    // Refresh caja totals
    refresh()

    // Refresh stock
    loadProductos()

    setVentaCreada(venta)
    clearCart()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const terminosVenta = (tallerSettings as any).impresion_config?.venta?.terminos ?? tallerSettings.terminos_garantia ?? ""

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`max-w-7xl mx-auto w-full px-6 sm:px-8 lg:px-10 py-10 flex flex-col gap-8 ${activeTab !== "historial" && bottomTab === "inventario" && cartItems.length > 0 ? "pb-24 lg:pb-10" : ""}`}>
      {/* HEADER */}
      {activeTab === "historial" ? (
        <div className="flex flex-col gap-5">
          {/* Header historial */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div>
              <button
                onClick={() => setActiveTab("pos")}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 hover:text-blue-700 transition-colors mb-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Punto de Venta
              </button>
              <h1 className="text-3xl font-black italic uppercase tracking-tight text-slate-900">
                Historial de <span className="text-blue-600">Cortes</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                Auditoría centralizada y conciliación bancaria
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold uppercase gap-2 text-xs h-11 px-4 shadow-sm"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar en notas o cajero..."
                  className="h-11 w-full sm:w-64 rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" />
                  Fecha inicio
                </p>
                <input
                  type="date"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" />
                  Fecha fin
                </p>
                <input
                  type="date"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  Filtrar por cajero
                </p>
                <select className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none">
                  <option>Todos los cajeros</option>
                </select>
              </div>
              <div className="flex items-end">
                <button className="h-11 w-full rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors">
                  Limpiar filtros
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tight text-slate-900">
              PUNTO DE VENTA
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-0.5">
              ACCESORIOS Y REPUESTOS
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {caja && (
              <button
                onClick={() => setShowArqueo(true)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-left hover:bg-emerald-100/60 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-500 shadow-sm">
                  <Banknote className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 leading-none">
                    {userName} CAJA
                  </p>
                  <p className="text-base font-black text-slate-900 leading-none mt-1">
                    $ {fmt(caja.monto_inicial + caja.total_efectivo)}
                  </p>
                </div>
              </button>
            )}

            <Button
              onClick={() => setShowArqueo(true)}
              disabled={!caja}
              className="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 font-bold uppercase gap-2 disabled:opacity-40 rounded-2xl px-4 py-2.5 h-auto"
            >
              <Calculator className="h-4 w-4" />
              Mi Arqueo
            </Button>

            <Button
              onClick={() => setActiveTab("historial")}
              variant="outline"
              className="border-slate-200 text-slate-600 hover:bg-slate-50 font-bold uppercase gap-2 rounded-2xl px-4 py-2.5 h-auto"
            >
              <Clock className="h-4 w-4" />
              Historial
            </Button>

            <Button
              onClick={() => router.push("/dashboard/corte")}
              disabled={!caja}
              variant="outline"
              className="border-slate-200 text-red-500 hover:bg-red-50 font-bold uppercase gap-2 disabled:opacity-40 rounded-2xl px-4 py-2.5 h-auto"
            >
              <X className="h-4 w-4" />
              Corte
            </Button>
          </div>
        </div>
      )}

      {activeTab !== "historial" && (
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-4 w-full lg:flex-[2]">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1.5 shadow-sm">
            {(
              [
                { key: "inventario", label: "INVENTARIO", icon: Package },
                { key: "reparaciones", label: "REPARACIONES", icon: Wrench },
                { key: "aprobaciones", label: "APROBACIONES", icon: ClipboardCheck },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setBottomTab(key)}
                className={`flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold tracking-tight transition-colors ${
                  bottomTab === key
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {key === "reparaciones" && reparacionesListas.length > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 ml-1">{reparacionesListas.length}</Badge>
                )}
              </button>
            ))}
          </div>

          {bottomTab === "inventario" && (<>
            {/* MAIN CONTENT */}
            <div className="flex flex-col gap-4">
              {/* Search & special button */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Buscar productos"
                    placeholder="Buscar por nombre, SKU o categoría..."
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  onClick={() => setShowSpecial(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase gap-2 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  Producto / Servicio Rápido
                </Button>
                <button
                  type="button"
                  onClick={() => setShowVentasEnEspera(true)}
                  className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-amber-600 hover:bg-amber-100 transition-colors"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Ventas en espera
                  {ventasEnEsperaCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-black text-white">
                      {ventasEnEsperaCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Product grid */}
              <Card className="flex-1 rounded-3xl border-slate-200 bg-white shadow-sm overflow-hidden">
                <CardContent className="p-4">
                  {productosLoading ? (
                    <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                      Cargando inventario...
                    </div>
                  ) : productosError ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                      <AlertCircle className="h-10 w-10 text-red-400" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-red-600">Error al cargar el inventario</p>
                        <button
                          type="button"
                          onClick={loadProductos}
                          className="mt-1.5 text-xs text-blue-600 underline hover:text-blue-700 transition-colors"
                        >
                          Reintentar
                        </button>
                      </div>
                    </div>
                  ) : filteredProductos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                      <Package className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {searchProduct ? "Sin resultados" : "Sin productos con stock"}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {searchProduct
                            ? "Intenta con otro término"
                            : "Agrega productos en el módulo Inventario"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 overflow-y-auto pr-1 lg:max-h-[min(52vh,560px)]">
                      {filteredProductos.map((p) => {
                        const inCart = cartItems.find((i) => i.productoId === p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProducto(p)}
                            className="group relative flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50"
                          >
                            {inCart && (
                              <span className="absolute right-2 top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white tabular-nums">
                                {inCart.cantidad}
                              </span>
                            )}
                            <ProductThumb src={p.imagen_url} alt={p.nombre} productId={p.id} tallerId={p.taller_id} />
                            <div className="min-w-0 flex-1 pr-6">
                              <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
                                {p.nombre}
                              </p>
                              {p.categoria && (
                                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {p.categoria}
                                </p>
                              )}
                              {p.es_equipo && (p.imei_serie || p.color || p.condicion) && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {p.imei_serie && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] leading-tight text-slate-600">
                                      …{p.imei_serie.slice(-6)}
                                    </span>
                                  )}
                                  {p.color && (
                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] leading-tight text-blue-600">
                                      {p.color}
                                    </span>
                                  )}
                                  {p.condicion && (
                                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] leading-tight text-emerald-600">
                                      {p.condicion}
                                    </span>
                                  )}
                                </div>
                              )}
                              <p className="mt-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                                Stock <span className="text-slate-800">{p.stock_actual}</span>
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold tabular-nums text-blue-600">${fmt(p.precio_venta)}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>)}

          {bottomTab === "reparaciones" && (<div id="panel-reparaciones" role="tabpanel" tabIndex={0} className="space-y-5">
            {/* Top actions row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  aria-label="Buscar folio o cliente"
                  placeholder="Buscar folio o cliente..."
                  value={searchReparacion}
                  onChange={(e) => setSearchReparacion(e.target.value)}
                  className="pl-10 rounded-2xl border-slate-200 bg-white h-11"
                />
              </div>
              <Button
                onClick={() => router.push("/dashboard/compras/usados")}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase gap-2 whitespace-nowrap rounded-2xl h-11 px-5"
              >
                <Smartphone className="h-4 w-4" />
                Comprar equipo
              </Button>
              <Button
                onClick={() => setShowSpecial(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase gap-2 whitespace-nowrap rounded-2xl h-11 px-5"
              >
                <Plus className="h-4 w-4" />
                Producto / servicio rápido
              </Button>
              <button
                type="button"
                onClick={() => setShowVentasEnEspera(true)}
                className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-amber-600 hover:bg-amber-100 transition-colors"
              >
                <ShoppingBag className="h-4 w-4" />
                Ventas en espera
                {ventasEnEsperaCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-black text-white">
                    {ventasEnEsperaCount}
                  </span>
                )}
              </button>
            </div>

            {/* Cards grid */}
            {reparacionesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-3xl bg-white border border-slate-100 p-5 shadow-sm animate-pulse">
                    <div className="h-3 w-16 bg-slate-200 rounded mb-3" />
                    <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
                    <div className="h-3 w-1/2 bg-slate-200 rounded mb-4" />
                    <div className="flex justify-between mt-4">
                      <div className="h-4 w-12 bg-slate-200 rounded" />
                      <div className="h-4 w-10 bg-slate-200 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredReparaciones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Wrench className="h-12 w-12 text-slate-200" />
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {searchReparacion ? "Sin resultados" : "Sin reparaciones listas"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {searchReparacion ? "Intenta con otro término" : "No hay equipos pendientes de entrega"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredReparaciones.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => router.push(`/dashboard/reparaciones/${r.id}`)}
                    className="group cursor-pointer rounded-3xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all"
                  >
                    <p className="text-[11px] font-black text-blue-600 uppercase tracking-wider mb-2">
                      #{r.folio}
                    </p>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 leading-tight">
                      {r.device}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{r.customer}</p>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-black text-blue-600">{r.price}</span>
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 border border-emerald-100">
                        LISTO
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)}

          {bottomTab === "aprobaciones" && (<div id="panel-aprobaciones" role="tabpanel" tabIndex={0} className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black italic uppercase tracking-tight text-slate-900">
                    Aprobaciones de Caja
                  </h2>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 mt-0.5">
                    Doble firma: verifica movimientos de efectivo solicitados por técnicos.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-slate-200 text-slate-600 hover:bg-slate-50 font-bold uppercase gap-2 rounded-2xl text-xs h-10 px-4 self-start sm:self-auto"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Actualizar Lista
              </Button>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">Abonos pendientes (entrada)</p>
                  <p className="text-xl font-black italic text-emerald-600 mt-1">$0</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-500">
                  <ArrowUpCircle className="h-5 w-5" />
                </div>
              </div>
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-500">Inversiones pendientes (salida)</p>
                  <p className="text-xl font-black italic text-red-500 mt-1">$0</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-500">
                  <ArrowDownCircle className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Solicitudes card */}
            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">Solicitudes por procesar</p>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-black">0</span>
              </div>
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-400">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <p className="text-sm font-black italic uppercase tracking-wide text-slate-800">¡Caja conciliada!</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  No hay solicitudes pendientes de aprobación en este momento.
                </p>
              </div>
            </div>

            {/* Protocolo card */}
            <div className="rounded-3xl border border-blue-100 bg-blue-50/40 p-5 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-600">Protocolo de doble firma</p>
                <p className="text-[11px] font-bold text-slate-600 mt-1.5 leading-relaxed">
                  Como responsable de caja, tú validas la entrada y salida real de dinero. Hasta que no apruebes estas solicitudes, los montos <span className="text-slate-900">no afectarán</span> tu balance de cierre ni el saldo del ticket.
                </p>
              </div>
            </div>
          </div>)}
        </div>

        {/* RIGHT COLUMN — CART (always visible, aligned with tabs) */}
        <div id="cart-panel" className="w-full lg:max-w-[380px]">
          <CartPanel
      cartItems={cartItems}
      clienteKey={clienteKey}
      onClientFound={(payload: ClientAutocompletePayload | null) => {
        if (payload) {
          setClienteNombre(payload.nombre)
          setClienteId(payload.id || null)
          setClienteTelefono(payload.telefono)
        } else {
          setClienteNombre("")
          setClienteId(null)
          setClienteTelefono("")
        }
      }}
      onIncrement={increment}
      onDecrement={decrement}
      onRemove={removeItem}
      onClear={clearCart}
      metodoPago={metodoPago}
      onSelectMetodo={selectMetodo}
      montoEfectivo={montoEfectivo}
      onSetMontoEfectivo={setMontoEfectivo}
      montoTarjeta={montoTarjeta}
      onSetMontoTarjeta={setMontoTarjeta}
      montoTransferencia={montoTransferencia}
      onSetMontoTransferencia={setMontoTransferencia}
      subtotal={subtotal}
      total={total}
      descuentoAplicado={descuentoAplicado}
      onOpenDescuento={() => setShowDescuento(true)}
      cambio={cambio}
      mixtoTotal={mixtoTotal}
      saleError={saleError}
      onSetSaleError={setSaleError}
      onFinalizar={handleFinalizarVenta}
      onEnEspera={handleEnEspera}
      cajaExists={!!caja}
    />
    </div>
  </div>
  )}

      {activeTab === "historial" && (
        <div id="panel-historial" role="tabpanel" tabIndex={0}>
          <HistorialCaja />
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showArqueo && caja && (
        <ArqueoModal
          open={showArqueo}
          onOpenChange={setShowArqueo}
          caja={caja}
        />
      )}

      {showDescuento && (
        <DescuentoModal
          open={showDescuento}
          onOpenChange={setShowDescuento}
          subtotal={subtotal}
          onApply={(descuento) => setDescuentoAplicado(descuento)}
        />
      )}

      {showSpecial && (
        <SpecialModal
          open={showSpecial}
          onOpenChange={setShowSpecial}
          onAdd={(item) => setCartItems((prev) => [...prev, item])}
        />
      )}

      {showConfirm && (
        <ConfirmModal
          open={showConfirm}
          onOpenChange={setShowConfirm}
          total={total}
          metodo={metodoPago}
          cambio={cambio}
          clienteNombre={clienteNombre}
          itemCount={cartItems.reduce((s, i) => s + i.cantidad, 0)}
          loading={saleLoading}
          onConfirm={handleConfirmSale}
        />
      )}

      {ventaCreada && (
        <SuccessModal
          open={!!ventaCreada}
          venta={ventaCreada}
          tallerNombre={tallerSettings.nombre_taller}
          tallerTelefono={tallerSettings.telefono}
          logoUrl={tallerSettings.logo_url}
          terminosGarantia={terminosVenta}
          mensajeDespedida={tallerSettings.mensaje_despedida}
          impresoraTicket={tallerSettings.impresora_ticket}
          direccion={tallerSettings.direccion}
          onClose={() => { setVentaCreada(null); clearCart() }}
        />
      )}

      <VentaEnEsperaConfirm
        open={showVentaEnEsperaConfirm}
        onClose={() => setShowVentaEnEsperaConfirm(false)}
      />

      <VentasEnEsperaModal
        open={showVentasEnEspera}
        onClose={() => setShowVentasEnEspera(false)}
        onRecuperar={handleRecuperarVentaEnEspera}
      />
      </div>

      {/* ── Mobile sticky cart bar — hidden on lg (two-panel layout visible) ── */}
      {activeTab !== "historial" && cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-black" aria-hidden="true">
              {cartItems.reduce((s, i) => s + i.cantidad, 0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 leading-none">Carrito</p>
              <p className="text-base font-black text-slate-900 tabular-nums">${fmt(total)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                document.getElementById("cart-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
              className="h-9 text-xs font-semibold border-slate-200"
              aria-label="Ir al carrito"
            >
              Ver carrito
            </Button>
            <Button
              onClick={handleFinalizarVenta}
              disabled={!caja}
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 disabled:opacity-50"
            >
              Finalizar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VentasPage() {
  return (
    <CajaProvider>
      <VentasPageContent />
    </CajaProvider>
  )
}

