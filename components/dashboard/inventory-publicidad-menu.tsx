"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useReactToPrint } from "react-to-print"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PosterExhibicion } from "@/components/print-templates/PosterExhibicion"
import type { ProductoRow } from "@/lib/actions/productos-prisma"
import { getTallerSettings } from "@/lib/actions/settings-prisma"
import { getEsUsuarioPro } from "@/lib/actions/auth-prisma"
import { toast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Megaphone, Download, Printer, ImageIcon } from "lucide-react"

export interface InventoryPublicidadMenuProps {
  producto: ProductoRow
  tallerNombre: string
  onEtiquetaVenta: (showPrice: boolean) => void
  onCartelPrecio: () => void
  disabled?: boolean
  /** `printer` = solo icono de impresora (misma fila de acciones del inventario). */
  triggerVariant?: "default" | "compact" | "printer"
}

/**
 * Evita mismatch de hidratacion: el menu completo solo se monta en el cliente.
 */
export function InventoryPublicidadMenu(props: InventoryPublicidadMenuProps) {
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  if (!isMounted) return null
  return <InventoryPublicidadMenuInner {...props} />
}

function InventoryPublicidadMenuInner({
  producto,
  tallerNombre,
  onEtiquetaVenta,
  onCartelPrecio,
  disabled = false,
  triggerVariant = "default",
}: InventoryPublicidadMenuProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [tallerTelefono, setTallerTelefono] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState(tallerNombre || "Mi Taller")
  const [squareOpen, setSquareOpen] = useState(false)
  const [isOfferOpen, setIsOfferOpen] = useState(false)
  const [isUsuarioPro, setIsUsuarioPro] = useState(false)

  const letterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getTallerSettings().then(({ settings }) => {
      setLogoUrl(settings?.logo_url ?? null)
      setTallerTelefono(settings?.telefono?.trim() ? settings.telefono.trim() : null)
      setBusinessName((settings?.nombre_taller || tallerNombre || "Mi Taller").trim())
    })
    getEsUsuarioPro()
      .then((pro) => setIsUsuarioPro(Boolean(pro)))
      .catch(() => setIsUsuarioPro(false))
  }, [tallerNombre])

  const handlePrintLetter = useReactToPrint({
    contentRef: letterRef,
    documentTitle: `Poster-${producto.sku || producto.id}`,
    pageStyle: `
      @page { size: letter portrait; margin: 0.45in; }
      @media print {
        html, body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `,
  })

  const refreshBranding = useCallback(async () => {
    try {
      const { settings } = await getTallerSettings()
      setLogoUrl(settings?.logo_url ?? null)
      setTallerTelefono(settings?.telefono?.trim() ? settings.telefono.trim() : null)
      setBusinessName((settings?.nombre_taller || tallerNombre || "Mi Taller").trim())
    } catch {
      /* usar cache */
    }
  }, [tallerNombre])

  const onPosterCarta = async () => {
    await refreshBranding()
    setTimeout(() => {
      handlePrintLetter()
    }, 80)
  }

  const openServerPosterDownload = (format: "square" | "vertical") => {
    if (!isUsuarioPro) {
      toast({
        title: "Plan Pro requerido",
        description:
          "La generacion de imagenes para redes esta incluido en el Plan Pro. Actualiza en Configuracion del taller.",
        variant: "destructive",
      })
      return
    }
    const q = new URLSearchParams()
    q.set("id", producto.id)
    q.set("format", format)
    if (isOfferOpen) q.set("isOffer", "1")
    window.open(`/api/generate-poster?${q.toString()}`, "_blank", "noopener,noreferrer")
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {triggerVariant === "printer" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="h-10 w-10 rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-200 hover:text-slate-900"
              aria-label="Publicidad: etiqueta, cartel y redes"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant={triggerVariant === "compact" ? "ghost" : "outline"}
              size="sm"
              disabled={disabled}
              className={
                triggerVariant === "compact"
                  ? "h-9 gap-1.5 rounded-full px-3 text-xs font-semibold text-slate-700"
                  : "h-9 gap-1.5 rounded-full border-blue-200 bg-white text-xs font-semibold text-blue-700 hover:bg-blue-50"
              }
            >
              <Megaphone className="h-3.5 w-3.5 shrink-0" />
              Publicidad
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(100vw-2rem,20rem)]">
          <DropdownMenuLabel className="text-xs font-semibold text-slate-500">
            Punto de venta
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2.5"
            onClick={() => onEtiquetaVenta(true)}
          >
            <Printer className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium">Etiqueta con precio</span>
              <span className="text-[10px] font-normal uppercase tracking-wide text-[#64748b]">
                50 x 25 mm
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2.5"
            onClick={() => onEtiquetaVenta(false)}
          >
            <Printer className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium">Etiqueta sin precio</span>
              <span className="text-[10px] font-normal uppercase tracking-wide text-[#64748b]">
                50 x 25 mm
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2.5"
            onClick={() => {
              if (!isUsuarioPro) {
                toast({
                  title: "Plan Pro requerido",
                  description:
                    "El Cartel de precio esta incluido en el Plan Pro. Actualiza en Configuracion del taller.",
                  variant: "destructive",
                })
                return
              }
              onCartelPrecio()
            }}
          >
            <span className="text-base" aria-hidden>
              ðŸ“„
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="font-medium">Cartel de precio</span>
                <Badge
                  variant="secondary"
                  className="h-4 rounded-full bg-purple-100 px-2 text-[9px] font-bold uppercase leading-none text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                >
                  Pro
                </Badge>
              </span>
              <span className="text-[10px] font-normal uppercase tracking-wide text-[#64748b]">
                4 Ã— 6 pulgadas
              </span>
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-xs font-semibold text-slate-500">
            Redes Sociales
          </DropdownMenuLabel>
          <div
            className="px-2 pb-2 pt-0.5"
            onPointerDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Label
                htmlFor={`publicidad-oferta-${producto.id}`}
                className="cursor-pointer text-left text-xs font-medium leading-snug text-slate-700"
              >
                ðŸ“¢ Activar Oferta de la Semana
              </Label>
              <Switch
                id={`publicidad-oferta-${producto.id}`}
                checked={isOfferOpen}
                onCheckedChange={setIsOfferOpen}
                className="shrink-0 data-[state=checked]:bg-[#dc2626]"
              />
            </div>
          </div>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2.5"
            onClick={() => {
              if (!isUsuarioPro) {
                toast({
                  title: "Plan Pro requerido",
                  description:
                    "El poster de exhibicion esta incluido en el Plan Pro. Actualiza en Configuracion del taller.",
                  variant: "destructive",
                })
                return
              }
              void onPosterCarta()
            }}
          >
            <span className="text-base" aria-hidden>
              ðŸ–¨ï¸
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-2">
                <span className="font-medium">Imprimir poster de exhibicion</span>
                <Badge
                  variant="secondary"
                  className="h-4 rounded-full bg-purple-100 px-2 text-[9px] font-bold uppercase leading-none text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                >
                  Pro
                </Badge>
              </span>
              <span className="text-[10px] font-normal uppercase tracking-wide text-[#64748b]">
                Hoja carta Â· react-to-print
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer flex-col items-start gap-1 py-2.5"
            onClick={() => {
              if (!isUsuarioPro) {
                toast({
                  title: "Plan Pro requerido",
                  description:
                    "Generar imagen para redes esta incluido en el Plan Pro. Actualiza en Configuracion del taller.",
                  variant: "destructive",
                })
                return
              }
              void refreshBranding()
              setSquareOpen(true)
            }}
          >
            <span className="flex items-center gap-2">
              <span className="font-medium">Generar imagen para redesâ€¦</span>
              <Badge
                variant="secondary"
                className="h-4 rounded-full bg-purple-100 px-2 text-[9px] font-bold uppercase leading-none text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              >
                Pro
              </Badge>
            </span>
            <span className="text-[10px] font-normal uppercase tracking-wide text-[#64748b]">
              Cuadrado 1080Ã—1080 o vertical 9:16
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="pointer-events-none fixed top-0 left-[-14000px] z-[-1]" aria-hidden>
        <div ref={letterRef} style={{ backgroundColor: "#ffffff" }}>
          <PosterExhibicion
            producto={producto}
            format="letter"
            isOffer={isOfferOpen}
            precio_oferta={null}
            businessName={businessName}
            logoUrl={logoUrl}
            tallerTelefono={tallerTelefono}
          />
        </div>
      </div>

      <Dialog open={squareOpen} onOpenChange={setSquareOpen}>
        <DialogContent className="max-h-[95vh] max-w-lg overflow-y-auto border-slate-200 bg-white">
          <DialogHeader>
            <DialogTitle>Generar imagen</DialogTitle>
            <DialogDescription>
              Vista previa aproximada (HTML). La descarga usa el motor del servidor (PNG de alta calidad) con el nombre
              y logo configurados en tu taller.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex justify-center rounded-xl p-3 sm:p-4"
            style={{
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: "#e2e8f0",
              backgroundColor: "rgba(241, 245, 249, 0.85)",
            }}
          >
            <div
              className="inline-block rounded-lg"
              style={{
                backgroundColor: "#ffffff",
                borderWidth: "1px",
                borderStyle: "solid",
                borderColor: "#e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
              }}
            >
              <PosterExhibicion
                producto={producto}
                format="square"
                isOffer={isOfferOpen}
                precio_oferta={null}
                businessName={businessName}
                logoUrl={logoUrl}
                tallerTelefono={tallerTelefono}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:gap-3">
            <Button type="button" variant="outline" onClick={() => setSquareOpen(false)} className="w-full sm:w-auto">
              Cerrar
            </Button>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant={isUsuarioPro ? "default" : "outline"}
                className={
                  isUsuarioPro
                    ? "gap-2 bg-blue-600 text-white hover:bg-blue-700"
                    : "gap-2 border-slate-200 text-slate-600"
                }
                onClick={() => openServerPosterDownload("square")}
              >
                <ImageIcon className="h-4 w-4 shrink-0" aria-hidden />
                Descargar para Facebook (Cuadrado)
              </Button>
              <Button
                type="button"
                variant={isUsuarioPro ? "default" : "outline"}
                className={
                  isUsuarioPro
                    ? "gap-2 border-teal-600 bg-teal-600 text-white hover:bg-teal-700"
                    : "gap-2 border-slate-200 text-slate-600"
                }
                onClick={() => openServerPosterDownload("vertical")}
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Descargar para WhatsApp (Vertical)
              </Button>
            </div>
          </DialogFooter>
          {!isUsuarioPro ? (
            <p className="text-center text-[11px] text-slate-500">
              La generacion de imagenes para redes requiere Plan Pro.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

