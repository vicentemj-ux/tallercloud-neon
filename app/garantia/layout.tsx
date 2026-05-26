import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Garantía digital | TallerCloud",
  description: "Comprobante de salida y garantía de tu reparación.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function GarantiaLayout({ children }: { children: React.ReactNode }) {
  return children
}
