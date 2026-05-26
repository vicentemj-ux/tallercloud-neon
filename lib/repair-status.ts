/** Etiquetas cortas para UI (modales, confirmación, historial). */
export function getRepairStatusDisplayLabel(value: string): string {
  const map: Record<string, string> = {
    Recibido: "RECIBIDO",
    Diagnostico: "DIAGNÓSTICO",
    "En Reparacion": "EN REPARACIÓN",
    Listo: "LISTO",
    Entregado: "ENTREGADO",
    Cancelado: "CANCELADO",
    "Sin Reparacion": "SIN REPARACIÓN",
    Reingreso: "REINGRESO",
  }
  return map[value] ?? value
}
