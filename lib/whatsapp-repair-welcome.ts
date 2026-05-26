import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-utils"
import { getPublicAppBaseUrl } from "@/lib/app-public"

export type RepairWelcomeWhatsAppPayload = {
  folio: string
  repairId: string
  customerName: string
  customerPhone: string
  countryCode?: string
  deviceBrand: string
  deviceModel: string
  reportedFault: string
}

export function buildRepairWelcomeWhatsAppMessage(p: RepairWelcomeWhatsAppPayload): string {
  const clienteNombre = (p.customerName || "cliente").trim()
  const equipoMarcaModelo = `${p.deviceBrand || ""} ${p.deviceModel || ""}`.trim() || "tu equipo"
  const baseUrl = getPublicAppBaseUrl()
  const trackingUrl = `${baseUrl}/track/${encodeURIComponent(p.repairId)}`
  return `Hola ${clienteNombre}, te informamos que tu equipo ${equipoMarcaModelo} (Ticket #${p.folio}) se encuentra en estado: RECIBIDO. Puedes consultar el avance aquí: ${trackingUrl}`
}

export async function openRepairWelcomeWhatsApp(p: RepairWelcomeWhatsAppPayload): Promise<void> {
  const digits = normalizePhoneForWhatsApp(p.customerPhone, p.countryCode)
  if (!digits) return
  const message = buildRepairWelcomeWhatsAppMessage(p)
  const url = `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
