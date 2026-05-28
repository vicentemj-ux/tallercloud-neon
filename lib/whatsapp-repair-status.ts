/**
 * Construye la URL de WhatsApp (api.whatsapp.com) para notificar cambio de estado de reparacion.
 * Solo cliente (sin dependencias de servidor).
 */

import { normalizePhoneForWhatsApp, buildWhatsAppUrl } from "@/lib/whatsapp-utils"
import { formatMoneyMx } from "@/lib/utils/currency"
import { getPublicAppBaseUrl } from "@/lib/app-public"

function safeStr(v: unknown, fallback = "—"): string {
  if (v == null) return fallback
  const s = String(v).trim()
  return s.length ? s : fallback
}

export function buildRepairStatusWhatsAppUrl(params: {
  phoneRaw?: string | null
  countryCode?: string
  nombreTaller?: string | null
  cliente?: string | null
  equipo?: string | null
  folio?: string | null
  repairId?: string | null
  estadoNuevo?: string | null
  notaTecnica?: string | null
  total?: number | null
  restante?: number | null
  /** Costo de revision cuando el estado es Sin Reparacion */
  costoRevision?: number | null
  baseUrl?: string | null
}): string | null {
  try {
    const digits = normalizePhoneForWhatsApp(params.phoneRaw ?? "", params.countryCode)
    if (!digits) return null

    const nombreTaller = safeStr(params.nombreTaller, "Mi Taller")
    const cliente = safeStr(params.cliente, "cliente")
    const equipo = safeStr(params.equipo, "equipo")
    const folio = safeStr(params.folio, "—")
    const repairId = safeStr(params.repairId, "")
    const n = (params.estadoNuevo ?? "").trim()
    let body = ""

    if (n === "Listo") {
      body = `${nombreTaller}\nHola ${cliente}, tu equipo ${equipo} (Folio #${folio}) esta LISTO.\n\n✅ Resultado: Exitoso\n💰 Total: ${formatMoneyMx(params.total)}\n📉 Restante: ${formatMoneyMx(params.restante)}\n\n_Organizado con TallerCloud.net_`
    } else if (n === "Sin Reparacion") {
      const motivo = params.notaTecnica?.trim() || "—"
      body = `${nombreTaller}\nHola ${cliente}, lamentamos informar que tu equipo ${equipo} (#${folio}) se marco como No Reparable.\n\n📝 Motivo: ${motivo}\n💵 Costo revision: ${formatMoneyMx(params.costoRevision)}\n\n_Organizado con TallerCloud.net_`
    } else {
      const base =
        safeStr(params.baseUrl, "").replace(/\/$/, "") ||
        getPublicAppBaseUrl() ||
        "https://tallercloud.net"
      const track = repairId ? `${base}/track/${repairId}` : base
      body = `${nombreTaller}\nHola ${cliente}, el estado de tu orden ${folio} cambio a: ${n || "actualizado"}.\n\n🔗 Rastreo: ${track}\n\n_Organizado con TallerCloud.net_`
    }

    return buildWhatsAppUrl(digits, body)
  } catch (e) {
    console.error("[buildRepairStatusWhatsAppUrl]", e)
    return null
  }
}
