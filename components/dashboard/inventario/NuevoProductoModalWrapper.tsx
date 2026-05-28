"use client"

import { useState, useCallback } from "react"
import { NuevoProductoModal } from "./NuevoProductoModal"
import { createProducto, uploadProductImage, deleteProducto } from "@/lib/actions/productos-prisma"
import { toast } from "@/hooks/use-toast"

export function NuevoProductoModalWrapper({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [editingProducto, setEditingProducto] = useState<null>(null)
  const [draftProductId, setDraftProductId] = useState("")

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
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setEditingProducto(null)
    setDraftProductId("")
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
    setUploadingImage(false)
    setImageUploadError(null)
  }, [])

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      if (saving) return
      const pid = draftProductId
      const nom = nombre.trim()
      if (pid && (!nom || nom === "Producto (borrador)")) {
        void deleteProducto(pid)
      }
      resetForm()
      onClose()
    }
  }, [saving, draftProductId, nombre, resetForm, onClose])

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

  const handleSubmit = async () => {
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
    const pid = draftProductId || crypto.randomUUID()
    if (!draftProductId) setDraftProductId(pid)
    const formData = buildProductPayload(pid, nom)
    try {
      const result = await createProducto(formData)
      if (result.success) {
        toast({ title: "Producto guardado", description: "El producto se agrego al inventario." })
        resetForm()
        onClose()
        onSaved?.()
      } else {
        toast({ title: "Error al guardar", description: result.error ?? "No se pudo guardar.", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Error al guardar", description: e instanceof Error ? e.message : String(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const generarCodigoBarrasInterno = () => {
    let base = "200"
    for (let i = 0; i < 9; i++) {
      base += Math.floor(Math.random() * 10).toString()
    }
    const digits = base.split("").map((d) => parseInt(d, 10))
    let sumOdd = 0
    let sumEven = 0
    for (let i = 0; i < 12; i++) {
      if ((i + 1) % 2 === 0) sumEven += digits[i]
      else sumOdd += digits[i]
    }
    const total = sumOdd + sumEven * 3
    const checkDigit = (10 - (total % 10)) % 10
    setCodigoBarras(base + checkDigit.toString())
  }

  const handleImageFile = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return
    setUploadingImage(true)
    setImageUploadError(null)
    try {
      let productId = draftProductId
      if (!productId) {
        productId = crypto.randomUUID()
        setDraftProductId(productId)
      }
      // Persistir borrador para tener ID estable
      const persist = await createProducto(buildProductPayload(productId, "Producto (borrador)"))
      if (!persist.success) {
        const msg = persist.error?.trim() || "No se pudo guardar el producto."
        setImageUploadError("Error al subir. " + msg)
        toast({ title: "No se pudo preparar la foto", description: msg, variant: "destructive" })
        return
      }
      const { optimizeImageForUpload } = await import("@/lib/image-optimizer")
      const compressedFile = await optimizeImageForUpload(file)
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = rej
        r.readAsDataURL(compressedFile)
      })
      const mimeType = compressedFile.type || "image/webp"
      const res = await uploadProductImage(base64, productId, mimeType)
      if (!res.success) {
        const short = res.error && res.error.length > 120 ? "Revisa la conexion o el bucket de fotos en Supabase." : res.error
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
  }

  return (
    <NuevoProductoModal
      open={open}
      onClose={() => handleOpenChange(false)}
      editingProducto={null}
      draftProductId={draftProductId || crypto.randomUUID()}
      saving={saving}
      onSubmit={handleSubmit}
      tallerNombre=""
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
      uploadingImage={uploadingImage}
      generarCodigoBarrasInterno={generarCodigoBarrasInterno}
      handleImageFile={handleImageFile}
      removeImage={removeImage}
      imageUploadError={imageUploadError}
      onClearImageUploadError={() => setImageUploadError(null)}
    />
  )
}

