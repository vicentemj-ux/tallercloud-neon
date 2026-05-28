"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { TicketCompraTemplate, type TicketCompraData } from "@/components/print-templates/TicketCompraTemplate"
import { getTallerSettings } from "@/lib/actions/settings"
import { usePrintWindowClose } from "@/hooks/use-print-window-close"

interface BusinessSettings {
  name: string
  phone: string
  address: string
  logoUrl: string | null
  declaracionJurat: string
  mensajeDespedida: string
  mostrarLogo: boolean
}

function parseQueryData(sp: URLSearchParams): TicketCompraData | null {
  const folio = sp.get("folio")
  const vendedor = sp.get("vendedor")
  const documento = sp.get("documento")
  const marca = sp.get("marca")
  const modelo = sp.get("modelo")
  const serial = sp.get("serial")
  const imei = sp.get("imei")
  const monto = sp.get("monto")

  if (!folio || !vendedor || !marca || !modelo || !monto) return null

  return {
    folio,
    fecha: sp.get("fecha") || new Date().toLocaleString("es-MX"),
    vendedor,
    documento: documento || "—",
    marca,
    modelo,
    serial: serial || "—",
    imei: imei || "—",
    monto: Number(monto) || 0,
    condicion: sp.get("condicion") || "—",
    color: sp.get("color") || "—",
    capacidad: sp.get("capacidad") || "—",
    observaciones: sp.get("observaciones") || undefined,
  }
}

function PrintCompraContent() {
  const searchParams = useSearchParams()
  const [business, setBusiness] = useState<BusinessSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  usePrintWindowClose()

  const data = useMemo(() => {
    if (!searchParams) return null
    return parseQueryData(searchParams)
  }, [searchParams])

  useEffect(() => {
    const load = async () => {
      try {
        const { settings } = await getTallerSettings()
        if (!settings) {
          setLoadError("No se pudo cargar la configuracion del taller.")
          return
        }

        const cfg = settings.impresion_config as Record<string, unknown> | null
        const compraCfg = (cfg?.compra || {}) as Record<string, unknown>

        setBusiness({
          name: settings.nombre_taller || "Mi Taller",
          phone: settings.telefono || "",
          address: settings.direccion || "",
          logoUrl: settings.logo_url ?? null,
          declaracionJurat: String(compraCfg.declaracionJurat || ""),
          mensajeDespedida: settings.mensaje_despedida || "¡Gracias por su preferencia!",
          mostrarLogo: Boolean(compraCfg.mostrarLogo ?? true),
        })
      } catch (err) {
        console.error("[print-compra] error:", err)
        setLoadError("Error al cargar la configuracion.")
      }
    }
    void load()
  }, [])

  // Disparar impresion
  useEffect(() => {
    if (!data || !business) return

    document.body.classList.add("print-ticket-mode")

    const style = document.createElement("style")
    style.id = "print-compra-page-style"
    style.textContent = `@page { size: A4 portrait; margin: 8mm; } @media print { body { margin: 0 !important; padding: 0 !important; } }`
    document.head.appendChild(style)

    const timer = window.setTimeout(() => window.print(), 600)

    return () => {
      window.clearTimeout(timer)
      document.body.classList.remove("print-ticket-mode")
      document.getElementById("print-compra-page-style")?.remove()
    }
  }, [data, business])

  if (loadError) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#c00000", fontSize: "14px" }}>
        <strong>Error:</strong> {loadError}
      </div>
    )
  }

  if (!data || !business) {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#555", fontSize: "13px" }}>
        Cargando comprobante…
      </div>
    )
  }

  return (
    <div className="print-ticket-only flex items-start justify-center bg-white p-4">
      <TicketCompraTemplate
        data={data}
        businessName={business.name}
        businessPhone={business.phone}
        businessAddress={business.address}
        logoUrl={business.logoUrl}
        declaracionJurat={business.declaracionJurat || undefined}
        mensajeDespedida={business.mensajeDespedida}
        mostrarLogo={business.mostrarLogo}
      />
    </div>
  )
}

export default function PrintCompraPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", color: "#555", fontSize: "13px" }}>
        Cargando comprobante…
      </div>
    }>
      <PrintCompraContent />
    </Suspense>
  )
}
