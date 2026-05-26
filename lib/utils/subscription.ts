export const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Días restantes hasta `fechaVencimiento`, comparando en UTC a nivel de día.
 * - Valida fechas inválidas
 * - Devuelve `null` para ausencia de fecha
 * - Devuelve siempre >= 0
 *
 * Semántica: `fecha_vencimiento_plan` es el ÚLTIMO DÍA VÁLIDO (no el primer día inválido).
 * El admin guarda el timestamp del momento de creación + N días (incluye componente de hora).
 * El proxy bloquea cuando `timestamp < Date.now()` (compara hora exacta).
 * Esta función usa "fin del día almacenado UTC" como target para alinear con el proxy:
 *   - Día de vencimiento (ej. April 10): muestra "1 día" → proxy no bloquea aún ✓
 *   - Día siguiente (ej. April 11):     muestra "0 días" → proxy bloquea después de la hora exacta ✓
 */
export function calcDiasRestantes(fechaVencimiento: string | null | undefined): number | null {
  if (!fechaVencimiento) return null

  const parsedDate = new Date(fechaVencimiento)
  if (Number.isNaN(parsedDate.getTime())) {
    const raw = String(fechaVencimiento).trim()
    let year: number | undefined
    let month: number | undefined
    let day: number | undefined

    // Intentar ISO: 2026-04-29
    const isoPart = raw.substring(0, 10)
    if (isoPart.includes("-")) {
      ;[year, month, day] = isoPart.split("-").map(Number)
    }

    // Fallback DD/MM/YYYY: 29/04/2026
    if ((!year || !month || !day) && raw.includes("/")) {
      const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (dmyMatch) {
        day = Number(dmyMatch[1])
        month = Number(dmyMatch[2])
        year = Number(dmyMatch[3])
      }
    }

    if (!year || !month || !day) return null

    // Fecha-only: misma semántica de fin-de-día (+1)
    const fallbackUtc = Date.UTC(year, month - 1, day + 1)
    const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    const dias = Math.ceil((fallbackUtc - todayUtc) / MS_PER_DAY)
    return Math.max(0, dias)
  }

  // Usar el día siguiente al almacenado como límite ("fin del día UTC")
  // Esto alinea el conteo de días con la lógica del proxy (que compara timestamp exacto).
  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  const targetUtc = Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate() + 1)
  const dias = Math.ceil((targetUtc - todayUtc) / MS_PER_DAY)

  return Math.max(0, dias)
}
