"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

const createClient = async () => (await createCurrentTenantClient()).supabase

export interface AjustesTallerFlujoPro {
  health_check_required: boolean
  firma_required: boolean
  fotos_required: boolean
}

const DEFAULTS: AjustesTallerFlujoPro = {
  health_check_required: false,
  firma_required: false,
  fotos_required: false,
}

export async function getAjustesTallerFlujoPro(): Promise<{
  ajustes: AjustesTallerFlujoPro
  error: string | null
}> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { data, error } = await supabase
    .from("ajustes_taller")
    .select("health_check_required, firma_required, fotos_required")
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (error) {
    console.error("getAjustesTallerFlujoPro:", error)
    return { ajustes: { ...DEFAULTS }, error: error.message }
  }

  if (!data) {
    return { ajustes: { ...DEFAULTS }, error: null }
  }

  const row = data as Record<string, unknown>
  return {
    ajustes: {
      health_check_required: Boolean(row.health_check_required),
      firma_required: Boolean(row.firma_required),
      fotos_required: Boolean(row.fotos_required),
    },
    error: null,
  }
}

export async function updateAjustesTallerFlujoPro(
  input: Partial<AjustesTallerFlujoPro>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const payload: Record<string, unknown> = {
    taller_id: tallerId,
    updated_at: new Date().toISOString(),
  }
  if (input.health_check_required !== undefined) payload.health_check_required = input.health_check_required
  if (input.firma_required !== undefined) payload.firma_required = input.firma_required
  if (input.fotos_required !== undefined) payload.fotos_required = input.fotos_required

  const { error } = await supabase.from("ajustes_taller").upsert(payload, { onConflict: "taller_id" })

  if (error) {
    console.error("updateAjustesTallerFlujoPro:", error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
