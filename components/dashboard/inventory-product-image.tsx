"use client"

import Image from "next/image"
import { useState } from "react"
import { Package } from "lucide-react"
import { getInventoryCanonicalImageUrl, getInventoryPublicUrl } from "@/lib/storage"
import { cn } from "@/lib/utils"

export type InventoryProductImageProps = {
  /** Valor de `productos.imagen_url`: path relativo o URL completa. */
  stored: string | null | undefined
  /** `productos.id` (para preferir la ruta canonica `{tallerId}/{productId}.webp`) */
  productId?: string
  /** `productos.taller_id` */
  tallerId?: string
  alt: string
  width: number
  height: number
  className?: string
  imgClassName?: string
}

/**
 * Miniatura de producto: resuelve URL con `getInventoryPublicUrl` (sin duplicar prefijo si ya es URL absoluta).
 * Si no hay path o falla la carga, muestra icono de "sin foto".
 */
export function InventoryProductImage({
  stored,
  productId,
  tallerId,
  alt,
  width,
  height,
  className,
  imgClassName,
}: InventoryProductImageProps) {
  const canonical =
    tallerId && productId ? getInventoryCanonicalImageUrl(tallerId, productId) : null

  const resolved =
    stored && String(stored).trim().toLowerCase().endsWith(".webp")
      ? getInventoryPublicUrl(stored)
      : canonical ?? null
  const [broken, setBroken] = useState(false)

  if (!resolved || broken) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 text-slate-400",
          className
        )}
        style={{ width, height }}
        aria-hidden
      >
        <Package className="max-h-[45%] max-w-[45%]" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      className={cn("object-cover", imgClassName, className)}
      onError={() => setBroken(true)}
    />
  )
}

type InventoryProductImagePreviewProps = {
  stored: string | null | undefined
  productId?: string
  tallerId?: string
  alt: string
  className?: string
}

/** Vista previa cuadrada (modal inventario): ancho fluido, altura max. */
export function InventoryProductImagePreview({ stored, productId, tallerId, alt, className }: InventoryProductImagePreviewProps) {
  const canonical =
    tallerId && productId ? getInventoryCanonicalImageUrl(tallerId, productId) : null
  const resolved =
    stored && String(stored).trim().toLowerCase().endsWith(".webp")
      ? getInventoryPublicUrl(stored)
      : canonical ?? null
  const [broken, setBroken] = useState(false)

  if (!resolved || broken) {
    return (
      <div
        className={cn(
          "flex aspect-square w-full max-w-[200px] items-center justify-center rounded-lg border border-border bg-slate-100 text-slate-400",
          className
        )}
        aria-hidden
      >
        <Package className="h-12 w-12" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className={cn("relative aspect-square w-full max-w-[200px] overflow-hidden rounded-lg border border-border bg-white", className)}>
      <Image
        src={resolved}
        alt={alt}
        fill
        sizes="200px"
        className="object-cover"
        onError={() => setBroken(true)}
      />
    </div>
  )
}
