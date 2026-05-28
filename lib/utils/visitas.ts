/**
 * lib/utils/visitas.ts
 *
 * Utilidades puras para visitas (no dependen de servidor).
 */

export type MotivoVisita =
  | "reparacion"
  | "cotizacion"
  | "compra"
  | "recoger"
  | "personal"
  | "otro"

const MOTIVO_LABELS: Record<MotivoVisita, string> = {
  reparacion: "Reparacion / Diagnostico",
  cotizacion: "Cotizacion",
  compra: "Comprar producto",
  recoger: "Recoger equipo",
  personal: "Personal del negocio",
  otro: "Otro",
}

export function getMotivoLabel(motivo: string | null): string {
  if (!motivo) return "Sin especificar"
  return MOTIVO_LABELS[motivo as MotivoVisita] || motivo
}
