'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { InventoryProductImage } from "@/components/dashboard/inventory-product-image"
import { useSearchParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Box,
  Package,
  AlertTriangle,
  TrendingUp,
  Search,
  ArrowUpDown,
  ChevronUp,
  Download,
  Upload,
  Plus,
  ChevronDown,
  Loader2,
  PackageCheck,
  History,
  Printer,
  Pencil,
  Trash2,
  X,
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"
import {
  getProductos,
  getInventoryOperationalKpis,
  createProducto,
  uploadProductImage,
  bulkImportProductos,
  deleteProducto,
  type ProductoRow,
  type BulkImportProductoInput,
} from "@/lib/actions/productos-prisma"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { InventoryExhibitionLabel } from "@/components/dashboard/inventory-exhibition-label"
import { InventoryStandardLabel } from "@/components/dashboard/inventory-standard-label"
import { isEquipoExhibitionCategory } from "@/components/dashboard/inventory-label-utils"
import { buildInventoryLabelPrintDocument } from "@/lib/inventory/inventory-label-print-html"
import { printCartelExhibicion } from "@/components/dashboard/print-cartel-exhibicion"
import { formatPeso, formatMoney } from "@/lib/utils/currency"
import { cn } from "@/lib/utils"
import { InventoryPublicidadMenu } from "@/components/dashboard/inventory-publicidad-menu"
import { NuevoProductoModal } from "@/components/dashboard/inventario/NuevoProductoModal"
// PERF-12: imageCompression se carga bajo demanda al importar imagenes.
import dynamic from "next/dynamic"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const SEARCH_PARAM = "q"
const CATEGORY_PARAM = "cat"
const STATUS_PARAM = "status"

function InventarioContent() {
  const [productos, setProductos] = useState<ProductoRow[]>([])
  const [loadingProductos, setLoadingProductos] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingProducto, setEditingProducto] = useState<ProductoRow | null>(null)
  const [draftProductId, setDraftProductId] = useState("")
  /** null = orden del servidor (created_at desc, ultimo creado arriba). */
  const [sortBy, setSortBy] = useState<"nombre" | "stock" | "precio" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState("")
  const [importSummary, setImportSummary] = useState<{
    inserted: number
    skipped: number
    totalCostoCarga: number
    errors?: string[]
  } | null>(null)
  const [showErrorLog, setShowErrorLog] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyProducto, setHistoryProducto] = useState<ProductoRow | null>(null)
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [labelProducto, setLabelProducto] = useState<ProductoRow | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [tallerNombre, setTallerNombre] = useState("")
  const [showPriceOnLabel, setShowPriceOnLabel] = useState(true)

  // Form state
  const [nombre, setNombre] = useState("")
  const [sku, setSku] = useState("")
  const [codigoBarras, setCodigoBarras] = useState("")
  const [categoria, setCategoria] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [imagenUrl, setImagenUrl] = useState("")
  const [costo, setCosto] = useState("0")
  const [precioVenta, setPrecioVenta] = useState("0")
  const [stockActual, setStockActual] = useState("1")
  const [stockMinimo, setStockMinimo] = useState("5")
  const [esEquipo, setEsEquipo] = useState(false)
  const [imeiSerie, setImeiSerie] = useState("")
  const [imeiType, setImeiType] = useState<"imei" | "serie">("imei")
  const [imeiError, setImeiError] = useState<string | null>(null)
  const [color, setColor] = useState("")
  const [procesador, setProcesador] = useState("")
  const [ram, setRam] = useState("")
  const [almacenamiento, setAlmacenamiento] = useState("")
  const [marca, setMarca] = useState("")
  const [modelo, setModelo] = useState("")
  const [condicion, setCondicion] = useState("")
  const [ubicacion, setUbicacion] = useState("")
  const [registrarIdentificador, setRegistrarIdentificador] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  /** Mensaje discreto bajo el area de foto (evita toasts destructivos en fallos de subida). */
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  const searchTerm = searchParams.get(SEARCH_PARAM) ?? ""
  const categoryFilter = searchParams.get(CATEGORY_PARAM) ?? ""
  const statusFilter = searchParams.get(STATUS_PARAM) ?? ""
  const hasActiveFilter = !!searchTerm || !!categoryFilter || !!statusFilter
  const [searchInput, setSearchInput] = useState(searchTerm)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync searchInput when URL changes (e.g., back button, clear filters)
  useEffect(() => {
    setSearchInput(searchTerm)
  }, [searchTerm])

  const [pageProductos, setPageProductos] = useState(0)
  const [totalProductos, setTotalProductos] = useState(0)
  const [operationalKpis, setOperationalKpis] = useState({
    valorEnRiesgo: 0,
    rotacionDias: 0,
  })
  const PAGE_SIZE_PRODUCTOS = 50

  const requestIdRef = useRef(0)

  const loadProductos = useCallback(async (p: number) => {
    const reqId = ++requestIdRef.current
    setLoadingProductos(true)
    try {
      const [{ data, total }, kpiRes] = await Promise.all([
        getProductos(p, PAGE_SIZE_PRODUCTOS, searchTerm),
        getInventoryOperationalKpis(),
      ])
      if (reqId !== requestIdRef.current) return
      setProductos(data || [])
      setTotalProductos(total)
      if (!kpiRes.error) {
        setOperationalKpis({
          valorEnRiesgo: kpiRes.valorEnRiesgo,
          rotacionDias: kpiRes.rotacionDiasPromedio,
        })
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoadingProductos(false)
      }
    }
  }, [searchTerm])

  const ensureEquiposCategoria = async () => {
    setCategoria("EQUIPOS")
  }

  useEffect(() => {
    setPageProductos(0)
  }, [searchTerm])

  useEffect(() => {
    loadProductos(pageProductos)
  }, [pageProductos, loadProductos])

  useEffect(() => {
    setIsClient(true)
  }, [])

  const openImportModal = () => {
    setImportModalOpen(true)
    setImporting(false)
    setImportFileName("")
    setImportSummary(null)
    setShowErrorLog(false)
  }

  const closeImportModal = () => {
    if (importing) return
    setImportModalOpen(false)
  }

  const toggleSort = (column: "nombre" | "stock" | "precio") => {
    setSortBy((current) => {
      if (current === column) {
        setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))
        return current
      }
      setSortDir("asc")
      return column
    })
  }

  const updateSearchParams = (params: { q?: string; cat?: string; status?: string }) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (params.q !== undefined) {
      // No hacemos trim aqui: permite escribir espacios (ej: "Cargador tipo c").
      // URLSearchParams se encarga de encodear espacios como %20/+.
      const raw = params.q
      if (raw.trim().length > 0) sp.set(SEARCH_PARAM, raw)
      else sp.delete(SEARCH_PARAM)
    }
    if (params.cat !== undefined) {
      const value = params.cat.trim()
      if (value) sp.set(CATEGORY_PARAM, value)
      else sp.delete(CATEGORY_PARAM)
    }
    if (params.status !== undefined) {
      const value = params.status.trim()
      if (value) sp.set(STATUS_PARAM, value)
      else sp.delete(STATUS_PARAM)
    }
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  const openModal = () => {
    setEditingProducto(null)
    setDraftProductId(crypto.randomUUID())
    setModalOpen(true)
    setUploadingImage(false)
    setNombre("")
    setSku("")
    setCodigoBarras("")
    setCategoria("")
    setDescripcion("")
    setImagenUrl("")
    setCosto("0")
    setPrecioVenta("0")
    setStockActual("1")
    setStockMinimo("5")
    setEsEquipo(false)
    setImeiSerie("")
    setImeiType("imei")
    setImeiError(null)
    setColor("")
    setProcesador("")
    setRam("")
    setAlmacenamiento("")
    setMarca("")
    setModelo("")
    setCondicion("")
    setUbicacion("")
    setRegistrarIdentificador(false)
  }

  const closeModal = () => {
    if (saving) return
    const wasNew = !editingProducto
    const pid = draftProductId
    const nom = nombre.trim()
    void (async () => {
      if (wasNew && pid && (!nom || nom === "Producto (borrador)")) {
        const del = await deleteProducto(pid)
        if (del.success) await loadProductos(pageProductos)
      }
      setModalOpen(false)
      setEditingProducto(null)
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl)
        setLocalPreviewUrl(null)
      }
    })()
  }

  const handleEdit = (producto: ProductoRow) => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl)
      setLocalPreviewUrl(null)
    }
    setEditingProducto(producto)
    setDraftProductId(producto.id)
    setNombre(producto.nombre || "")
    setSku(producto.sku || "")
    setCodigoBarras(producto.codigo_barras || "")
    setCategoria(producto.categoria || "")
    setDescripcion(producto.descripcion || "")
    setImagenUrl(producto.imagen_url || "")
    setCosto(String(producto.costo ?? 0))
    setPrecioVenta(String(producto.precio_venta ?? 0))
    setStockActual(String(producto.stock_actual ?? 0))
    setStockMinimo(String(producto.stock_minimo ?? 0))
    setEsEquipo(Boolean(producto.es_equipo))
    setImeiSerie(producto.imei_serie || "")
    const storedImei = producto.imei_serie || ""
    setImeiType(storedImei && /^\d{15}$/.test(storedImei) ? "imei" : storedImei ? "serie" : "imei")
    setImeiError(null)
    setColor(producto.color || "")
    setProcesador(producto.procesador || "")
    setRam(producto.ram || "")
    setAlmacenamiento((producto.almacenamiento || producto.capacidad || "").trim())
    setMarca(producto.marca || "")
    setModelo(producto.modelo || "")
    setCondicion(producto.condicion || "")
    setUbicacion(producto.ubicacion || "")
    setRegistrarIdentificador(Boolean(producto.imei_serie?.trim()))
    setUploadingImage(false)
    setImageUploadError(null)
    setModalOpen(true)
  }

  /** Campos calculados compartidos entre buildProductPayload y buildProductoSnapshotFromForm. */
  const buildFormCore = () => {
    const identificadorUnico = esEquipo && registrarIdentificador && !!imeiSerie.trim()
    const stockFinal = identificadorUnico ? 1 : parseInt(stockActual, 10) || 0
    const almacStr = esEquipo ? almacenamiento.trim() || null : null
    return {
      identificadorUnico,
      stockFinal,
      almacStr,
      nom: nombre.trim(),
      costoVal: Math.max(0, parseFloat(costo) || 0),
      precioVentaVal: Math.max(0, parseFloat(precioVenta) || 0),
      stockMinVal: identificadorUnico ? 1 : parseInt(stockMinimo, 10) || 5,
      skuVal: sku.trim() || null,
      barrasVal: codigoBarras.trim() || null,
      categoriaVal: categoria.trim() || null,
      descripcionVal: descripcion.trim() || null,
      marcaVal: marca.trim() || null,
      modeloVal: modelo.trim() || null,
      ubicacionVal: ubicacion.trim() || null,
      condicionVal: condicion.trim() || null,
      imeiVal: esEquipo && registrarIdentificador ? imeiSerie.trim() || null : null,
      colorVal: esEquipo ? color.trim() || null : null,
      procesadorVal: esEquipo ? procesador.trim() || null : null,
      ramVal: esEquipo ? ram.trim() || null : null,
    }
  }

  /** Payload para la Server Action. Permite nombre vacio â†’ borrador (para persistir antes de foto). */
  const buildProductPayload = (productId: string, nombreFallback: string) => {
    const c = buildFormCore()
    const orUndef = (v: string | null) => v ?? undefined
    return {
      id: productId,
      nombre: c.nom || nombreFallback,
      sku: orUndef(c.skuVal),
      codigo_barras: orUndef(c.barrasVal),
      imagen_url: imagenUrl.trim() || undefined,
      categoria: orUndef(c.categoriaVal),
      descripcion: orUndef(c.descripcionVal),
      marca: orUndef(c.marcaVal),
      modelo: orUndef(c.modeloVal),
      ubicacion: orUndef(c.ubicacionVal),
      costo: c.costoVal,
      precio_venta: c.precioVentaVal,
      stock_actual: c.stockFinal,
      stock_minimo: c.stockMinVal,
      es_equipo: esEquipo,
      imei_serie: orUndef(c.imeiVal),
      color: orUndef(c.colorVal),
      procesador: orUndef(c.procesadorVal),
      ram: orUndef(c.ramVal),
      almacenamiento: orUndef(c.almacStr),
      condicion: orUndef(c.condicionVal),
    }
  }

  const handleGuardarProducto = async () => {
    const nom = nombre.trim()
    if (!nom) {
      toast({ title: "Campo requerido", description: "Ingresa el nombre del producto.", variant: "destructive" })
      return
    }
    if (esEquipo && registrarIdentificador) {
      const imei = imeiSerie.trim()
      if (!imei) {
        setImeiError("Ingresa el identificador o desactiva Â«Registrar IMEI o numero de serieÂ».")
        return
      }
      if (imeiType === "imei") {
        if (!/^\d+$/.test(imei)) {
          setImeiError("El IMEI solo debe contener digitos numericos (sin espacios ni letras).")
          return
        }
        if (imei.length !== 15) {
          setImeiError(`IMEI incompleto: ${imei.length}/15 digitos. Verifica el numero.`)
          return
        }
      } else {
        if (imei.length < 8) {
          setImeiError(`Serie muy corta: ${imei.length}/8 caracteres minimos.`)
          return
        }
      }
    }
    setSaving(true)
    const formData = buildProductPayload(editingProducto?.id ?? draftProductId, nom)
    try {
      const wasEdit = Boolean(editingProducto)
      const result = await createProducto(formData)
      if (result.success) {
        toast({
          title: wasEdit ? "Producto actualizado" : "Producto guardado",
          description: wasEdit
            ? "Los cambios del producto se guardaron correctamente."
            : "El producto se agrego al inventario.",
        })
        setModalOpen(false)
        setNombre("")
        setSku("")
        setCodigoBarras("")
        setCategoria("")
        setDescripcion("")
        setImagenUrl("")
        setCosto("0")
        setPrecioVenta("0")
        setStockActual("1")
        setStockMinimo("5")
        setEsEquipo(false)
        setImeiSerie("")
        setImeiType("imei")
        setImeiError(null)
        setColor("")
        setProcesador("")
        setRam("")
        setAlmacenamiento("")
        setMarca("")
        setModelo("")
        setCondicion("")
        setUbicacion("")
        setRegistrarIdentificador(false)
        setEditingProducto(null)
        if (wasEdit) {
          await loadProductos(pageProductos)
        } else {
          setPageProductos(0)
          await loadProductos(0)
        }
      } else {
        const errorMsg = result.error ?? "No se pudo guardar."
        toast({
          title: wasEdit ? "Error al actualizar" : "Error al guardar",
          description: errorMsg,
          variant: "destructive",
        })
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      toast({ title: "Error al guardar", description: errorMsg, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDisabledClick = () => {
    // Mostrar notificacion de proximamente
  }

  const generarCodigoBarrasInterno = () => {
    // Prefijo interno 200 + 9 digitos aleatorios = 12 digitos base
    let base = "200"
    for (let i = 0; i < 9; i++) {
      base += Math.floor(Math.random() * 10).toString()
    }

    const digits = base.split("").map((d) => parseInt(d, 10))
    // Algoritmo EAN-13: suma impares + 3 * suma pares (sobre los primeros 12 digitos)
    let sumOdd = 0
    let sumEven = 0
    for (let i = 0; i < 12; i++) {
      if ((i + 1) % 2 === 0) sumEven += digits[i]
      else sumOdd += digits[i]
    }
    const total = sumOdd + sumEven * 3
    const checkDigit = (10 - (total % 10)) % 10
    const fullCode = base + checkDigit.toString()
    setCodigoBarras(fullCode)
  }

  const handleImageFile = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return
    setUploadingImage(true)
    setImageUploadError(null)
    try {
      let productId = editingProducto?.id ?? draftProductId
      if (!productId) {
        productId = crypto.randomUUID()
        setDraftProductId(productId)
      }

      // Producto nuevo: persistir fila en BD primero (ID estable y coherente con inventario).
      if (!editingProducto) {
        const persist = await createProducto(buildProductPayload(productId, "Producto (borrador)"))
        if (!persist.success) {
          const msg = persist.error?.trim() || "No se pudo guardar el producto."
          setImageUploadError("Error al subir. " + msg)
          toast({ title: "No se pudo preparar la foto", description: msg, variant: "destructive" })
          return
        }
      }

      // Importar optimizador de imagen y usarlo
      const { optimizeImageForUpload } = await import("@/lib/image-optimizer")
      const compressedFile = await optimizeImageForUpload(file)

      const prevPreview = localPreviewUrl
      const newPreview = URL.createObjectURL(compressedFile)
      setLocalPreviewUrl(newPreview)
      if (prevPreview) URL.revokeObjectURL(prevPreview)

      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = rej
        r.readAsDataURL(compressedFile)
      })
      const mimeType = compressedFile.type || "image/webp"
      const res = await uploadProductImage(base64, productId, mimeType)
      if (!res.success) {
        const short =
          res.error && res.error.length > 120 ? "Revisa la conexion o el bucket de fotos en Supabase." : res.error
        setImageUploadError("Error al subir. " + (short || "Intenta de nuevo."))
        toast({ title: "No se pudo subir la imagen", description: short || "Intenta de nuevo.", variant: "destructive" })
        return
      }
      setImagenUrl(res.path)
      setImageUploadError(null)
    } catch {
      setImageUploadError("Error al subir. No se pudo procesar la imagen.")
      toast({ title: "No se pudo subir la imagen", description: "Revisa el archivo e intenta de nuevo." })
    } finally {
      setUploadingImage(false)
    }
  }

  const removeImage = () => {
    setImagenUrl("")
    setImageUploadError(null)
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl)
      setLocalPreviewUrl(null)
    }
  }

  const kpis = useMemo(() => {
    const valorizacionTotal = productos.reduce((sum, p) => {
      const costo = Number(p.costo ?? 0)
      const stock = Number(p.stock_actual ?? 0)
      return sum + costo * stock
    }, 0)

    const stockCritico = productos.filter(
      (p) => Number(p.stock_actual ?? 0) > 0 && Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)
    ).length

    const sinExistencia = productos.filter(
      (p) => Number(p.stock_actual ?? 0) <= 0
    ).length

    return { valorizacionTotal, stockCritico, sinExistencia }
  }, [productos])

  const filteredProductos = useMemo(() => {
    return productos.filter((p) => {
      const matchesSearch =
        !searchTerm.trim() ||
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.codigo_barras ?? "").toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCategory =
        !categoryFilter.trim() || (p.categoria ?? "").toUpperCase() === categoryFilter.toUpperCase()

      let matchesStatus = true
      if (statusFilter === "critical") {
        matchesStatus = Number(p.stock_actual ?? 0) > 0 && Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)
      } else if (statusFilter === "agotado") {
        matchesStatus = Number(p.stock_actual ?? 0) <= 0
      }

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [productos, searchTerm, categoryFilter, statusFilter])

  const sortedProductos = useMemo(() => {
    const arr = [...filteredProductos]
    if (!sortBy) return arr

    return arr.sort((a, b) => {
      let aVal: string | number = ""
      let bVal: string | number = ""

      if (sortBy === "nombre") {
        aVal = (a.nombre || "").toLowerCase()
        bVal = (b.nombre || "").toLowerCase()
      } else if (sortBy === "stock") {
        aVal = a.stock_actual ?? 0
        bVal = b.stock_actual ?? 0
      } else if (sortBy === "precio") {
        aVal = a.precio_venta ?? 0
        bVal = b.precio_venta ?? 0
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal)
        return sortDir === "asc" ? cmp : -cmp
      }

      const diff = Number(aVal) - Number(bVal)
      return sortDir === "asc" ? diff : -diff
    })
  }, [filteredProductos, sortBy, sortDir])

  const handleExport = () => {
    if (!sortedProductos.length) {
      toast({
        title: "Sin datos para exportar",
        description: "No hay productos que coincidan con los filtros actuales.",
      })
      return
    }

    toast({
      title: "Generando reporte...",
      description: "Tu archivo CSV se descargara en unos segundos.",
    })

    const headers = [
      "Nombre",
      "SKU",
      "Categoria",
      "Stock Actual",
      "Stock Minimo",
      "Costo",
      "Precio de Venta",
      "Ubicacion",
    ]

    const escapeCsv = (value: unknown) => {
      let v = String(value ?? "")
      if (v.indexOf('"') !== -1) v = v.replace(/"/g, '""')
      if (v.search(/("|,|\n)/) !== -1) v = `"${v}"`
      return v
    }

    const rows = sortedProductos.map((p) => [
      p.nombre ?? "",
      p.sku ?? "",
      p.categoria ?? "",
      p.stock_actual ?? 0,
      p.stock_minimo ?? 0,
      p.costo ?? 0,
      p.precio_venta ?? 0,
      "", // Ubicacion (aun no persistida en BD)
    ])

    const csvContent =
      [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)

    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const filename = `Inventario_TallerCloud_${yyyy}-${mm}-${dd}.csv`

    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImportFinish = () => {
    setImportModalOpen(false)
    setImportSummary(null)
    setImportFileName("")
    setShowErrorLog(false)
  }

  const openHistory = (producto: ProductoRow) => {
    setHistoryProducto(producto)
    setHistoryModalOpen(true)
  }

  const openLabelPreview = async (producto: ProductoRow, showPrice: boolean) => {
    setShowPriceOnLabel(showPrice)
    setLabelProducto(producto)
    setLabelModalOpen(true)
    // PERF-14: getTallerSettings cargado solo al abrir el modal de etiqueta
    if (!tallerNombre) {
      getTallerSettings().then(({ settings }) => {
        if (settings?.nombre_taller) setTallerNombre(settings.nombre_taller)
      })
    }
  }

  const getBarcodeValue = (producto: ProductoRow | null) => {
    if (!producto) return ""
    const raw = (producto.codigo_barras || producto.sku || "").replace(/\D/g, "")
    if (raw.length === 13) return raw
    if (raw.length === 12) return raw
    return ""
  }

  const handlePrintLabel = async () => {
    if (!labelProducto) return

    const precio = formatPeso(Number(labelProducto.precio_venta ?? 0))
    const value = getBarcodeValue(labelProducto)

    let barcodeSvg = ""
    if (!isEquipoExhibitionCategory(labelProducto) && value && /^\d{12,13}$/.test(value)) {
      try {
        const { default: JsBarcode } = await import("jsbarcode")
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        JsBarcode(svg, value, {
          format: "EAN13",
          displayValue: false,
          margin: 0,
          width: 1.2,
          height: 28,
          lineColor: "#000000",
          background: "#ffffff",
        })
        barcodeSvg = svg.outerHTML
      } catch (_) { /* sin codigo valido â€” se omite */ }
    }

    const fullHtml = buildInventoryLabelPrintDocument({
      producto: labelProducto,
      tallerNombre,
      precioFormateado: precio,
      barcodeSvg,
      showPrice: showPriceOnLabel,
    })

    const iframe = document.createElement("iframe")
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      return
    }

    doc.open()
    doc.write(fullHtml)
    doc.close()

    setTimeout(() => {
      iframe.contentWindow?.print()
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe)
      }, 1000)
    }, 300)
  }

  const handleDelete = async (producto: ProductoRow) => {
    const result = await deleteProducto(producto.id)
    if (!result.success) {
      toast({
        title: "Error al eliminar",
        description: result.error ?? "No se pudo eliminar el producto.",
        variant: "destructive",
      })
      return
    }
    toast({ title: "Producto eliminado", description: "Se elimino el producto del inventario." })
    await loadProductos(pageProductos)
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (ext !== "csv") {
      toast({
        title: "Formato no soportado",
        description: "Por ahora solo se acepta CSV. Exporta tu Excel a CSV antes de importar.",
        variant: "destructive",
      })
      return
    }

    setImportFileName(file.name)
    setImporting(true)
    setImportSummary(null)

    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (lines.length < 2) {
        throw new Error("El archivo no contiene filas de datos.")
      }

      const parseCsvLine = (line: string): string[] => {
        const result: string[] = []
        let current = ""
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (ch === "," && !inQuotes) {
            result.push(current)
            current = ""
          } else {
            current += ch
          }
        }
        result.push(current)
        return result
      }

      const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
      const required = ["nombre"]
      const missing = required.filter((col) => !header.includes(col))
      if (missing.length) {
        throw new Error(`Faltan columnas obligatorias en el CSV: ${missing.join(", ")}`)
      }

      const idx = (name: string) => header.indexOf(name)
      const idxNombre = idx("nombre")
      const idxSku = idx("sku")
      const idxCategoria = idx("categoria")
      const idxCodigoBarras = idx("codigo_barras")
      const idxCosto = idx("costo")
      const idxPrecio = idx("precio_venta")
      const idxStock = idx("stock_actual")
      const idxMin = idx("stock_minimo")
      const idxDescripcion = idx("descripcion")

      const rows = lines.slice(1).map((line) => parseCsvLine(line))

      const toVal = (cols: string[], i: number) => (i >= 0 && i < cols.length ? cols[i].trim() : "")

      const payload = rows
        .map((cols) => ({
          nombre: toVal(cols, idxNombre),
          sku: idxSku >= 0 ? toVal(cols, idxSku) : undefined,
          categoria: idxCategoria >= 0 ? toVal(cols, idxCategoria) : undefined,
          codigo_barras: idxCodigoBarras >= 0 ? toVal(cols, idxCodigoBarras) : undefined,
          costo: idxCosto >= 0 ? toVal(cols, idxCosto) : undefined,
          precio_venta: idxPrecio >= 0 ? toVal(cols, idxPrecio) : undefined,
          stock_actual: idxStock >= 0 ? toVal(cols, idxStock) : undefined,
          stock_minimo: idxMin >= 0 ? toVal(cols, idxMin) : undefined,
          // descripcion no se guarda en bulkImportProductos pero se puede mapear mas adelante si se amplia
        }))
        .filter((row) => row.nombre.trim().length > 0)

      if (!payload.length) {
        throw new Error("No se encontraron filas con nombre valido para importar.")
      }

      toast({
        title: "Procesando importacion...",
        description: `Detectadas ${payload.length} filas validas. Guardando en TallerCloud...`,
      })

      const result = await bulkImportProductos(payload as BulkImportProductoInput[])

      if (!result.success) {
        const msg = result.errors?.join(" | ") ?? "Hubo un problema al importar el archivo."
        toast({
          title: "Error al importar",
          description: msg,
          variant: "destructive",
        })
      } else {
        setImportSummary({
          inserted: result.insertedCount,
          skipped: result.skippedCount,
          totalCostoCarga: result.totalCostoCarga ?? 0,
          errors: result.errors,
        })
        toast({
          title: "Importacion completada",
          description: `Productos importados: ${result.insertedCount}. Filas omitidas: ${result.skippedCount}.`,
        })
        await loadProductos(0)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast({
        title: "Error al leer CSV",
        description: message,
        variant: "destructive",
      })
    } finally {
      setImporting(false)
    }
  }

  const formatRotacionDias = (dias: number) => {
    if (!Number.isFinite(dias) || dias < 0) return "â€”"
    if (dias === 0) return "0 dias"
    const rounded = dias >= 100 ? Math.round(dias) : Math.round(dias * 10) / 10
    return `${rounded} dias`
  }

  const handlePrintCartel = async (producto: ProductoRow) => {
    try {
      const { settings } = await getTallerSettings()
      printCartelExhibicion(producto, {
        tallerNombre: (settings?.nombre_taller || "Mi Taller").trim(),
        logoUrl: settings?.logo_url ?? null,
      })
    } catch {
      printCartelExhibicion(producto, {
        tallerNombre: tallerNombre.trim() || "Mi Taller",
        logoUrl: null,
      })
    }
  }

  const buildProductoSnapshotFromForm = (): ProductoRow | null => {
    const c = buildFormCore()
    if (!c.nom) return null
    return {
      id: editingProducto?.id ?? draftProductId,
      taller_id: editingProducto?.taller_id ?? "",
      nombre: c.nom,
      sku: c.skuVal,
      codigo_barras: c.barrasVal,
      imagen_url: imagenUrl.trim() || null,
      categoria: c.categoriaVal,
      descripcion: c.descripcionVal,
      marca: c.marcaVal,
      modelo: c.modeloVal,
      ubicacion: c.ubicacionVal,
      costo: c.costoVal,
      precio_venta: c.precioVentaVal,
      stock_actual: c.stockFinal,
      stock_minimo: c.stockMinVal,
      es_equipo: esEquipo,
      imei_serie: c.imeiVal,
      color: c.colorVal,
      capacidad: c.almacStr,
      almacenamiento: c.almacStr,
      procesador: c.procesadorVal,
      ram: c.ramVal,
      condicion: c.condicionVal,
      created_at: editingProducto?.created_at ?? new Date().toISOString(),
    }
  }

  const buildProductoSnapshotForCartel = (): ProductoRow | null => {
    const snap = buildProductoSnapshotFromForm()
    if (!snap) {
      toast({
        title: "Nombre requerido",
        description: "Escribe el nombre del producto para generar el cartel.",
        variant: "destructive",
      })
      return null
    }
    return snap
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: icon + title */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 shrink-0">
              <Box className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="italic font-extrabold text-xl tracking-tight text-slate-900 sm:text-2xl">
                  INVENTARIO
                </h1>
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-sm font-bold text-slate-600 tabular-nums">
                  {totalProductos.toLocaleString("es-MX")} productos
                </span>
              </div>
              <p className="text-[10px] tracking-widest text-slate-500 font-semibold">
                CONTROL AUTOMATIZADO DE STOCK Y ALMACEN
              </p>
              <p className="mt-1 text-sm tracking-tight text-slate-500">
                Gestiona tu inventario con control de existencias, categorias y precios.
              </p>
            </div>
          </div>

          {/* Right: search + action buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56 lg:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                value={searchInput}
                onChange={(e) => {
                  const value = e.target.value
                  setSearchInput(value)
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                  searchDebounceRef.current = setTimeout(() => {
                    const sp = new URLSearchParams(window.location.search)
                    if (value.trim().length > 0) sp.set(SEARCH_PARAM, value)
                    else sp.delete(SEARCH_PARAM)
                    router.replace(`?${sp.toString()}`, { scroll: false })
                  }, 400)
                }}
                placeholder="Buscar: nombre, SKU..."
                className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-8 text-base placeholder:text-slate-400 transition-colors focus:bg-white md:text-sm"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                    updateSearchParams({ q: "" })
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Limpiar busqueda"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              onClick={handleExport}
              variant="outline"
              className="h-11 shrink-0 gap-2 rounded-xl px-4 font-semibold tracking-tight"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <Button
              onClick={openImportModal}
              variant="outline"
              className="h-11 shrink-0 gap-2 rounded-xl px-4 font-semibold tracking-tight"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importar</span>
            </Button>
            <Button
              onClick={openModal}
              className="h-11 shrink-0 gap-2 rounded-xl px-4 font-semibold tracking-tight"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo Producto</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          </div>
        </div>
      </div>

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* Total */}
          <button
            type="button"
            onClick={() => updateSearchParams({ status: "" })}
            className={cn(
              "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
              !statusFilter
                ? "ring-2 ring-slate-400 border-slate-300 bg-slate-50"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Box className="h-4 w-4 text-slate-600 transition-transform duration-200 group-hover:scale-110" aria-hidden />
            </div>
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight transition-colors", "text-slate-900")}>
              {totalProductos}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">Total</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Todos los productos</p>
            </div>
            {!statusFilter && (
              <span className="self-start rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 ring-1 ring-slate-200">Activo</span>
            )}
          </button>

          {/* Critico */}
          <button
            type="button"
            onClick={() => updateSearchParams({ status: statusFilter === "critical" ? "" : "critical" })}
            className={cn(
              "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
              statusFilter === "critical"
                ? "ring-2 ring-amber-400 border-amber-300 bg-amber-50/60"
                : "border-slate-200 hover:border-amber-300"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600 transition-transform duration-200 group-hover:scale-110" aria-hidden />
            </div>
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight transition-colors", kpis.stockCritico > 0 ? "text-amber-600" : "text-slate-900")}>
              {kpis.stockCritico}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">Critico</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Stock por debajo del minimo</p>
            </div>
            {statusFilter === "critical" && (
              <span className="self-start rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 ring-1 ring-slate-200">Activo</span>
            )}
          </button>

          {/* En Riesgo */}
          <button
            type="button"
            onClick={() => updateSearchParams({ status: statusFilter === "critical" ? "" : "critical" })}
            className={cn(
              "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
              statusFilter === "critical"
                ? "ring-2 ring-rose-400 border-rose-300 bg-rose-50/60"
                : "border-slate-200 hover:border-rose-300"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100">
              <AlertTriangle className="h-4 w-4 text-rose-600 transition-transform duration-200 group-hover:scale-110" aria-hidden />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-rose-700 truncate">
              {formatMoney(operationalKpis.valorEnRiesgo)}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">En Riesgo</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Valor total en riesgo</p>
            </div>
          </button>

          {/* Sin Stock */}
          <button
            type="button"
            onClick={() => updateSearchParams({ status: statusFilter === "agotado" ? "" : "agotado" })}
            className={cn(
              "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
              statusFilter === "agotado"
                ? "ring-2 ring-slate-400 border-slate-300 bg-slate-100"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Package className="h-4 w-4 text-slate-500 transition-transform duration-200 group-hover:scale-110" aria-hidden />
            </div>
            <p className={cn("text-2xl font-bold tabular-nums tracking-tight transition-colors", kpis.sinExistencia > 0 ? "text-slate-700" : "text-slate-900")}>
              {kpis.sinExistencia}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">Sin Stock</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Productos agotados</p>
            </div>
            {statusFilter === "agotado" && (
              <span className="self-start rounded-md bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 ring-1 ring-slate-200">Activo</span>
            )}
          </button>

          {/* Rotacion */}
          <button
            type="button"
            onClick={() => updateSearchParams({ status: "" })}
            className={cn(
              "group flex flex-col gap-2.5 rounded-2xl border bg-white p-4 text-left shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
              "border-slate-200 hover:border-emerald-300"
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-600 transition-transform duration-200 group-hover:scale-110" aria-hidden />
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-emerald-700 truncate">
              {formatRotacionDias(operationalKpis.rotacionDias)}
            </p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-600 leading-none">Rotacion</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">Dias de rotacion promedio</p>
            </div>
          </button>
        </div>

        {/* ── Reset filter hint ──────────────────────────────────────────── */}
        {!loadingProductos && hasActiveFilter && (
          <div className="flex items-center gap-2 -mt-4 text-xs text-slate-400">
            <span>
              {sortedProductos.length} resultado{sortedProductos.length !== 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => { updateSearchParams({ q: "", cat: "", status: "" }) }}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors font-medium"
            >
              <X className="h-3 w-3" /> Limpiar filtros
            </button>
          </div>
        )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto pb-4">
          <Table>
            <TableHeader className="hidden md:table-header-group bg-slate-50">
              <TableRow className="border-b border-slate-200">
                <TableHead
                  className="w-[44%] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
                  aria-sort={sortBy === "nombre" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("nombre")}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Producto / Identificacion</span>
                    {sortBy === "nombre" ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead
                  className="w-[18%] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
                  aria-sort={sortBy === "stock" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("stock")}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Disponibilidad</span>
                    {sortBy === "stock" ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                <TableHead
                  className="w-[24%] px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
                  aria-sort={sortBy === "precio" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort("precio")}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Precio / Costo</span>
                    {sortBy === "precio" ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TableHead>
                    <TableHead className="w-[14%] px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      Acciones
                    </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-200/70 bg-slate-50">
              {loadingProductos ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-500">
                    <span role="status" aria-live="polite">Cargando...</span>
                  </TableCell>
                </TableRow>
              ) : sortedProductos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-8 py-10">
                      <Package className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">
                        No hay productos que coincidan.
                      </p>
                      <p className="text-xs text-slate-500">
                        Ajusta los filtros o crea un nuevo producto con el boton Â«NuevoÂ».
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedProductos.map((p) => {
                  const esAgotado = p.stock_actual <= 0
                  const esCritico = !esAgotado && p.stock_actual <= p.stock_minimo
                  const esVendido = p.es_equipo && !!p.imei_serie && p.stock_actual <= 0
                  const puntoBase = "h-3 w-3 rounded-full"
                  const pulso = esCritico || esAgotado ? " animate-pulse" : ""
                  const puntoColor = esAgotado
                    ? " bg-red-500 shadow-[0_0_0_3px_rgba(248,113,113,0.5)]"
                    : esCritico
                    ? " bg-amber-500 shadow-[0_0_0_3px_rgba(251,191,36,0.45)]"
                    : " bg-emerald-500/70"
                  const cantidadClass = esAgotado
                    ? "text-red-500 font-semibold animate-pulse"
                    : esCritico
                    ? "text-amber-600 font-semibold animate-pulse"
                    : "text-slate-800 font-semibold"
                  const minimoClass = esAgotado ? "text-[11px] text-red-500" : "text-[11px] text-amber-600"

                  const margen =
                    p.precio_venta > 0
                      ? Math.round(((p.precio_venta - p.costo) / p.precio_venta) * 100)
                      : 0
                  const margenClass = margen < 20
                    ? "text-red-500"
                    : margen < 40
                    ? "text-amber-500"
                    : "text-sky-600"

                  return (
                    <TableRow key={p.id} className="border-0">
                      <TableCell colSpan={4} className="px-0 py-2">
                        <div className="flex min-h-[100px] flex-col md:min-h-[108px] md:flex-row items-stretch justify-between gap-4 rounded-[28px] border border-slate-200/80 bg-white px-4 py-5 md:px-6 md:py-5 shadow-sm ring-1 ring-slate-100 transition duration-200 hover:shadow-md hover:border-slate-300">
                          {/* Identificacion */}
                          <div className="flex items-start gap-3 md:basis-[44%] md:min-w-0">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                              <InventoryProductImage
                                stored={p.imagen_url}
                                productId={p.id}
                                tallerId={p.taller_id}
                                alt={p.nombre}
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-xl"
                                imgClassName="rounded-xl"
                              />
                            </div>
                            <div className="space-y-1 min-w-0">
                              <p className="text-sm font-semibold tracking-tight text-slate-900 truncate">
                                {p.nombre}
                              </p>
                              {p.sku && (
                                <p className="text-sm text-slate-500 truncate">
                                  SKU: {p.sku}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {p.categoria && (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                                    {p.categoria}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Disponibilidad */}
                          <div className="md:basis-[18%] flex items-center justify-start md:justify-center text-center">
                            <div className="flex flex-col items-center gap-1">
                              {esVendido ? (
                                <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                                  VENDIDO
                                </span>
                              ) : (
                              <>
                              <div className="flex items-center gap-2">
                                <div className={puntoBase + puntoColor + pulso} />
                                <span className={cantidadClass}>{p.stock_actual}</span>
                              </div>
                              <span className="text-[11px] font-semibold tracking-[0.25em] text-slate-400">
                                UNIDADES
                              </span>
                              </>
                              )}
                              {(esCritico || esAgotado) && !esVendido && (
                                <span className={minimoClass}>min. {p.stock_minimo}</span>
                              )}
                            </div>
                          </div>

                          {/* Costeo */}
                          <div className="md:basis-[30%] lg:basis-[26%] lg:min-w-[320px] flex items-center gap-3 border-t border-slate-100 pt-3 md:border-t-0 md:pt-0">
                            <div className="h-12 w-2 rounded-full bg-emerald-500" />
                            <div className="space-y-1">
                              <p className="text-sm md:text-base font-bold text-slate-900">
                                {formatPeso(p.precio_venta)}
                              </p>
                              <p className="text-sm text-slate-500">
                                Costo {formatPeso(p.costo)}
                              </p>
                            </div>
                            <div className="ml-auto hidden md:block text-right">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                                Margen
                              </p>
                              <p className={`text-sm font-bold ${margenClass}`}>
                                {margen}%
                              </p>
                            </div>
                            <div className="ml-auto md:hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                              <p className={`text-xs font-semibold ${margenClass}`}>Margen {margen}%</p>
                            </div>
                          </div>

                          {/* Acciones */}
                          <div className="md:basis-[14%] flex items-center justify-start md:justify-end">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-1 self-center">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 hover:text-slate-900"
                                onClick={() => openHistory(p)}
                                aria-label="Historial de movimientos"
                              >
                                <History className="h-4 w-4" aria-hidden />
                              </Button>

                              <InventoryPublicidadMenu
                                producto={p}
                                tallerNombre={tallerNombre}
                                onEtiquetaVenta={(showPrice) => openLabelPreview(p, showPrice)}
                                onCartelPrecio={() => void handlePrintCartel(p)}
                                triggerVariant="printer"
                              />

                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 hover:text-slate-900"
                                onClick={() => handleEdit(p)}
                                aria-label="Editar producto"
                              >
                                <Pencil className="h-4 w-4" aria-hidden />
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-10 w-10 rounded-full text-slate-400 hover:bg-red-100 active:bg-red-200 hover:text-red-600"
                                    aria-label="Eliminar producto"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta accion no se puede deshacer. Se eliminara{" "}
                                      <span className="font-semibold">{p.nombre}</span> del inventario.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-600 text-white"
                                      onClick={() => void handleDelete(p)}
                                    >
                                      Eliminar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {/* ── Pagination ────────────────────────────────────────────────── */}
          {totalProductos > PAGE_SIZE_PRODUCTOS && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              <span>
                Mostrando {pageProductos * PAGE_SIZE_PRODUCTOS + 1}â€“{Math.min((pageProductos + 1) * PAGE_SIZE_PRODUCTOS, totalProductos)} de {totalProductos}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-2xl border-slate-200" disabled={pageProductos === 0} onClick={() => setPageProductos((p) => p - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl border-slate-200"
                  disabled={(pageProductos + 1) * PAGE_SIZE_PRODUCTOS >= totalProductos}
                  onClick={() => setPageProductos((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <NuevoProductoModal
        open={modalOpen}
        onClose={closeModal}
        editingProducto={editingProducto}
        draftProductId={draftProductId}
        saving={saving}
        onSubmit={handleGuardarProducto}
        footerSlot={(() => {
          const snapForm = buildProductoSnapshotFromForm()
          return snapForm ? (
            <InventoryPublicidadMenu
              producto={snapForm}
              tallerNombre={tallerNombre}
              onEtiquetaVenta={(showPrice) => {
                const s = buildProductoSnapshotFromForm()
                if (s) void openLabelPreview(s, showPrice)
              }}
              onCartelPrecio={() => {
                const snap = buildProductoSnapshotForCartel()
                if (snap) void handlePrintCartel(snap)
              }}
              disabled={saving}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Publicidad: agrega el nombre del producto</span>
          )
        })()}
        nombre={nombre}
        setNombre={setNombre}
        sku={sku}
        setSku={setSku}
        codigoBarras={codigoBarras}
        setCodigoBarras={setCodigoBarras}
        categoria={categoria}
        setCategoria={setCategoria}
        descripcion={descripcion}
        setDescripcion={setDescripcion}
        marca={marca}
        setMarca={setMarca}
        modelo={modelo}
        setModelo={setModelo}
        ubicacion={ubicacion}
        setUbicacion={setUbicacion}
        condicion={condicion}
        setCondicion={setCondicion}
        costo={costo}
        setCosto={setCosto}
        precioVenta={precioVenta}
        setPrecioVenta={setPrecioVenta}
        stockActual={stockActual}
        setStockActual={setStockActual}
        stockMinimo={stockMinimo}
        setStockMinimo={setStockMinimo}
        esEquipo={esEquipo}
        setEsEquipo={setEsEquipo}
        registrarIdentificador={registrarIdentificador}
        setRegistrarIdentificador={setRegistrarIdentificador}
        imeiSerie={imeiSerie}
        setImeiSerie={setImeiSerie}
        imeiType={imeiType}
        setImeiType={setImeiType}
        imeiError={imeiError}
        setImeiError={setImeiError}
        color={color}
        setColor={setColor}
        procesador={procesador}
        setProcesador={setProcesador}
        ram={ram}
        setRam={setRam}
        almacenamiento={almacenamiento}
        setAlmacenamiento={setAlmacenamiento}
        imagenUrl={imagenUrl}
        localPreviewUrl={localPreviewUrl}
        uploadingImage={uploadingImage}
        generarCodigoBarrasInterno={generarCodigoBarrasInterno}
        ensureEquiposCategoria={ensureEquiposCategoria}
        handleImageFile={handleImageFile}
        removeImage={removeImage}
        imageUploadError={imageUploadError}
        onClearImageUploadError={() => setImageUploadError(null)}
        tallerNombre={tallerNombre}
      />

      {/* Modal Importar / Migrar Inventario */}
      <Dialog open={importModalOpen} onOpenChange={(open) => (open ? openImportModal() : closeImportModal())}>
        <DialogContent className="max-w-full w-full md:max-w-2xl bg-white text-slate-900 border border-slate-200 shadow-2xl">
          <DialogHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-wide">
                    <Upload className="h-4 w-4 text-primary" />
                    Importar / Migrar Inventario
                  </DialogTitle>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                  <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                          aria-label="Ayuda para importacion"
                        >
                          ?
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-white text-slate-800 border-slate-200 text-[11px] leading-relaxed">
                        <p>Asegurate de que los precios no tengan letras.</p>
                        <p>El SKU debe ser unico por producto.</p>
                        <p>Si el producto es un equipo, incluye el IMEI en la descripcion o columna correspondiente.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <DialogDescription className="text-xs text-slate-500">
                  Sube un archivo CSV con tus productos desde Excel, Google Sheets u otros sistemas. TallerCloud validara nombres y precios antes de guardar.
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide hover:bg-slate-50"
                onClick={handleExport}
              >
                DESCARGAR PLANTILLA
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Zona de carga o resumen de resultados */}
            {!importSummary && (
              <div
                className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 flex flex-col items-center justify-center gap-3 text-center"
                onDragOver={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.add("border-primary", "bg-blue-50")
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove("border-primary", "bg-blue-50")
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.currentTarget.classList.remove("border-primary", "bg-blue-50")
                  const file = e.dataTransfer.files?.[0]
                  if (file) void handleImportFile(file)
                }}
              >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-wide">
                    Arrastra tu archivo CSV aqui
                  </p>
                  <p className="text-[11px] text-slate-500">
                    o haz clic para seleccionar desde tu computadora
                  </p>
                </div>
                <div className="mt-1 flex flex-col items-center gap-1">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    id="inventario-import-file"
                    disabled={importing}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      if (file) void handleImportFile(file)
                      e.target.value = ""
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide hover:bg-slate-50"
                    onClick={() => document.getElementById("inventario-import-file")?.click()}
                    disabled={importing}
                  >
                    Seleccionar archivo CSV
                  </Button>
                  {importFileName && (
                    <p className="mt-1 text-[11px] text-slate-600 truncate max-w-xs">
                      Archivo seleccionado: <span className="font-semibold">{importFileName}</span>
                    </p>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-slate-500 max-w-sm">
                  Formatos soportados: <span className="font-mono">.csv</span>. Si trabajas con Excel,
                  exporta tu hoja como CSV antes de importar.
                </p>
              </div>
            )}

            {importSummary && !importing && (
              <div className="rounded-xl border border-emerald-200 bg-white px-5 py-6 text-[11px] text-slate-800 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                    <PackageCheck className="h-7 w-7 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold tracking-wide text-emerald-700">
                      Importacion completada
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Los datos del archivo se guardaron en tu inventario. Revisa los totales y, si hubo errores,
                      consulta el log de detalle.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-700">
                      Registros exitosos
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-800">
                      {importSummary.inserted}
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      productos anadidos correctamente
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-amber-700">
                      Registros omitidos
                    </p>
                    <p className="mt-1 text-lg font-bold text-amber-800">
                      {importSummary.skipped}
                    </p>
                    <p className="text-[10px] text-amber-700">
                      filas con errores de validacion
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-600">
                      Valor total de carga
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatPeso(importSummary.totalCostoCarga || 0)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      suma de costo x stock importado
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-primary hover:bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-wide"
                      onClick={handleImportFinish}
                    >
                      Finalizar
                    </Button>
                    {importSummary.skipped > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide hover:bg-slate-50"
                        onClick={() => setShowErrorLog((prev) => !prev)}
                      >
                        {showErrorLog ? "Ocultar log de errores" : "Ver log de errores"}
                      </Button>
                    )}
                  </div>
                  {importFileName && (
                    <p className="text-[10px] text-slate-500 truncate max-w-xs">
                      Archivo procesado: <span className="font-semibold">{importFileName}</span>
                    </p>
                  )}
                </div>

                {showErrorLog && importSummary.errors && importSummary.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-700 space-y-1">
                    {importSummary.errors.map((err, idx) => (
                      <p key={idx}>â€¢ {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {importing && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Procesando archivo y validando productos...</span>
                </div>
              </div>
            )}

            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-50">
                <PackageCheck className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">
                  SUGERENCIA IA
                </p>
                <p className="text-[11px] text-slate-600">
                  TallerCloud intenta reconocer automaticamente las columnas de tu archivo (nombre,
                  precios, stock, etc.), pero te recomendamos revisar la estructura y los encabezados
                  antes de procesar grandes volumenes de datos.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Historial de Movimientos */}
      <Dialog
        open={historyModalOpen}
        onOpenChange={(open) => {
          setHistoryModalOpen(open)
          if (!open) setHistoryProducto(null)
        }}
      >
        <DialogContent className="max-w-full w-full md:max-w-xl bg-white border border-border shadow-xl">
          <DialogHeader className="border-b border-border/80 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4 text-primary" />
              Historial de Movimientos
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {historyProducto ? (
                <>
                  Producto: <span className="font-semibold text-foreground">{historyProducto.nombre}</span>
                </>
              ) : (
                "Consulta movimientos de stock y ajustes."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg border border-border bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-foreground">Proximamente</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Aqui veras entradas de compras, ventas, ajustes y transferencias relacionadas con este producto.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t border-border/80">
            <Button variant="outline" onClick={() => setHistoryModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Vista Previa de Etiqueta (50mm x 25mm) */}
      <Dialog
        open={labelModalOpen}
        onOpenChange={(open) => {
          setLabelModalOpen(open)
          if (!open) setLabelProducto(null)
        }}
      >
        <DialogContent className="max-w-full w-full md:max-w-3xl bg-white border border-border shadow-xl overflow-hidden">
          <DialogTitle className="sr-only">Vista Previa de Etiqueta</DialogTitle>
          <DialogDescription className="sr-only">Vista previa e impresion de etiqueta del producto</DialogDescription>
          <div className="relative">
            {/* Capa superior (control) */}
            <div className="relative bg-white px-4 pt-4 pb-3">
              <div className="absolute right-4 top-4 text-right">
                <p className="text-xs font-black italic tracking-wide text-slate-900">VISTA PREVIA</p>
                <p className="text-[10px] font-semibold tracking-widest text-primary">50MM X 25MM</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                  {showPriceOnLabel ? "Con precio" : "Sin precio"}
                </p>
                {labelProducto && isEquipoExhibitionCategory(labelProducto) && (
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                    Etiqueta de exhibicion (EQUIPO)
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center">
                <Button
                  type="button"
                  onClick={handlePrintLabel}
                  className="bg-primary hover:bg-primary text-primary-foreground font-bold uppercase tracking-wider gap-2 rounded-full px-6 h-11"
                  disabled={!labelProducto}
                >
                  <Printer className="h-4 w-4" />
                  IMPRIMIR ETIQUETA
                </Button>
              </div>
            </div>

            {/* Capa inferior (la etiqueta) */}
              <div className="bg-slate-50/60 px-4 pb-6 pt-3">
              <div className="mx-auto w-full max-w-[720px]">
                <div className="relative mx-auto w-full max-w-[560px]">
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-4">
                    {labelProducto && isEquipoExhibitionCategory(labelProducto) ? (
                      <InventoryExhibitionLabel
                        tallerNombre={tallerNombre || "Mi Taller"}
                        producto={labelProducto}
                        precioFormateado={formatPeso(Number(labelProducto.precio_venta ?? 0))}
                        showPrice={showPriceOnLabel}
                      />
                    ) : labelProducto && isClient ? (
                      <InventoryStandardLabel
                        nombreUpper={(labelProducto.nombre || "â€”").toUpperCase()}
                        skuOrCodigo={(labelProducto.sku || labelProducto.codigo_barras || "â€”").toString()}
                        precioFormateado={formatPeso(Number(labelProducto.precio_venta ?? 0))}
                        barcodeValue={getBarcodeValue(labelProducto)}
                        showBarcodePlaceholder={!getBarcodeValue(labelProducto)}
                        showPrice={showPriceOnLabel}
                      />
                    ) : (
                      <div className="mx-auto flex h-[25mm] w-[50mm] items-center justify-center border border-dashed border-slate-300 text-xs text-slate-500">
                        Cargando vista previaâ€¦
                      </div>
                    )}
                  </div>

                  {/* Nota de configuracion (esquina inferior derecha) */}
                  <p className="absolute -bottom-4 right-0 text-[10px] text-slate-500 max-w-[320px] text-right">
                    Asegurate de que tu impresora este configurada en tamano de papel 50x25 mm (2x1 pulg.)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

export default function InventarioPage() {
  return (
    <Suspense fallback={<div>Cargando inventario...</div>}>
      <InventarioContent />
    </Suspense>
  )
}

