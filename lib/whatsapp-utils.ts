import { getCodigoTelefono } from "@/lib/constants/paises"

export function normalizePhoneForWhatsApp(
  raw: string | null | undefined,
  countryCode?: string,
): string | null {
  if (!raw?.trim()) return null
  let d = raw.replace(/\D/g, "")
  if (!d) return null

  const cc = countryCode ?? "52"

  if (d.startsWith(cc) && d.length > cc.length) return d

  return `${cc}${d}`
}

export function buildWhatsAppUrl(
  phoneDigits: string,
  text: string,
): string {
  const phone = String(phoneDigits).replace(/\D/g, "")
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
}

export function getTallerWhatsAppCountryCode(paisNombre: string | null | undefined): string {
  return getCodigoTelefono(paisNombre ?? "Mexico")
}
