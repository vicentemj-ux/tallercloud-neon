import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Mi Suscripción",
  description: "Planes, estatus y renovación de tu cuenta TallerCloud.",
}

export default function FacturacionLayout({ children }: { children: ReactNode }) {
  return children
}
