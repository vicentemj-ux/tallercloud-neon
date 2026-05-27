"use client"

import { useMemo, type ReactNode } from "react"
import { InventoryProductImagePreview } from "@/components/dashboard/inventory-product-image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { INVENTARIO_CATEGORIAS } from "@/lib/constants"
import { getInventoryFieldLabels } from "@/lib/inventory/inventory-form-labels"
import type { ProductoRow } from "@/lib/actions/productos-prisma"
import {
  Box,
  Smartphone,
  Tag,
  Cpu,
  Wrench,
  LayoutPanelTop,
  Battery,
  MoreHorizontal,
  Loader2,
  Fingerprint,
  DollarSign,
  ImageIcon,
  Wand2,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  MapPin,
  TriangleAlert,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export type NuevoProductoModalProps = {
  open: boolean
  onClose: () => void
  editingProducto: ProductoRow | null
  draftProductId: string
  saving: boolean
  onSubmit: () => void
  tallerNombre: string
  /** @deprecated No se renderiza en el modal. Mantenido para compatibilidad con page.tsx. */
  footerSlot?: ReactNode
  /** @deprecated La categorÃ­a EQUIPOS activa los flags automÃ¡ticamente. Mantenido para compatibilidad. */
  ensureEquiposCategoria?: () => Promise<void>
  nombre: string
  setNombre: (v: string) => void
  sku: string
  setSku: (v: string) => void
  codigoBarras: string
  setCodigoBarras: (v: string) => void
  categoria: string
  setCategoria: (v: string) => void
  descripcion: string
  setDescripcion: (v: string) => void
  marca: string
  setMarca: (v: string) => void
  modelo: string
  setModelo: (v: string) => void
  ubicacion: string
  setUbicacion: (v: string) => void
  condicion: string
  setCondicion: (v: string) => void
  costo: string
  setCosto: (v: string) => void
  precioVenta: string
  setPrecioVenta: (v: string) => void
  stockActual: string
  setStockActual: (v: string) => void
  stockMinimo: string
  setStockMinimo: (v: string) => void
  esEquipo: boolean
  setEsEquipo: (v: boolean) => void
  registrarIdentificador: boolean
  setRegistrarIdentificador: (v: boolean) => void
  imeiSerie: string
  setImeiSerie: (v: string) => void
  imeiType: "imei" | "serie"
  setImeiType: (v: "imei" | "serie") => void
  imeiError: string | null
  setImeiError: (v: string | null) => void
  color: string
  setColor: (v: string) => void
  procesador: string
  setProcesador: (v: string) => void
  ram: string
  setRam: (v: string) => void
  almacenamiento: string
  setAlmacenamiento: (v: string) => void
  imagenUrl: string
  uploadingImage: boolean
  generarCodigoBarrasInterno: () => void
  handleImageFile: (file: File) => void
  removeImage: () => void
  imageUploadError?: string | null
  onClearImageUploadError?: () => void
}

export function NuevoProductoModal(props: NuevoProductoModalProps) {
  const {
    open,
    onClose,
    editingProducto,
    draftProductId,
    saving,
    onSubmit,
    ensureEquiposCategoria,
    nombre,
    setNombre,
    sku,
    setSku,
    codigoBarras,
    setCodigoBarras,
    categoria,
    setCategoria,
    descripcion,
    setDescripcion,
    marca,
    setMarca,
    modelo,
    setModelo,
    ubicacion,
    setUbicacion,
    condicion,
    setCondicion,
    costo,
    setCosto,
    precioVenta,
    setPrecioVenta,
    stockActual,
    setStockActual,
    stockMinimo,
    setStockMinimo,
    esEquipo,
    setEsEquipo,
    registrarIdentificador,
    setRegistrarIdentificador,
    imeiSerie,
    setImeiSerie,
    imeiType,
    setImeiType,
    imeiError,
    setImeiError,
    color,
    setColor,
    procesador,
    setProcesador,
    ram,
    setRam,
    almacenamiento,
    setAlmacenamiento,
    imagenUrl,
    uploadingImage,
    generarCodigoBarrasInterno,
    handleImageFile,
    removeImage,
    imageUploadError,
    onClearImageUploadError,
  } = props

  const labels = useMemo(() => getInventoryFieldLabels(categoria), [categoria])

  const esCategoriEquipos = categoria === "EQUIPOS"
  const stockBloqueadoPorImei = esEquipo && registrarIdentificador && !!imeiSerie.trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent overlayClassName="backdrop-blur-md bg-black/25" className="max-w-full w-full md:max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-white border-0 shadow-2xl shadow-black/10 overflow-y-auto overflow-x-hidden p-0 gap-0">

        {/* â”€â”€ Header â”€â”€ */}
        <div className="px-8 pt-8 pb-4 shrink-0">
          <DialogHeader className="space-y-1 text-left items-start">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Box className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <DialogTitle className="text-xl font-black italic uppercase tracking-tight text-slate-900">
                  {editingProducto ? "Editar producto" : "Nuevo producto"}
                </DialogTitle>
                <DialogDescription className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {editingProducto
                    ? "Actualiza la informaciÃ³n de este producto en tu inventario."
                    : "Alta precisa: datos estructurados y bÃºsqueda unificada."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* â”€â”€ Body â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)] gap-0 lg:gap-6 px-8 py-2 min-w-0">

          {/* â”€â”€ Columna izquierda â”€â”€ */}
          <div className="flex flex-col gap-4 min-w-0 order-1">

            {/* IdentificaciÃ³n */}
            <section className="rounded-2xl border border-slate-100 bg-slate-50/40 p-5 space-y-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Fingerprint className="h-4 w-4 shrink-0 text-blue-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">IdentificaciÃ³n</h3>
              </div>
              <div className="space-y-4">

                {/* Nombre */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Nombre del producto</Label>
                  <Input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre comercial o descriptivo"
                    className="bg-white border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>

                {/* SKU + CÃ³digo de barras */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">SKU</Label>
                    <Input
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Opcional"
                      className="bg-white border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300 placeholder:font-medium"
                    />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">CÃ³digo de barras</Label>
                    <div className="relative">
                      <Input
                        value={codigoBarras}
                        onChange={(e) => setCodigoBarras(e.target.value)}
                        placeholder="Opcional"
                        className="bg-white border-slate-200 rounded-xl min-h-[48px] pr-10 placeholder:text-slate-300 placeholder:font-medium"
                      />
                      <button
                        type="button"
                        onClick={generarCodigoBarrasInterno}
                        className="absolute inset-y-0 right-2 my-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-500 hover:bg-blue-600 hover:text-white transition-colors"
                        title="Generar cÃ³digo interno EAN-13"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* CategorÃ­a + CondiciÃ³n en la misma fila */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">CategorÃ­a</Label>
                    <Select
                      value={categoria}
                      onValueChange={(val) => {
                        setCategoria(val)
                        setEsEquipo(val === "EQUIPOS")
                        setRegistrarIdentificador(val === "EQUIPOS")
                        if (val !== "EQUIPOS") {
                          setImeiSerie("")
                          setImeiError(null)
                        }
                        if (val === "EQUIPOS") ensureEquiposCategoria?.()
                      }}
                    >
                      <SelectTrigger className="bg-white border-slate-200 rounded-xl min-h-[48px] justify-between">
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVENTARIO_CATEGORIAS.map((cat) => {
                          let Icon = Tag
                          if (cat.value === "EQUIPOS") Icon = Smartphone
                          else if (cat.value === "REFACCIONES") Icon = Cpu
                          else if (cat.value === "ACCESORIOS") Icon = Tag
                          else if (cat.value === "HERRAMIENTAS") Icon = Wrench
                          else if (cat.value === "PANTALLAS") Icon = LayoutPanelTop
                          else if (cat.value === "BATERIAS") Icon = Battery
                          else if (cat.value === "OTROS") Icon = MoreHorizontal
                          return (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                <Icon className={`h-4 w-4 ${cat.value === "EQUIPOS" ? "text-blue-600" : "text-blue-400"}`} />
                                <span className={cat.value === "EQUIPOS" ? "font-bold text-blue-700" : ""}>{cat.label}</span>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">CondiciÃ³n</Label>
                    <Select
                      value={condicion || "__none__"}
                      onValueChange={(v) => setCondicion(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="bg-white border-slate-200 rounded-xl min-h-[48px]">
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin especificar</SelectItem>
                        <SelectItem value="Nuevo">Nuevo</SelectItem>
                        <SelectItem value="Reacondicionado">Reacondicionado</SelectItem>
                        <SelectItem value="Seminuevo">Seminuevo</SelectItem>
                        <SelectItem value="Usado">Usado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* DescripciÃ³n */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">DescripciÃ³n</Label>
                  <Textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Notas, compatibilidades, detalles de vitrinaâ€¦"
                    className="bg-white border-slate-200 rounded-xl min-h-[80px] resize-y placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              </div>
            </section>

            {/* ClasificaciÃ³n: Marca + Modelo */}
            <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">ClasificaciÃ³n</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.marca}</Label>
                  <Input
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    placeholder="â€”"
                    className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.modelo}</Label>
                  <Input
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="â€”"
                    className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300"
                  />
                </div>
              </div>
            </section>

            {/* Hardware + Identificador â€” visible solo cuando EQUIPOS */}
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${esCategoriEquipos ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden min-h-0">
                <div className="space-y-4 pt-1 pb-2">

                  {/* Hardware */}
                  <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-4">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">Hardware</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.procesador}</Label>
                        <Input value={procesador} onChange={(e) => setProcesador(e.target.value)} placeholder="â€”" className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.ram}</Label>
                        <Input value={ram} onChange={(e) => setRam(e.target.value)} placeholder="â€”" className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.almacenamiento}</Label>
                        <Input value={almacenamiento} onChange={(e) => setAlmacenamiento(e.target.value)} placeholder="Ej: 128 GB" className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.color}</Label>
                        <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Opcional" className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300" />
                      </div>
                    </div>
                  </section>

                  {/* Identificador IMEI/Serie â€” siempre visible dentro de EQUIPOS */}
                  <section className="rounded-2xl border border-blue-100 bg-blue-50/30 p-5 space-y-3">
                    <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">Identificador</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                          IMEI o nÃºmero de serie <span className="text-red-500">*</span>
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="text-slate-400 hover:text-slate-600">
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[220px] text-xs">
                              <p><strong>IMEI:</strong> 15 dÃ­gitos. Ajustes â†’ InformaciÃ³n o *#06#.</p>
                              <p className="mt-1"><strong>Serie:</strong> alfanumÃ©rico del fabricante (mÃ­n. 8 caracteres).</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex gap-1 rounded-xl bg-slate-100/80 border border-slate-200/60 p-1" role="group" aria-label="Tipo de identificador">
                        <button
                          type="button"
                          onClick={() => { setImeiType("imei"); setImeiError(null) }}
                          aria-pressed={imeiType === "imei"}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${imeiType === "imei" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          IMEI
                        </button>
                        <button
                          type="button"
                          onClick={() => { setImeiType("serie"); setImeiError(null) }}
                          aria-pressed={imeiType === "serie"}
                          className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${imeiType === "serie" ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          NÃºmero de serie
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          value={imeiSerie}
                          onChange={(e) => { setImeiSerie(e.target.value); setImeiError(null) }}
                          placeholder={imeiType === "imei" ? "15 dÃ­gitos numÃ©ricos" : "MÃ­n. 8 caracteres alfanumÃ©ricos"}
                          maxLength={imeiType === "imei" ? 15 : 30}
                          className={`bg-white rounded-xl min-h-[48px] font-mono pr-16 ${imeiError ? "border-red-300 focus-visible:ring-red-200" : "border-slate-200"}`}
                        />
                        <span
                          className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums ${
                            imeiType === "imei" && imeiSerie.length === 15
                              ? "text-emerald-600"
                              : imeiError
                                ? "text-red-400"
                                : "text-slate-400"
                          }`}
                        >
                          {imeiSerie.length}/{imeiType === "imei" ? "15" : "30"}
                        </span>
                      </div>
                      {imeiError ? (
                        <p className="flex items-center gap-1 text-xs text-red-500">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {imeiError}
                        </p>
                      ) : imeiSerie.length > 0 && imeiType === "imei" && /^\d{15}$/.test(imeiSerie) ? (
                        <p className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          IMEI vÃ¡lido
                        </p>
                      ) : imeiSerie.length > 0 && imeiType === "serie" && imeiSerie.trim().length >= 8 ? (
                        <p className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          NÃºmero de serie vÃ¡lido
                        </p>
                      ) : null}
                    </div>
                    {stockBloqueadoPorImei && (
                      <div className="flex items-center gap-2 rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                        <Fingerprint className="h-3.5 w-3.5 shrink-0" />
                        Stock fijado en 1 â€” identificador Ãºnico por unidad.
                      </div>
                    )}
                  </section>

                </div>
              </div>
            </div>
          </div>

          {/* â”€â”€ Columna derecha â”€â”€ */}
          <div className="flex flex-col gap-4 min-w-0 order-2">

            {/* Foto */}
            <section className="rounded-2xl border border-slate-100 bg-slate-50/30 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">Foto</h3>
              </div>
              {imagenUrl ? (
                <div className="flex flex-col gap-2">
                  <InventoryProductImagePreview
                    stored={imagenUrl}
                    productId={(editingProducto?.id ?? draftProductId) || undefined}
                    tallerId={editingProducto?.taller_id || undefined}
                    alt="Vista previa del producto"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={removeImage} className="w-fit text-xs rounded-lg">
                    Quitar imagen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-6 min-h-[140px] cursor-pointer transition-colors hover:border-blue-300/80 hover:bg-blue-50/30 focus-within:ring-2 focus-within:ring-blue-100/60"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-300", "bg-blue-50/30") }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-blue-300", "bg-blue-50/30") }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.currentTarget.classList.remove("border-blue-300", "bg-blue-50/30")
                      const f = e.dataTransfer.files?.[0]
                      if (f?.type.startsWith("image/")) handleImageFile(f)
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        onClearImageUploadError?.()
                        const f = e.target.files?.[0]
                        if (f) handleImageFile(f)
                        e.target.value = ""
                      }}
                    />
                    {uploadingImage ? (
                      <>
                        <Loader2 className="h-9 w-9 text-blue-500 animate-spin" aria-hidden />
                        <span className="text-xs text-slate-400 font-medium">Subiendoâ€¦</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="h-9 w-9 text-slate-300" strokeWidth={1.25} aria-hidden />
                        <span className="text-xs text-slate-500 font-medium">AÃ±adir foto</span>
                      </>
                    )}
                  </label>
                  {imageUploadError ? (
                    <p
                      role="status"
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs leading-snug text-slate-600"
                    >
                      {imageUploadError}
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {/* Precios y Stock */}
            <section className="rounded-2xl border border-emerald-100/60 bg-gradient-to-br from-emerald-50/40 via-sky-50/30 to-blue-50/20 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-blue-700">
                <DollarSign className="h-4 w-4 shrink-0 text-blue-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">Precios y stock</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-600">P. venta</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={precioVenta}
                    onChange={(e) => setPrecioVenta(e.target.value)}
                    className="bg-emerald-50/50 border-emerald-100 text-slate-900 rounded-xl min-h-[48px] font-bold placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Costo</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                    className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Stock actual</Label>
                  <Input
                    type="number"
                    min="0"
                    value={stockBloqueadoPorImei ? "1" : stockActual}
                    onChange={(e) => setStockActual(e.target.value)}
                    disabled={stockBloqueadoPorImei}
                    className={`rounded-xl min-h-[48px] ${stockBloqueadoPorImei ? "bg-slate-100 opacity-80 cursor-not-allowed border-slate-200" : "bg-white border-slate-200"}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-600">MÃ­nimo</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          type="number"
                          min="0"
                          value={stockBloqueadoPorImei ? "1" : stockMinimo}
                          onChange={(e) => setStockMinimo(e.target.value)}
                          disabled={stockBloqueadoPorImei}
                          className={`rounded-xl min-h-[48px] ${stockBloqueadoPorImei ? "bg-slate-100 border-slate-200 opacity-80 cursor-not-allowed" : "bg-amber-50/50 border-amber-100 text-slate-900"}`}
                        />
                      </TooltipTrigger>
                      {stockBloqueadoPorImei && (
                        <TooltipContent className="text-xs">Unidad Ãºnica: mÃ­nimo fijo en 1.</TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </section>

            {/* UbicaciÃ³n en almacÃ©n */}
            <section className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-700">AlmacÃ©n</h3>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">{labels.ubicacion}</Label>
                <Input
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  placeholder="Ej: Estante A1"
                  className="bg-slate-50/60 border-slate-200 rounded-xl min-h-[48px] placeholder:text-slate-300"
                />
              </div>
            </section>

          </div>
        </div>

        {/* â”€â”€ Footer â”€â”€ */}
        <div
          className={`flex flex-col-reverse gap-3 px-8 py-5 sm:flex-row sm:items-center ${
            esCategoriEquipos ? "sm:justify-between" : "sm:justify-end"
          }`}
        >
          {esCategoriEquipos && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Nota: La categorÃ­a EQUIPOS requiere obligatoriamente registrar IMEI/Serie.
            </p>
          )}
          <div className="flex justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={onClose} disabled={saving} className="h-12 rounded-2xl border-slate-200 bg-white px-6 font-bold uppercase tracking-wider text-sm text-slate-600 hover:bg-slate-50">
              Cancelar
            </Button>
            <Button
              onClick={onSubmit}
              disabled={saving}
              className="h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-wider text-sm gap-2 btn-glow shadow-lg shadow-blue-500/25 px-8"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editingProducto ? "Actualizando..." : "Guardando..."}
                </>
              ) : editingProducto ? (
                "Actualizar producto"
              ) : (
                "Guardar producto"
              )}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}

