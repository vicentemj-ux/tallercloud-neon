"use client"

import { useEffect, useState } from "react"
import { getTallerSettings } from "@/lib/actions/settings-prisma"

/** Nombre del negocio desde `configuracion_taller`, con fallback a cookie. */
export function useTallerNegocioNombre() {
  const [name, setName] = useState("Mi Taller")
  useEffect(() => {
    let cancelled = false
    getTallerSettings()
      .then(({ settings }) => {
        if (cancelled || !settings?.nombre_taller) return
        setName(settings.nombre_taller.trim() || "Mi Taller")
      })
      .catch(() => {
        try {
          const raw = document.cookie.split("tallerName=")[1]?.split(";")[0]
          if (raw) setName(decodeURIComponent(raw))
        } catch {
          /* ignore */
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  return name
}
