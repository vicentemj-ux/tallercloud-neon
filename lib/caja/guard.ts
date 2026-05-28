export const CAJA_GUARD_MESSAGES = {
  NO_CAJA_ABIERTA: "No hay caja abierta. Abre la caja antes de realizar esta operacion.",
  ERROR_VERIFICAR_CAJA: "Error al verificar caja.",
  SALDO_INSUFICIENTE: "Saldo insuficiente en caja.",
} as const

export interface CajaGuardRow {
  id: string
  saldo_actual?: number | null
  estado?: string
}

interface CajaGuardResultOk {
  ok: true
  caja: CajaGuardRow
}

interface CajaGuardResultErr {
  ok: false
  error: string
}

export type CajaGuardResult = CajaGuardResultOk | CajaGuardResultErr

/**
 * Policy central for any financial operation that impacts cashbox.
 * Server-side only: never rely on frontend modal state.
 */
export async function requireOpenCajaForFinancialOperation(params: {
  supabase: any
  tallerId: string
  requiredAmount?: number
  requireSufficientBalance?: boolean
}): Promise<CajaGuardResult> {
  const {
    supabase,
    tallerId,
    requiredAmount = 0,
    requireSufficientBalance = false,
  } = params

  const { data: cajaRow, error: cajaErr } = await supabase
    .from("caja")
    .select("id, saldo_actual, estado, fecha_apertura")
    .eq("taller_id", tallerId)
    .eq("estado", "abierta")
    .order("fecha_apertura", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cajaErr) {
    console.error("[caja-guard] Error verificando caja abierta:", cajaErr)
    return { ok: false, error: CAJA_GUARD_MESSAGES.ERROR_VERIFICAR_CAJA }
  }

  if (!cajaRow?.id) {
    return { ok: false, error: CAJA_GUARD_MESSAGES.NO_CAJA_ABIERTA }
  }

  if (requireSufficientBalance) {
    const saldoActual = Number(cajaRow.saldo_actual ?? 0)
    const amount = Math.abs(Number(requiredAmount ?? 0))
    if (saldoActual < amount) {
      return {
        ok: false,
        error: `${CAJA_GUARD_MESSAGES.SALDO_INSUFICIENTE} ($${saldoActual.toLocaleString("es-MX", { minimumFractionDigits: 2 })}).`,
      }
    }
  }

  return {
    ok: true,
    caja: {
      id: cajaRow.id as string,
      saldo_actual: cajaRow.saldo_actual as number | null | undefined,
      estado: cajaRow.estado as string | undefined,
    },
  }
}
