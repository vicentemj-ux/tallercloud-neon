/** Etiquetas cortas para UI (modales, confirmacion, historial). */
export function getRepairStatusDisplayLabel(value: string): string {
  const map: Record<string, string> = {
    Recibido: "RECIBIDO",
    Diagnostico: "DIAGNoSTICO",
    "En Reparacion": "EN REPARACIoN",
    Listo: "LISTO",
    Entregado: "ENTREGADO",
    Cancelado: "CANCELADO",
    "Sin Reparacion": "SIN REPARACIoN",
    Reingreso: "REINGRESO",
  }
  return map[value] ?? value
}
