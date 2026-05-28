/** Etiquetas cortas para UI (modales, confirmacion, historial). */
export function getRepairStatusDisplayLabel(value: string): string {
  const map: Record<string, string> = {
    Recibido: "RECIBIDO",
    Diagnostico: "DIAGNOSTICO",
    "En Reparacion": "EN REPARACION",
    Listo: "LISTO",
    Entregado: "ENTREGADO",
    Cancelado: "CANCELADO",
    "Sin Reparacion": "SIN REPARACION",
    Reingreso: "REINGRESO",
  }
  return map[value] ?? value
}
