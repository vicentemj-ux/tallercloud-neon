"use server"

import { revalidatePath } from "next/cache"
import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getPrismaClient } from "@/lib/prisma"
import { Resend } from "resend"
import { getInventoryPublicUrl } from "@/lib/storage"
import { formatCurrency } from "@/lib/utils/currency"
import { formatDate } from "@/lib/utils/date"
import { verificarVisitasPendientesCierre } from "@/lib/actions/bitacora-visitas"
import { requireOpenCajaForFinancialOperation } from "@/lib/caja/guard"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CajaRow {
  id: string
  taller_id: string
  monto_inicial: number
  monto_cierre: number | null
  fecha_apertura: string
  fecha_cierre: string | null
  estado: "abierta" | "cerrada"
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_ventas: number
  nota_cierre?: string | null
  numero_corte?: number | null
}

export interface ProductoDisponible {
  id: string
  taller_id: string
  nombre: string
  sku: string | null
  categoria: string | null
  precio_venta: number
  costo: number
  stock_actual: number
  imagen_url: string | null
  es_equipo: boolean
  imei_serie: string | null
  color: string | null
  capacidad: string | null
  condicion: string | null
  marca: string | null
  modelo: string | null
  procesador: string | null
  ram: string | null
  almacenamiento: string | null
}

export interface DetalleVentaInput {
  producto_id?: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  es_especial: boolean
  imei_serie?: string
  color?: string
  condicion?: string
  marca?: string
  modelo?: string
  procesador?: string
  ram?: string
  almacenamiento?: string
  categoria?: string
}

interface StockAlertProduct {
  id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
}

export interface CorteCobro {
  id: string
  tipo: string
  descripcion: string | null
  folio: string | null
  monto: number
  metodo_pago: string | null
}

export interface CorteGasto {
  id: string
  descripcion: string | null
  monto: number
}

export interface CorteVentaLinea {
  id: string
  folio: string
  created_at: string
  total: number
  metodo_pago?: string
  descripcion?: string
}

/** Totales del corte para impresión y email (misma fuente que `getCajaConDetalle`). */
export interface CortePrintData {
  numero_corte: number
  fecha_apertura: string
  fecha_cierre: string
  monto_inicial: number
  total_ventas: number
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_abonos: number
  total_abonos_efectivo: number
  total_abonos_tarjeta: number
  total_abonos_transferencia: number
  total_gastos: number
  saldo_final: number
  /** Efectivo físico contado al cerrar (BD). */
  monto_cierre?: number | null
  nota_cierre?: string
  /** Line items for the "Cobros Reparaciones" section of the ticket. */
  cobrosRep: CorteCobro[]
  /** Line items for the "Gastos Operativos" section of the ticket. */
  listaGastos: CorteGasto[]
  /** Line items for the "Ventas PDV" section of the ticket. */
  ventas: CorteVentaLinea[]
  /** Total de ventas PDV. */
  totalVentasPdv: number
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function shouldFallbackToPrisma(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "")
  return (
    message.includes("Missing env vars: NEXT_PUBLIC_SUPABASE_URL") ||
    message.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    message.includes("SUPABASE_JWT_SECRET")
  )
}

function normalizeCajaRow(row: Record<string, unknown> | null | undefined): CajaRow | null {
  if (!row || typeof row !== "object") return null
  const fechaApertura = row.fecha_apertura
  const fechaCierre = row.fecha_cierre
  return {
    id: String(row.id ?? ""),
    taller_id: String(row.taller_id ?? ""),
    monto_inicial: Number(row.monto_inicial ?? 0),
    monto_cierre: row.monto_cierre == null ? null : Number(row.monto_cierre),
    fecha_apertura: fechaApertura instanceof Date ? fechaApertura.toISOString() : String(fechaApertura ?? ""),
    fecha_cierre:
      fechaCierre == null ? null : fechaCierre instanceof Date ? fechaCierre.toISOString() : String(fechaCierre),
    estado: row.estado === "cerrada" ? "cerrada" : "abierta",
    total_efectivo: Number(row.total_efectivo ?? 0),
    total_tarjeta: Number(row.total_tarjeta ?? 0),
    total_transferencia: Number(row.total_transferencia ?? 0),
    total_ventas: Number(row.total_ventas ?? 0),
    nota_cierre: row.nota_cierre == null ? null : String(row.nota_cierre),
    numero_corte: row.numero_corte == null ? null : Number(row.numero_corte),
  }
}

async function getOwnerAlertContext(supabase: Awaited<ReturnType<typeof createCurrentTenantClient>>["supabase"], tallerId: string) {
  const { data: config } = await supabase
    .from("configuracion_taller")
    .select("nombre_taller, alertas_stock_bajo, reportes_cierre_caja, email_contacto")
    .eq("taller_id", tallerId)
    .maybeSingle()

  const { data: owner } = await supabase
    .from("taller_users")
    .select("email, nombre_propietario")
    .eq("id", tallerId)
    .maybeSingle()

  const ownerEmail = (owner?.email as string | undefined)?.trim()
    || (config?.email_contacto as string | undefined)?.trim()
    || null

  return {
    ownerEmail,
    ownerName: (owner?.nombre_propietario as string | undefined) ?? "Equipo",
    nombreTaller: (config?.nombre_taller as string | undefined) ?? "TallerCloud",
    alertasStockBajo: Boolean(config?.alertas_stock_bajo),
    reportesCierreCaja: Boolean(config?.reportes_cierre_caja),
  }
}

async function sendLowStockEmail(params: {
  to: string
  ownerName: string
  nombreTaller: string
  products: StockAlertProduct[]
}) {
  if (!resend || params.products.length === 0) return
  const rows = params.products
    .map(
      (p) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${p.nombre}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:center;">${p.stock_actual}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:center;">${p.stock_minimo}</td>
      </tr>
    `
    )
    .join("")

  await resend.emails.send({
    from: "TallerCloud <noreply@tallercloud.net>",
    to: params.to,
    subject: `Alerta de stock bajo - ${params.nombreTaller}`,
    html: `
      <div style="background:#f8fafc;padding:24px;font-family:Arial,sans-serif;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#2563eb;color:#ffffff;padding:18px 24px;font-weight:700;">TallerCloud - Alerta de Inventario</div>
          <div style="padding:20px 24px;color:#334155;">
            <p>Hola ${params.ownerName},</p>
            <p>Los siguientes productos alcanzaron o bajaron del stock minimo:</p>
            <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <thead style="background:#eff6ff;">
                <tr>
                  <th style="text-align:left;padding:10px;font-size:12px;color:#1e3a8a;">Producto</th>
                  <th style="text-align:center;padding:10px;font-size:12px;color:#1e3a8a;">Stock actual</th>
                  <th style="text-align:center;padding:10px;font-size:12px;color:#1e3a8a;">Stock minimo</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `,
  })
}

function escapeHtmlEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Paleta genérica cabeceras HTML email (cierre de caja) */
const EMAIL_HEADER_NAVY = "#0a1f33"
const EMAIL_HEADER_ACCENT = "#185FA5"

/**
 * Nueva plantilla de cierre de caja — detallada, mobile-first, profesional.
 * Muestra desglose completo por método de pago, ventas, cobros y gastos.
 */
function buildCierreEmailHtmlV2(params: {
  ownerName: string
  nombreTaller: string
  numCorte: string
  fechaCierreCorte: string
  corte: CortePrintData
  serverTimestampLabel: string
  responsableLine: string
  detailUrl: string
  emailHeaderLogoUrl: string | null
}) {
  const { ownerName, nombreTaller, numCorte, fechaCierreCorte, corte, serverTimestampLabel, responsableLine, detailUrl, emailHeaderLogoUrl } = params
  const safe = escapeHtmlEmail

  const c = corte
  const montoInicial = c.monto_inicial
  const totalVentasMedios = c.total_efectivo + c.total_tarjeta + c.total_transferencia
  const totalIngresos = totalVentasMedios + c.total_abonos
  const totalEgresos = c.total_gastos
  const efectivoEsperado = c.saldo_final
  const efectivoReal = c.monto_cierre != null && Number.isFinite(c.monto_cierre) ? c.monto_cierre : c.saldo_final
  const diferencia = efectivoReal - efectivoEsperado
  const absDiff = Math.abs(diferencia)
  const cuadrado = absDiff < 0.01

  // Badge de estado
  let badgeHtml = ""
  if (cuadrado) {
    badgeHtml = `<div style="display:inline-block;background:#dcfce7;color:#15803d;font-size:13px;font-weight:700;padding:10px 24px;border-radius:999px;">CUADRADO ✓</div>`
  } else if (diferencia < 0) {
    badgeHtml = `<div style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:15px;font-weight:800;padding:10px 24px;border-radius:999px;">⚠️ FALTANTE: ${formatCurrency(absDiff)}</div>`
  } else {
    badgeHtml = `<div style="display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:13px;font-weight:700;padding:10px 24px;border-radius:999px;">SOBRANTE: ${formatCurrency(diferencia)}</div>`
  }

  const headerLogoBlock =
    emailHeaderLogoUrl && (emailHeaderLogoUrl.startsWith("https://") || emailHeaderLogoUrl.startsWith("http://"))
      ? `<img src="${safe(emailHeaderLogoUrl)}" alt="${safe(nombreTaller)}" width="140" style="display:block;margin:0 auto 12px;border:0;" />`
      : `<p style="margin:0 0 12px;font-family:Georgia,serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">${safe(nombreTaller)}</p>`

  // Helper: fila de tabla simple
  const row = (label: string, value: string, bg = "", bold = false, border = true) => {
    const b = border ? "border-bottom:1px solid #e2e8f0;" : ""
    const f = bold ? "font-weight:700;color:#0f172a;font-size:15px;" : "font-size:14px;color:#475569;"
    const bgStyle = bg ? `background:${bg};` : ""
    return `<tr>
      <td style="padding:12px 14px;${b}${bgStyle}${f}font-family:system-ui,sans-serif;">${safe(label)}</td>
      <td style="padding:12px 14px;text-align:right;${b}${bgStyle}${f}font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${value}</td>
    </tr>`
  }

  // Helper: fila de tabla con 4 columnas (métodos de pago)
  const methodRow = (label: string, ef: number, ta: number, tr: number, bold = false, bg = "") => {
    const f = bold ? "font-weight:700;color:#0f172a;" : "color:#475569;"
    const b = bold ? "" : "border-bottom:1px solid #e2e8f0;"
    const bgStyle = bg ? `background:${bg};` : ""
    return `<tr>
      <td style="padding:10px 12px;${b}${bgStyle}${f}font-size:13px;font-family:system-ui,sans-serif;">${safe(label)}</td>
      <td style="padding:10px 12px;text-align:right;${b}${bgStyle}${f}font-size:13px;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(ef)}</td>
      <td style="padding:10px 12px;text-align:right;${b}${bgStyle}${f}font-size:13px;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(ta)}</td>
      <td style="padding:10px 12px;text-align:right;${b}${bgStyle}${f}font-size:13px;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(tr)}</td>
    </tr>`
  }

  // Tabla de ingresos por método
  const ingresosTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:18px;">
    <thead>
      <tr>
        <th style="padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Concepto</th>
        <th style="padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Efectivo</th>
        <th style="padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Tarjeta</th>
        <th style="padding:10px 12px;background:#f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Transf.</th>
      </tr>
    </thead>
    <tbody>
      ${methodRow("Ventas PDV", c.total_efectivo, c.total_tarjeta, c.total_transferencia)}
      ${methodRow("Cobros reparaciones", c.total_abonos_efectivo, c.total_abonos_tarjeta, c.total_abonos_transferencia)}
      ${methodRow("Total ingresos", c.total_efectivo + c.total_abonos_efectivo, c.total_tarjeta + c.total_abonos_tarjeta, c.total_transferencia + c.total_abonos_transferencia, true, "#f1f5f9")}
    </tbody>
  </table>`

  // Resumen ejecutivo con cards visuales
  const resumenCards = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
    <tr>
      <td width="50%" style="padding:0 6px 0 0;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-family:system-ui,sans-serif;">Fondo inicial</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;">${formatCurrency(montoInicial)}</p>
        </div>
      </td>
      <td width="50%" style="padding:0 0 0 6px;">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:0.08em;font-family:system-ui,sans-serif;">Total ingresos</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#15803d;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;">${formatCurrency(totalIngresos)}</p>
        </div>
      </td>
    </tr>
    <tr><td colspan="2" style="height:10px;"></td></tr>
    <tr>
      <td width="50%" style="padding:0 6px 0 0;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:0.08em;font-family:system-ui,sans-serif;">Total egresos</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#b91c1c;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;">${formatCurrency(totalEgresos)}</p>
        </div>
      </td>
      <td width="50%" style="padding:0 0 0 6px;">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;text-align:center;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;font-family:system-ui,sans-serif;">Efectivo esperado</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#1d4ed8;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;">${formatCurrency(efectivoEsperado)}</p>
        </div>
      </td>
    </tr>
  </table>`

  // Tabla resumen caja
  const resumenTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:18px;">
    <tbody>
      ${row("Fondo inicial", formatCurrency(montoInicial))}
      ${row("Ventas del día", formatCurrency(totalVentasMedios), "#f8fafc")}
      ${row("Cobros reparaciones", formatCurrency(c.total_abonos))}
      ${row("Gastos / egresos", formatCurrency(totalEgresos), "#f8fafc")}
      ${row("Total esperado", formatCurrency(efectivoEsperado), "#f1f5f9", true)}
      ${row("Efectivo contado", formatCurrency(efectivoReal), "#f1f5f9", true, false)}
      <tr>
        <td colspan="2" style="padding:14px;text-align:center;background:#fff;">${badgeHtml}</td>
      </tr>
    </tbody>
  </table>`

  // Tabla de ventas detalladas
  let ventasRows = ""
  if (c.ventas.length > 0) {
    ventasRows = c.ventas.map((v) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;font-family:system-ui,sans-serif;">${safe(v.folio)}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(v.total)}</td>
    </tr>`).join("")
  } else {
    ventasRows = `<tr><td colspan="2" style="padding:10px 12px;font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif;text-align:center;">Sin ventas registradas</td></tr>`
  }

  const ventasTable = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;">Ventas del turno (${c.ventas.length})</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:18px;">
    <thead>
      <tr>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Folio</th>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Total</th>
      </tr>
    </thead>
    <tbody>${ventasRows}</tbody>
  </table>`

  // Tabla de cobros reparaciones
  let cobrosRows = ""
  if (c.cobrosRep.length > 0) {
    cobrosRows = c.cobrosRep.map((r) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;font-family:system-ui,sans-serif;">${safe(r.folio ?? "—")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;font-family:system-ui,sans-serif;">${safe(r.metodo_pago ?? "—")}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(r.monto)}</td>
    </tr>`).join("")
  } else {
    cobrosRows = `<tr><td colspan="3" style="padding:10px 12px;font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif;text-align:center;">Sin cobros de reparaciones</td></tr>`
  }

  const cobrosTable = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;">Cobros reparaciones (${c.cobrosRep.length})</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:18px;">
    <thead>
      <tr>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Folio</th>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Método</th>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Monto</th>
      </tr>
    </thead>
    <tbody>${cobrosRows}</tbody>
  </table>`

  // Tabla de gastos
  let gastosRows = ""
  if (c.listaGastos.length > 0) {
    gastosRows = c.listaGastos.map((g) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569;font-family:system-ui,sans-serif;">${safe(g.descripcion ?? "—")}</td>
      <td style="padding:8px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-size:12px;color:#b91c1c;font-variant-numeric:tabular-nums;font-family:system-ui,sans-serif;">${formatCurrency(g.monto)}</td>
    </tr>`).join("")
  } else {
    gastosRows = `<tr><td colspan="2" style="padding:10px 12px;font-size:12px;color:#94a3b8;font-family:system-ui,sans-serif;text-align:center;">Sin gastos registrados</td></tr>`
  }

  const gastosTable = `<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;">Gastos operativos (${c.listaGastos.length})</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;margin-bottom:18px;">
    <thead>
      <tr>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Concepto</th>
        <th style="padding:8px 12px;background:#f8fafc;font-size:10px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;border-bottom:1px solid #e2e8f0;">Monto</th>
      </tr>
    </thead>
    <tbody>${gastosRows}</tbody>
  </table>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${safe("Cierre de Caja")}</title>
<style type="text/css">
  @media only screen and (max-width: 600px) {
    .email-outer { padding-left: 10px !important; padding-right: 10px !important; }
    .email-card { border-radius: 12px !important; }
    .email-body-pad { padding-left: 16px !important; padding-right: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7;">
    <tr>
      <td class="email-outer" align="center" style="padding:16px 10px;">
        <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-collapse:separate;border-radius:14px;overflow:hidden;background-color:#ffffff;border:1px solid #cbd5e1;box-shadow:0 4px 24px rgba(10,31,51,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:${EMAIL_HEADER_NAVY};padding:24px 18px 20px;text-align:center;">
              ${headerLogoBlock}
              <p style="margin:0 0 14px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:10px;color:rgba(255,255,255,0.7);letter-spacing:0.28em;text-transform:uppercase;">Software para talleres</p>
              <h1 style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:18px;font-weight:700;color:#ffffff;line-height:1.3;">Cierre de Caja</h1>
              <p style="margin:8px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">${safe(nombreTaller)} · Corte #${safe(numCorte)}</p>
            </td>
          </tr>
          <!-- Saludo -->
          <tr>
            <td class="email-body-pad" style="padding:20px 22px 6px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#334155;font-size:15px;line-height:1.5;">
              <p style="margin:0 0 14px;">Hola ${safe(ownerName)},</p>
              <p style="margin:0 0 18px;color:#64748b;font-size:13px;">Cierre registrado el <strong style="color:#334155;">${safe(fechaCierreCorte)}</strong>.</p>
            </td>
          </tr>
          <!-- Resumen cards -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 18px;">
              ${resumenCards}
            </td>
          </tr>
          <!-- Resumen tabla -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 18px;">
              ${resumenTable}
            </td>
          </tr>
          <!-- Ingresos por método -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 4px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-family:system-ui,sans-serif;">Ingresos por método de pago</p>
              ${ingresosTable}
            </td>
          </tr>
          <!-- Ventas -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 4px;">
              ${ventasTable}
            </td>
          </tr>
          <!-- Cobros -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 4px;">
              ${cobrosTable}
            </td>
          </tr>
          <!-- Gastos -->
          <tr>
            <td class="email-body-pad" style="padding:0 22px 18px;">
              ${gastosTable}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 22px 24px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
              <p style="margin:0 0 8px;font-size:11px;color:#94a3b8;font-family:system-ui,sans-serif;line-height:1.5;">${safe(serverTimestampLabel)}</p>
              <p style="margin:0 0 12px;font-size:11px;color:#475569;font-family:system-ui,sans-serif;"><strong style="color:#334155;">Responsable:</strong> ${safe(responsableLine)}</p>
              <p style="margin:0;font-size:11px;font-family:system-ui,sans-serif;">
                <a href="${safe(detailUrl)}" style="color:${EMAIL_HEADER_ACCENT};text-decoration:underline;font-weight:600;">Ver detalle en el panel de ventas →</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** PLANTILLA ANTIGUA — mantenida por compatibilidad, pero ya no se usa en cierres nuevos */
function buildCierreEmailHtml(params: {
  ownerName: string
  nombreTaller: string
  numCorte: string
  fechaCierreCorte: string
  montoInicial: number
  totalVentasDia: number
  totalGastos: number
  totalEsperado: number
  totalReal: number
  diferencia: number
  ticketsVentas: number
  serverTimestampLabel: string
  responsableLine: string
  detailUrl: string
  emailHeaderLogoUrl: string | null
}) {
  const {
    ownerName,
    nombreTaller,
    numCorte,
    fechaCierreCorte,
    montoInicial,
    totalVentasDia,
    totalGastos,
    totalEsperado,
    totalReal,
    diferencia,
    ticketsVentas,
    serverTimestampLabel,
    responsableLine,
    detailUrl,
    emailHeaderLogoUrl,
  } = params

  const safe = escapeHtmlEmail
  const absDiff = Math.abs(diferencia)
  const cuadrado = absDiff < 0.01

  const headerLogoBlock =
    emailHeaderLogoUrl &&
    (emailHeaderLogoUrl.startsWith("https://") || emailHeaderLogoUrl.startsWith("http://"))
      ? `<img src="${safe(emailHeaderLogoUrl)}" alt="${safe(nombreTaller)}" width="160" height="auto" style="display:block;margin:0 auto 14px;max-width:180px;height:auto;border:0;outline:none;" />`
      : `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.02em;line-height:1.25;max-width:420px;margin-left:auto;margin-right:auto;">${safe(nombreTaller)}</p>`

  let highlightRow = ""
  if (cuadrado) {
    highlightRow = `
                <tr>
                  <td colspan="2" style="padding:18px 16px;text-align:center;border-top:1px solid #e2e8f0;">
                    <span style="display:inline-block;background-color:#dcfce7;color:#15803d;font-size:13px;font-weight:700;padding:10px 20px;border-radius:9999px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">Corte Cuadrado</span>
                  </td>
                </tr>`
  } else if (diferencia < 0) {
    highlightRow = `
                <tr>
                  <td colspan="2" style="padding:18px 16px;text-align:center;border-top:1px solid #fecaca;background-color:#fef2f2;">
                    <span style="color:#dc2626;font-size:17px;font-weight:800;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.4;">⚠️ FALTANTE: ${formatCurrency(absDiff)}</span>
                  </td>
                </tr>`
  } else {
    highlightRow = `
                <tr>
                  <td colspan="2" style="padding:18px 16px;text-align:center;border-top:1px solid #bae6fd;background-color:#f0f9ff;">
                    <span style="color:#0369a1;font-size:14px;font-weight:700;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">Sobrante: ${formatCurrency(diferencia)}</span>
                  </td>
                </tr>`
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${safe("Resumen de Cierre de Caja")}</title>
<style type="text/css">
  @media only screen and (max-width: 600px) {
    .email-outer { padding-left: 12px !important; padding-right: 12px !important; }
    .email-card { border-radius: 14px !important; }
    .email-body-pad { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#e8edf3;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e8edf3;">
    <tr>
      <td class="email-outer" align="center" style="padding:20px 12px;">
        <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-collapse:separate;border-radius:16px;overflow:hidden;background-color:#ffffff;border:1px solid #cbd5e1;box-shadow:0 4px 24px rgba(10,31,51,0.08);">
          <tr>
            <td style="background-color:${EMAIL_HEADER_NAVY};padding:28px 20px 24px;text-align:center;">
              ${headerLogoBlock}
              <p style="margin:0 0 18px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:rgba(255,255,255,0.75);letter-spacing:0.28em;text-transform:uppercase;">Software para talleres</p>
              <h1 style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:19px;font-weight:700;color:#ffffff;line-height:1.35;">Resumen de Cierre de Caja</h1>
              <p style="margin:10px 0 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:rgba(255,255,255,0.88);">${safe(nombreTaller)} · Corte #${safe(numCorte)}</p>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" style="padding:24px 28px 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#334155;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 16px;">Hola ${safe(ownerName)},</p>
              <p style="margin:0 0 22px;color:#64748b;font-size:14px;">Cierre registrado el <strong style="color:#334155;">${safe(fechaCierreCorte)}</strong>.</p>
            </td>
          </tr>
          <tr>
            <td class="email-body-pad" style="padding:0 20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background-color:#ffffff;">
                <tbody>
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">Fondo inicial</td>
                    <td style="padding:14px 16px;font-size:14px;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">${formatCurrency(montoInicial)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f8fafc;">Ventas del día</td>
                    <td style="padding:14px 16px;font-size:14px;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f8fafc;">${formatCurrency(totalVentasDia)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">Gastos</td>
                    <td style="padding:14px 16px;font-size:14px;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">${formatCurrency(totalGastos)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f1f5f9;">Total esperado</td>
                    <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f1f5f9;">${formatCurrency(totalEsperado)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f1f5f9;">Total real</td>
                    <td style="padding:14px 16px;font-size:15px;font-weight:700;color:#0f172a;text-align:right;font-variant-numeric:tabular-nums;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background-color:#f1f5f9;">${formatCurrency(totalReal)}</td>
                  </tr>
                  ${highlightRow}
                </tbody>
              </table>
              <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">Tickets de venta del día: ${ticketsVentas}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 28px;border-top:1px solid #e2e8f0;background-color:#f8fafc;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;">${safe(serverTimestampLabel)}</p>
              <p style="margin:0 0 14px;font-size:12px;color:#475569;font-family:system-ui,-apple-system,Segoe UI,sans-serif;"><strong style="color:#334155;">Responsable:</strong> ${safe(responsableLine)}</p>
              <p style="margin:0;font-size:12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
                <a href="${safe(detailUrl)}" style="color:${EMAIL_HEADER_ACCENT};text-decoration:underline;">Ver detalle en el panel de ventas</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendCajaClosureEmail(params: {
  to: string
  ownerName: string
  nombreTaller: string
  corte: CortePrintData
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) return { success: false, error: "Servicio de correo no configurado." }

  const c = params.corte
  const numCorte = c.numero_corte != null ? String(c.numero_corte).padStart(3, "0") : "—"

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "https://tallercloud.net").replace(/\/$/, "")
  const detailUrl = `${appBase}/dashboard/ventas`

  const serverNow = new Date()
  const serverTimestampLabel = `Generado (servidor): ${serverNow.toISOString()} · ${serverNow.toLocaleString("es-MX", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "America/Mazatlan",
  })}`

  const responsableLine =
    process.env.EMAIL_CIERRE_RESPONSABLE_LINE?.trim() || "Sistema"

  const emailHeaderLogoUrl = process.env.EMAIL_HEADER_LOGO_WHITE_URL?.trim() || null

  const html = buildCierreEmailHtmlV2({
    ownerName: params.ownerName,
    nombreTaller: params.nombreTaller,
    numCorte,
    fechaCierreCorte: formatDate(c.fecha_cierre),
    corte: c,
    serverTimestampLabel,
    responsableLine,
    detailUrl,
    emailHeaderLogoUrl,
  })

  // Verificar tamaño del HTML (Resend limita a ~10MB)
  const htmlSizeMB = Buffer.byteLength(html, "utf8") / (1024 * 1024)
  if (htmlSizeMB > 9) {
    console.warn(`[sendCajaClosureEmail] HTML muy grande (${htmlSizeMB.toFixed(2)} MB). Puede ser rechazado por Resend.`)
  }

  const text = `Cierre de caja #${numCorte} — ${params.nombreTaller}\n` +
    `Responsable: ${responsableLine}\n` +
    `Fecha: ${formatDate(c.fecha_cierre)}\n` +
    `Monto de cierre: $${(c.monto_cierre ?? 0).toLocaleString("es-MX")}\n` +
    `Total ventas: $${(c.total_ventas ?? 0).toLocaleString("es-MX")}\n` +
    `Ver detalle: ${detailUrl}`

  try {
    const result = await resend.emails.send({
      from: "TallerCloud <noreply@tallercloud.net>",
      to: params.to,
      subject: `Cierre de caja #${numCorte} — ${params.nombreTaller}`,
      html,
      text,
    })
    if (result.error) {
      console.error("[sendCajaClosureEmail] Resend error:", result.error)
      return { success: false, error: result.error.message || "Error de Resend al enviar el correo." }
    }
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[sendCajaClosureEmail] excepción:", msg)
    return { success: false, error: msg }
  }
}

/**
 * Reenvía el correo de cierre de caja desde el historial.
 */
export async function reenviarCorteEmail(cajaId: string): Promise<{ success: boolean; sentTo?: string; error?: string }> {
  if (!resend) {
    return { success: false, error: "Servicio de correo no configurado (falta RESEND_API_KEY)." }
  }

  const { data: corte, error } = await getCajaConDetalle(cajaId)
  if (error || !corte) {
    return { success: false, error: error ?? "Corte no encontrado." }
  }

  const { supabase } = await createCurrentTenantClient()
  const { ownerEmail, ownerName, nombreTaller } = await getOwnerAlertContext(supabase, (await getCurrentTallerId()))

  if (!ownerEmail) {
    return { success: false, error: "No hay correo del propietario configurado. Revisa Configuración > Mi Cuenta." }
  }

  const sendResult = await sendCajaClosureEmail({
    to: ownerEmail,
    ownerName: ownerName || "Propietario",
    nombreTaller: nombreTaller || "TallerCloud",
    corte,
  })

  if (!sendResult.success) {
    console.error("[reenviarCorteEmail] fallo:", sendResult.error)
    return { success: false, error: sendResult.error }
  }
  return { success: true, sentTo: ownerEmail }
}

export interface CrearVentaInput {
  caja_id: string | null
  cliente_nombre?: string
  cliente_id?: string        // UUID del cliente si se seleccionó de la DB
  cliente_telefono?: string  // teléfono normalizado para WhatsApp
  total: number
  descuento: number
  metodo_pago: "efectivo" | "tarjeta" | "transferencia" | "mixto"
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  cambio: number
  items: DetalleVentaInput[]
}

export interface VentaCreada {
  id: string
  folio: string
  total: number
  descuento: number
  metodo_pago: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  cambio: number
  created_at: string
  items: DetalleVentaInput[]
  cliente_nombre?: string
  cliente_telefono?: string  // devuelto para que SuccessModal genere el link
}

// ─── getCajaAbierta ──────────────────────────────────────────────────────────

export async function getCajaAbierta(): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const { supabase, tallerId } = await createCurrentTenantClient()
    const guard = await requireOpenCajaForFinancialOperation({ supabase, tallerId })
    if (!guard.ok) {
      if (guard.error.includes("No hay caja abierta")) return { caja: null, error: null }
      return { caja: null, error: guard.error }
    }

    const { data, error } = await supabase
      .from("caja")
      .select("*")
      .eq("id", guard.caja.id)
      .eq("taller_id", tallerId)
      .maybeSingle()

    if (error) return { caja: null, error: error.message }
    return { caja: (data as CajaRow | null) ?? null, error: null }
  } catch (error) {
    if (!shouldFallbackToPrisma(error)) throw error
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
      tallerId
    )
    return { caja: normalizeCajaRow(rows[0]), error: null }
  }
}

// ─── requireCajaAbierta ───────────────────────────────────────────────────────

export async function requireCajaAbierta(): Promise<{ caja: CajaRow; error: null } | { caja: null; error: string }> {
  const { caja, error } = await getCajaAbierta()
  if (error) return { caja: null, error: `Error al verificar caja: ${error}` }
  if (!caja) return { caja: null, error: "No hay una caja abierta. Abre la caja antes de realizar esta operación." }
  return { caja, error: null }
}

// ─── abrirCaja ───────────────────────────────────────────────────────────────

export async function abrirCaja(
  montoInicial: number
): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const { supabase, tallerId } = await createCurrentTenantClient()

    // Compute next numero_corte for this taller (best effort).
    const { count } = await supabase
      .from("caja")
      .select("id", { count: "exact", head: true })
      .eq("taller_id", tallerId)

    const numeroCorte = (count ?? 0) + 1

    const payloadBase = {
      taller_id: tallerId,
      monto_inicial: montoInicial,
      estado: "abierta",
    }

    // Attempt with numero_corte first.
    const withNumero = await supabase
      .from("caja")
      .insert({
        ...payloadBase,
        numero_corte: numeroCorte,
      })
      .select()
      .single()

    if (!withNumero.error) {
      return { caja: withNumero.data as CajaRow, error: null }
    }

    // Backward-compatible fallback when DB still lacks numero_corte.
    const needsFallback =
      withNumero.error.code === "42703" ||
      withNumero.error.message?.toLowerCase().includes("numero_corte")

    if (needsFallback) {
      const fallback = await supabase
        .from("caja")
        .insert(payloadBase)
        .select()
        .single()

      if (fallback.error) {
        return { caja: null, error: fallback.error.message }
      }
      return { caja: fallback.data as CajaRow, error: null }
    }

    if (
      withNumero.error.code === "42P01" ||
      withNumero.error.message?.toLowerCase().includes("relation") ||
      withNumero.error.message?.toLowerCase().includes("does not exist")
    ) {
      return {
        caja: null,
        error:
          "La tabla de caja no existe en la base de datos activa. Aplica las migraciones pendientes antes de abrir caja.",
      }
    }

    return { caja: null, error: withNumero.error.message }
  } catch (e) {
    if (shouldFallbackToPrisma(e)) {
      try {
        const prisma = getPrismaClient()
        const tallerId = await getCurrentTallerId()
        const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
          "SELECT COUNT(*)::int AS total FROM caja WHERE taller_id = $1",
          tallerId
        )
        const numeroCorte = (countRows[0]?.total ?? 0) + 1

        try {
          const inserted = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `INSERT INTO caja (taller_id, monto_inicial, estado, numero_corte)
             VALUES ($1, $2, 'abierta', $3)
             RETURNING *`,
            tallerId,
            montoInicial,
            numeroCorte
          )
          return { caja: normalizeCajaRow(inserted[0]), error: null }
        } catch (insertErr) {
          const msg = insertErr instanceof Error ? insertErr.message.toLowerCase() : String(insertErr).toLowerCase()
          if (msg.includes("numero_corte") || msg.includes("42703")) {
            const inserted = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
              `INSERT INTO caja (taller_id, monto_inicial, estado)
               VALUES ($1, $2, 'abierta')
               RETURNING *`,
              tallerId,
              montoInicial
            )
            return { caja: normalizeCajaRow(inserted[0]), error: null }
          }
          if (msg.includes("relation") || msg.includes("does not exist") || msg.includes("42p01")) {
            return {
              caja: null,
              error:
                "La tabla de caja no existe en la base de datos activa. Aplica las migraciones pendientes antes de abrir caja.",
            }
          }
          return { caja: null, error: insertErr instanceof Error ? insertErr.message : String(insertErr) }
        }
      } catch (fallbackErr) {
        console.error("[abrirCaja] prisma fallback fatal:", fallbackErr)
        return { caja: null, error: "Error al abrir caja. Revisa conexión y estructura de base de datos." }
      }
    }

    console.error("[abrirCaja] fatal:", e)
    return { caja: null, error: "Error al abrir caja. Revisa conexión y estructura de base de datos." }
  }
}

// ─── cerrarCaja ──────────────────────────────────────────────────────────────

export async function cerrarCaja(
  cajaId: string,
  montoCierre: number
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // Obtener fecha de apertura para validar visitas pendientes
  const { data: cajaRow, error: cajaErr } = await supabase
    .from("caja")
    .select("fecha_apertura")
    .eq("id", cajaId)
    .eq("taller_id", tallerId)
    .single()

  if (cajaErr || !cajaRow) {
    return { error: cajaErr?.message || "No se encontró la caja" }
  }

  const { puedeCerrar, visitasPendientes } = await verificarVisitasPendientesCierre(
    tallerId,
    cajaRow.fecha_apertura
  )

  if (!puedeCerrar) {
    return {
      error: `No puedes cerrar caja: hay ${visitasPendientes} visita${visitasPendientes === 1 ? "" : "s"} pendiente${visitasPendientes === 1 ? "" : "s"} sin registrar. Ve a Bitácora de Visitas para atenderla${visitasPendientes === 1 ? "" : "s"}.`,
    }
  }

  const { error } = await supabase
    .from("caja")
    .update({
      estado: "cerrada",
      monto_cierre: montoCierre,
      fecha_cierre: new Date().toISOString(),
    })
    .eq("id", cajaId)
    .eq("taller_id", tallerId)

  if (error) return { error: error.message }

  try {
    const ctx = await getOwnerAlertContext(supabase, tallerId)
    if (!ctx.reportesCierreCaja) {
      // reportesCierreCaja desactivado; no se envía correo
    } else if (!ctx.ownerEmail) {
      console.warn("[cerrarCaja] no hay correo configurado. No se envía reporte.")
    } else {
      const { data: corteData, error: corteErr } = await getCajaConDetalle(cajaId)
      if (corteErr || !corteData) {
        console.error("[cerrarCaja] error obteniendo detalle del corte:", corteErr)
      } else {
        const sendResult = await sendCajaClosureEmail({
          to: ctx.ownerEmail,
          ownerName: ctx.ownerName,
          nombreTaller: ctx.nombreTaller,
          corte: corteData,
        })
        if (sendResult.success) {
          // reporte enviado exitosamente
        } else {
          console.error("[cerrarCaja] fallo al enviar reporte:", sendResult.error)
        }
      }
    }
  } catch (mailError) {
    console.error("[cerrarCaja] error enviando reporte de cierre:", mailError)
  }

  return { error: null }
}

// ─── getProductosDisponibles ─────────────────────────────────────────────────

export async function getProductosDisponibles(): Promise<{
  data: ProductoDisponible[]
  error: string | null
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  // PERF: limit 300 previene queries ilimitadas en inventarios grandes.
  // Inventarios >300 SKUs activos deben implementar búsqueda server-side.
  const { data, error } = await supabase
    .from("productos")
    .select("id, taller_id, nombre, sku, categoria, precio_venta, costo, stock_actual, imagen_url, es_equipo, imei_serie, color, capacidad, condicion, marca, modelo, procesador, ram, almacenamiento")
    .eq("taller_id", tallerId)
    .gt("stock_actual", 0)
    .order("nombre", { ascending: true })
    .limit(300)

  if (error) {
    console.error("[getProductosDisponibles] Supabase error:", error.message)
    return { data: [], error: error.message }
  }

  // Map to ProductoDisponible — handle tables that may not yet have device columns
  const mapped: ProductoDisponible[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    taller_id: row.taller_id as string,
    nombre: row.nombre as string,
    sku: (row.sku as string | null) ?? null,
    categoria: (row.categoria as string | null) ?? null,
    precio_venta: Number(row.precio_venta ?? 0),
    costo: Number(row.costo ?? 0),
    stock_actual: Number(row.stock_actual ?? 0),
    imagen_url: getInventoryPublicUrl((row.imagen_url as string | null) ?? null),
    es_equipo: Boolean(row.es_equipo ?? false),
    imei_serie: (row.imei_serie as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    capacidad: (row.capacidad as string | null) ?? null,
    condicion: (row.condicion as string | null) ?? null,
    marca: (row.marca as string | null) ?? null,
    modelo: (row.modelo as string | null) ?? null,
    procesador: (row.procesador as string | null) ?? null,
    ram: (row.ram as string | null) ?? null,
    almacenamiento: (row.almacenamiento as string | null) ?? null,
  }))

  return { data: mapped, error: null }
}

// ─── crearVenta ──────────────────────────────────────────────────────────────

export async function crearVenta(
  input: CrearVentaInput
): Promise<{ venta: VentaCreada | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const cajaCheck = await requireCajaAbierta()
  if (cajaCheck.error || !cajaCheck.caja) {
    return { venta: null, error: cajaCheck.error ?? "No hay una caja abierta." }
  }

  if (!input.items || input.items.length === 0) {
    return { venta: null, error: "El carrito está vacío" }
  }

  if (input.cliente_id) {
    const { data: clienteCheck } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", input.cliente_id)
      .eq("taller_id", tallerId)
      .single()
    if (!clienteCheck) {
      return { venta: null, error: "Cliente no válido para este taller." }
    }
  }

  if (input.caja_id) {
    const { data: cajaCheck } = await supabase
      .from("caja")
      .select("id")
      .eq("id", input.caja_id)
      .eq("taller_id", tallerId)
      .single()
    if (!cajaCheck) {
      return { venta: null, error: "Caja no válida para este taller." }
    }
  }

  // Generate atomic sequential folio via PostgreSQL function
  const { data: folioData, error: folioError } = await supabase.rpc("get_next_venta_folio", {
    p_taller_id: tallerId,
  })

  if (folioError || !folioData) {
    console.error("[crearVenta] Error generating folio:", folioError)
    return { venta: null, error: "Error al generar el folio de venta. Intenta de nuevo." }
  }

  const folio = folioData as string

  // Resolve actor name for audit trail
  const actorNombre = await getCurrentActorDisplayName()

  // Insert venta header
  const { data: ventaData, error: ventaError } = await supabase
    .from("ventas")
    .insert({
      taller_id: tallerId,
      caja_id: input.caja_id || null,
      folio,
      cliente_nombre: input.cliente_nombre || null,
      cliente_id: input.cliente_id || null,
      cliente_telefono: input.cliente_telefono || null,
      total: input.total,
      descuento: input.descuento ?? 0,
      metodo_pago: input.metodo_pago,
      monto_efectivo: input.monto_efectivo,
      monto_tarjeta: input.monto_tarjeta,
      monto_transferencia: input.monto_transferencia,
      cambio: input.cambio,
      vendedor_nombre: actorNombre,
    })
    .select()
    .single()

  if (ventaError) return { venta: null, error: ventaError.message }

  const ventaId = ventaData.id as string

  // Insert line items
  const detalles = input.items.map((item) => ({
    venta_id: ventaId,
    producto_id: item.producto_id || null,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    costo_unitario: item.costo_unitario,
    subtotal: item.precio_unitario * item.cantidad,
    es_especial: item.es_especial,
    imei_serie: item.imei_serie || null,
    color: item.color || null,
    condicion: item.condicion || null,
    marca: item.marca || null,
    modelo: item.modelo || null,
    categoria: item.categoria || null,
    procesador: item.procesador || null,
    ram: item.ram || null,
    almacenamiento: item.almacenamiento || null,
  }))

  const { error: detalleError } = await supabase.from("detalle_ventas").insert(detalles)
  if (detalleError) {
    // Rollback: eliminar la venta huérfana antes de retornar el error
    await supabase.from("ventas").delete().eq("id", ventaId).eq("taller_id", tallerId)
    return { venta: null, error: detalleError.message }
  }

  // Decrement stock — 1 round-trip via RPC batch_decrement_stock
  const stockItems = input.items
    .filter((item) => item.producto_id && !item.es_especial)
    .map((item) => ({ producto_id: item.producto_id, taller_id: tallerId, cantidad: item.cantidad }))

  if (stockItems.length > 0) {
    const { error: stockError } = await supabase.rpc("batch_decrement_stock", { items: stockItems })
    if (stockError) console.error("[crearVenta] stock decrement error:", stockError)
    if (!stockError) {
      try {
        const productoIds = stockItems.map((i) => i.producto_id as string)
        const { data: lowStockData } = await supabase
          .from("productos")
          .select("id, nombre, stock_actual, stock_minimo")
          .in("id", productoIds)

        const lowStock = ((lowStockData ?? []) as StockAlertProduct[]).filter(
          (p) => Number(p.stock_actual) <= Number(p.stock_minimo)
        )
        if (lowStock.length > 0) {
          const ctx = await getOwnerAlertContext(supabase, tallerId)
          if (ctx.alertasStockBajo && ctx.ownerEmail) {
            await sendLowStockEmail({
              to: ctx.ownerEmail,
              ownerName: ctx.ownerName,
              nombreTaller: ctx.nombreTaller,
              products: lowStock,
            })
          }
        }
      } catch (mailError) {
        console.error("[crearVenta] error enviando alerta de stock:", mailError)
      }
    }
  }

  // Update caja running totals
  if (input.caja_id) {
    const { data: cajaData } = await supabase
      .from("caja")
      .select("total_efectivo, total_tarjeta, total_transferencia, total_ventas")
      .eq("id", input.caja_id)
      .single()

    if (cajaData) {
      const c = cajaData as {
        total_efectivo: number
        total_tarjeta: number
        total_transferencia: number
        total_ventas: number
      }
      await supabase
        .from("caja")
        .update({
          total_efectivo: Math.round((c.total_efectivo + input.monto_efectivo - input.cambio) * 100) / 100,
          total_tarjeta: c.total_tarjeta + input.monto_tarjeta,
          total_transferencia: c.total_transferencia + input.monto_transferencia,
          total_ventas: c.total_ventas + 1,
        })
        .eq("id", input.caja_id)
    }

    // Register movement in movimientos_caja (best-effort — table may not exist until migration runs)
    await supabase.from("movimientos_caja").insert({
      taller_id: tallerId,
      caja_id: input.caja_id,
      tipo: "venta_pdv",
      referencia_id: ventaId,
      descripcion: `Venta ${folio}${input.cliente_nombre ? ` — ${input.cliente_nombre}` : ""}`,
      monto: input.total,
      metodo_pago: input.metodo_pago,
      fecha: ventaData.created_at as string,
    })
  }

  revalidatePath("/dashboard/historial-ventas")

  return {
    venta: {
      id: ventaId,
      folio,
      total: input.total,
      descuento: input.descuento ?? 0,
      metodo_pago: input.metodo_pago,
      monto_efectivo: input.monto_efectivo ?? 0,
      monto_tarjeta: input.monto_tarjeta ?? 0,
      monto_transferencia: input.monto_transferencia ?? 0,
      cambio: input.cambio,
      created_at: ventaData.created_at as string,
      items: input.items,
      cliente_nombre: input.cliente_nombre,
      cliente_telefono: input.cliente_telefono,
    },
    error: null,
  }
}

// ─── Types for historial de caja ─────────────────────────────────────────────

export interface HistorialCajaItem {
  id: string
  numero_corte: number | null
  fecha_apertura: string
  fecha_cierre: string | null
  estado: "abierta" | "cerrada"
  monto_inicial: number
  monto_cierre: number | null
  nota_cierre: string | null
  total_efectivo: number
  total_tarjeta: number
  total_transferencia: number
  total_ventas: number
  saldo_final: number
}

export interface VentaDelCorte {
  id: string
  folio: string
  cliente_nombre: string | null
  total: number
  metodo_pago: string
  monto_efectivo: number
  monto_tarjeta: number
  monto_transferencia: number
  created_at: string
}

export interface MovimientoDelCorte {
  id: string
  tipo: string
  descripcion: string | null
  monto: number
  metodo_pago: string | null
  fecha: string
}

export interface DetalleCajaData {
  caja: HistorialCajaItem
  ventas: VentaDelCorte[]
  movimientos: MovimientoDelCorte[]
}

// ─── getHistorialCaja ─────────────────────────────────────────────────────────

export async function getHistorialCaja(
  page = 0,
  pageSize = 30
): Promise<{
  data: HistorialCajaItem[]
  error: string | null
  total: number
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from("caja")
    .select("*", { count: "exact" })
    .eq("taller_id", tallerId)
    .eq("estado", "cerrada")
    .order("fecha_apertura", { ascending: false })
    .range(from, to)

  if (error) {
    console.error("[getHistorialCaja] error:", error.message)
    return { data: [], error: error.message, total: 0 }
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const cajaIds = rows.map((r) => r.id as string)

  // Pre-calculate saldo_final for each caja using the same logic as getCajaConDetalle
  let abonosByCaja: Record<string, number> = {}
  let gastosByCaja: Record<string, number> = {}

  if (cajaIds.length > 0) {
    // Abonos en efectivo por caja_id
    const { data: abonosRows } = await supabase
      .from("movimientos_caja")
      .select("caja_id, monto, metodo_pago")
      .eq("taller_id", tallerId)
      .in("caja_id", cajaIds)
      .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"])

    abonosByCaja = (abonosRows ?? []).reduce<Record<string, number>>((acc, row: Record<string, unknown>) => {
      const cid = row.caja_id as string
      const metodo = ((row.metodo_pago as string) ?? "").toLowerCase()
      if (metodo === "efectivo") {
        acc[cid] = (acc[cid] ?? 0) + Number(row.monto ?? 0)
      }
      return acc
    }, {})

    // Gastos de ticket (movimientos_caja tipo gasto/gasto_reparacion con monto negativo)
    const { data: gastosTicketRows } = await supabase
      .from("movimientos_caja")
      .select("caja_id, monto")
      .eq("taller_id", tallerId)
      .in("caja_id", cajaIds)
      .in("tipo", ["gasto_reparacion", "gasto"])
      .lt("monto", 0)

    gastosByCaja = (gastosTicketRows ?? []).reduce<Record<string, number>>((acc, row: Record<string, unknown>) => {
      const cid = row.caja_id as string
      acc[cid] = (acc[cid] ?? 0) + Math.abs(Number(row.monto ?? 0))
      return acc
    }, {})

    // Gastos de bitácora (sin caja_id; hay que mapear por rango de fechas)
    const minApertura = rows.length > 0
      ? rows.reduce((min, r) => (r.fecha_apertura as string) < min ? (r.fecha_apertura as string) : min, rows[0].fecha_apertura as string)
      : new Date().toISOString()
    const maxCierre = rows.length > 0
      ? rows.reduce((max, r) => {
          const fc = (r.fecha_cierre as string) ?? new Date().toISOString()
          return fc > max ? fc : max
        }, (rows[0].fecha_cierre as string) ?? new Date().toISOString())
      : new Date().toISOString()

    const { data: gastosBitacoraRows } = await supabase
      .from("bitacora_gastos")
      .select("created_at, monto")
      .eq("taller_id", tallerId)
      .gte("created_at", minApertura)
      .lte("created_at", maxCierre)

    // Asignar cada gasto de bitácora a la caja cuyo rango de fechas lo contenga
    const gastosBitacora = (gastosBitacoraRows ?? []) as Record<string, unknown>[]
    for (const g of gastosBitacora) {
      const gFecha = g.created_at as string
      const gMonto = Math.abs(Number(g.monto ?? 0))
      const cajaMatch = rows.find((r) => {
        const apertura = r.fecha_apertura as string
        const cierre = (r.fecha_cierre as string) ?? new Date().toISOString()
        return gFecha >= apertura && gFecha <= cierre
      })
      if (cajaMatch) {
        const cid = cajaMatch.id as string
        gastosByCaja[cid] = (gastosByCaja[cid] ?? 0) + gMonto
      }
    }
  }

  const mapped: HistorialCajaItem[] = rows.map((row) => {
    const id = row.id as string
    const montoInicial = Number(row.monto_inicial ?? 0)
    const totalEfectivo = Number(row.total_efectivo ?? 0)
    const totalAbonosEfectivo = abonosByCaja[id] ?? 0
    const totalGastos = gastosByCaja[id] ?? 0
    const saldoFinal = montoInicial + totalEfectivo + totalAbonosEfectivo - totalGastos

    return {
      id,
      numero_corte: row.numero_corte != null ? Number(row.numero_corte) : null,
      fecha_apertura: row.fecha_apertura as string,
      fecha_cierre: (row.fecha_cierre as string | null) ?? null,
      estado: row.estado as "abierta" | "cerrada",
      monto_inicial: montoInicial,
      monto_cierre: row.monto_cierre != null ? Number(row.monto_cierre) : null,
      nota_cierre: (row.nota_cierre as string | null) ?? null,
      total_efectivo: totalEfectivo,
      total_tarjeta: Number(row.total_tarjeta ?? 0),
      total_transferencia: Number(row.total_transferencia ?? 0),
      total_ventas: Number(row.total_ventas ?? 0),
      saldo_final: saldoFinal,
    }
  })

  return { data: mapped, error: null, total: count ?? 0 }
}

// ─── getDetalleCaja ───────────────────────────────────────────────────────────

export async function getDetalleCaja(cajaId: string): Promise<{
  data: DetalleCajaData | null
  error: string | null
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: cajaData, error: cajaError } = await supabase
    .from("caja")
    .select("*")
    .eq("id", cajaId)
    .eq("taller_id", tallerId)
    .single()

  if (cajaError || !cajaData) {
    return { data: null, error: cajaError?.message ?? "Caja no encontrada" }
  }

  const caja = cajaData as Record<string, unknown>

  const { data: ventasData } = await supabase
    .from("ventas")
    .select(
      "id, folio, cliente_nombre, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, created_at"
    )
    .eq("caja_id", cajaId)
    .eq("taller_id", tallerId)
    .eq("estado", "activa")
    .order("created_at", { ascending: true })

  const { data: movimientosData } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, descripcion, monto, metodo_pago, fecha")
    .eq("caja_id", cajaId)
    .eq("taller_id", tallerId)
    .order("fecha", { ascending: true })

  // Also fetch bitacora_gastos within the caja's date range (they have no caja_id)
  const fechaApertura = caja.fecha_apertura as string
  const fechaCierre = (caja.fecha_cierre as string | null) ?? new Date().toISOString()
  const { data: gastosData } = await supabase
    .from("bitacora_gastos")
    .select("id, concepto, categoria, monto, metodo_pago, fecha, created_at")
    .eq("taller_id", tallerId)
    .gte("created_at", fechaApertura)
    .lte("created_at", fechaCierre)

  const ventas: VentaDelCorte[] = (ventasData ?? []).map((v: Record<string, unknown>) => ({
    id: v.id as string,
    folio: v.folio as string,
    cliente_nombre: (v.cliente_nombre as string | null) ?? null,
    total: Number(v.total ?? 0),
    metodo_pago: v.metodo_pago as string,
    monto_efectivo: Number(v.monto_efectivo ?? 0),
    monto_tarjeta: Number(v.monto_tarjeta ?? 0),
    monto_transferencia: Number(v.monto_transferencia ?? 0),
    created_at: v.created_at as string,
  }))

  const movimientosCaja: MovimientoDelCorte[] = (movimientosData ?? []).map(
    (m: Record<string, unknown>) => ({
      id: m.id as string,
      tipo: m.tipo as string,
      descripcion: (m.descripcion as string | null) ?? null,
      monto: Number(m.monto ?? 0),
      metodo_pago: (m.metodo_pago as string | null) ?? null,
      fecha: m.fecha as string,
    })
  )

  const gastosMovimientos: MovimientoDelCorte[] = (gastosData ?? []).map(
    (g: Record<string, unknown>) => ({
      id: g.id as string,
      tipo: "gasto",
      descripcion: (g.concepto as string | null) ?? null,
      monto: -Math.abs(Number(g.monto ?? 0)),
      metodo_pago: (g.metodo_pago as string | null) ?? null,
      fecha: (g.fecha as string) ?? (g.created_at as string),
    })
  )

  const movimientos = [...movimientosCaja, ...gastosMovimientos]
    .sort((a, b) => (a.fecha > b.fecha ? 1 : -1))

  const totalAbonosEfectivo = (movimientosData ?? []).reduce((sum, m: Record<string, unknown>) => {
    if (["anticipo_reparacion", "liquidacion_reparacion"].includes(m.tipo as string) && m.metodo_pago === "efectivo") {
      return sum + Number(m.monto ?? 0)
    }
    return sum
  }, 0)

  const totalGastos = (gastosData ?? []).reduce((sum, g: Record<string, unknown>) => sum + Number(g.monto ?? 0), 0)
  const saldoFinal = Number(caja.monto_inicial ?? 0) + Number(caja.total_efectivo ?? 0) + totalAbonosEfectivo - totalGastos

  return {
    data: {
      caja: {
        id: caja.id as string,
        numero_corte: caja.numero_corte != null ? Number(caja.numero_corte) : null,
        fecha_apertura: caja.fecha_apertura as string,
        fecha_cierre: (caja.fecha_cierre as string | null) ?? null,
        estado: caja.estado as "abierta" | "cerrada",
        monto_inicial: Number(caja.monto_inicial ?? 0),
        monto_cierre: caja.monto_cierre != null ? Number(caja.monto_cierre) : null,
        nota_cierre: (caja.nota_cierre as string | null) ?? null,
        total_efectivo: Number(caja.total_efectivo ?? 0),
        total_tarjeta: Number(caja.total_tarjeta ?? 0),
        total_transferencia: Number(caja.total_transferencia ?? 0),
        total_ventas: Number(caja.total_ventas ?? 0),
        saldo_final: saldoFinal,
      },
      ventas,
      movimientos,
    },
    error: null,
  }
}

// ─── Fetch abono por movimiento_caja.id (para /print-abono/[id]) ──────────────

export interface AbonoPrintData {
  movimientoId: string
  folio: string
  clienteNombre: string
  clienteTelefono: string
  dispositivo: string
  metodoPago: string
  monto: number
  totalAbonado: number
  presupuesto: number
  saldoRestante: number
  fecha: string
}

export async function getAbonoById(
  movimientoId: string
): Promise<{ data: AbonoPrintData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: mov, error } = await supabase
    .from("movimientos_caja")
    .select("id, monto, metodo_pago, fecha, referencia_id, taller_id")
    .eq("id", movimientoId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !mov) return { data: null, error: "Movimiento no encontrado." }

  const m = mov as Record<string, unknown>
  const { data: rep } = await supabase
    .from("reparaciones")
    .select("folio, cliente_nombre, cliente_telefono, marca, modelo, tipo_equipo, precio_estimado, anticipo")
    .eq("id", m.referencia_id as string)
    .eq("taller_id", tallerId)
    .single()

  if (!rep) return { data: null, error: "Reparación no encontrada." }
  const r = rep as Record<string, unknown>

  const presupuesto = Number(r.precio_estimado ?? 0)
  const totalAbonado = Number(r.anticipo ?? 0)

  return {
    data: {
      movimientoId: m.id as string,
      folio: r.folio as string,
      clienteNombre: r.cliente_nombre as string,
      clienteTelefono: r.cliente_telefono as string,
      dispositivo: `${(r.tipo_equipo as string | null) ?? ""} ${r.marca as string} ${r.modelo as string}`.trim(),
      metodoPago: m.metodo_pago as string,
      monto: Number(m.monto),
      totalAbonado,
      presupuesto,
      saldoRestante: Math.max(0, presupuesto - totalAbonado),
      fecha: m.fecha as string,
    },
    error: null,
  }
}

// ─── Fetch corte de caja con totales completos (para /print-corte/[id]) ────────

export async function getCajaConDetalle(
  cajaId: string
): Promise<{ data: CortePrintData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: caja, error } = await supabase
    .from("caja")
    .select("*")
    .eq("id", cajaId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !caja) return { data: null, error: "Corte no encontrado." }
  const c = caja as Record<string, unknown>

  // total_abonos + cobros line items for the ticket
  const { data: abonosRows } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, descripcion, folio, monto, metodo_pago")
    .eq("caja_id", cajaId)
    .eq("taller_id", tallerId)
    .in("tipo", ["anticipo_reparacion", "liquidacion_reparacion"])
    .order("fecha", { ascending: true })

  const cobrosRep: CorteCobro[] = (abonosRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id:          r.id as string,
      tipo:        r.tipo as string,
      descripcion: (r.descripcion as string | null) ?? null,
      folio:       (r.folio as string | null) ?? null,
      monto:       Number(r.monto ?? 0),
      metodo_pago: (r.metodo_pago as string | null) ?? null,
    }
  })

  const totalAbonos = cobrosRep.reduce((sum, r) => sum + r.monto, 0)
  const totalAbonosEfectivo = cobrosRep
    .filter((r) => (r.metodo_pago ?? "").toLowerCase() === "efectivo")
    .reduce((sum, r) => sum + r.monto, 0)
  const totalAbonosTarjeta = cobrosRep
    .filter((r) => (r.metodo_pago ?? "").toLowerCase() === "tarjeta")
    .reduce((sum, r) => sum + r.monto, 0)
  const totalAbonosTransferencia = cobrosRep
    .filter((r) => (r.metodo_pago ?? "").toLowerCase() === "transferencia")
    .reduce((sum, r) => sum + r.monto, 0)

  // listaGastos + total_gastos: line items de bitacora_gastos del mismo turno
  const fechaApertura = c.fecha_apertura as string
  const { data: gastosRows } = await supabase
    .from("bitacora_gastos")
    .select("id, concepto, monto")
    .eq("taller_id", tallerId)
    .gte("created_at", fechaApertura)
    .lte("created_at", (c.fecha_cierre as string) ?? new Date().toISOString())
    .order("created_at", { ascending: true })

  const fechaCierreIso = (c.fecha_cierre as string) ?? new Date().toISOString()

  const listaGastosBitacora: CorteGasto[] = (gastosRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id:          r.id as string,
      descripcion: (r.concepto as string | null) ?? null,
      monto:       Number(r.monto ?? 0),
    }
  })

  // Gastos de ticket (reparacion_gastos) se registran en movimientos_caja (tipo gasto_reparacion / gasto legado).
  const { data: gastosTicketMovs } = await supabase
    .from("movimientos_caja")
    .select("id, descripcion, monto, fecha")
    .eq("caja_id", cajaId)
    .eq("taller_id", tallerId)
    .in("tipo", ["gasto_reparacion", "gasto"])
    .lt("monto", 0)
    .gte("fecha", fechaApertura)
    .lte("fecha", fechaCierreIso)
    .order("fecha", { ascending: true })

  const listaGastosTicket: CorteGasto[] = (gastosTicketMovs ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id:          r.id as string,
      descripcion: (r.descripcion as string | null) ?? null,
      monto:       Math.abs(Number(r.monto ?? 0)),
    }
  })

  const totalGastosBitacora = listaGastosBitacora.reduce((sum, g) => sum + g.monto, 0)
  const totalGastosTicket = listaGastosTicket.reduce((sum, g) => sum + g.monto, 0)
  const totalGastos = totalGastosBitacora + totalGastosTicket
  const listaGastos = [...listaGastosBitacora, ...listaGastosTicket]

  // Obtener ventas del turno
  const { data: ventasRows } = await supabase
    .from("ventas")
    .select("id, folio, created_at, total, metodo_pago")
    .eq("taller_id", tallerId)
    .eq("caja_id", cajaId)
    .gte("created_at", fechaApertura)
    .lte("created_at", fechaCierreIso)
    .order("created_at", { ascending: true })

  // Obtener detalle de ventas para descripciones
  const ventaIds = (ventasRows ?? []).map((v) => (v as Record<string, unknown>).id as string)
  const { data: detalleRows } = ventaIds.length > 0
    ? await supabase
        .from("detalle_ventas")
        .select("venta_id, descripcion")
        .in("venta_id", ventaIds)
        .order("created_at", { ascending: true })
    : { data: [] }

  const detallePorVenta = new Map<string, string>()
  ;(detalleRows ?? []).forEach((row) => {
    const r = row as Record<string, unknown>
    const vid = r.venta_id as string
    if (!detallePorVenta.has(vid)) {
      detallePorVenta.set(vid, (r.descripcion as string) ?? "")
    }
  })

  const listaVentas: CorteVentaLinea[] = (ventasRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    const vid = r.id as string
    return {
      id: vid,
      folio: (r.folio as string | null) ?? "—",
      created_at: r.created_at as string,
      total: Number(r.total ?? 0),
      metodo_pago: (r.metodo_pago as string | null) ?? undefined,
      descripcion: detallePorVenta.get(vid) || undefined,
    }
  })

  const totalVentasPdv = listaVentas.reduce((sum, v) => sum + v.total, 0)

  const montoInicial   = Number(c.monto_inicial ?? 0)
  const totalVentas    = Number(c.total_ventas ?? 0)
  // saldoFinal: efectivo PDV + efectivo de cobros de reparaciones + fondo - gastos.
  const totalEfectivo  = Number(c.total_efectivo ?? 0)
  const saldoFinal     = montoInicial + totalEfectivo + totalAbonosEfectivo - totalGastos
  const rawCierre = c.monto_cierre
  const montoCierre =
    rawCierre != null && rawCierre !== "" && !Number.isNaN(Number(rawCierre))
      ? Number(rawCierre)
      : null

  return {
    data: {
      numero_corte:         Number(c.numero_corte ?? 0),
      fecha_apertura:       c.fecha_apertura as string,
      fecha_cierre:         (c.fecha_cierre as string) ?? new Date().toISOString(),
      monto_inicial:        montoInicial,
      total_ventas:         totalVentas,
      total_efectivo:           totalEfectivo,
      total_tarjeta:            Number(c.total_tarjeta ?? 0),
      total_transferencia:      Number(c.total_transferencia ?? 0),
      total_abonos:             totalAbonos,
      total_abonos_efectivo:    totalAbonosEfectivo,
      total_abonos_tarjeta:     totalAbonosTarjeta,
      total_abonos_transferencia: totalAbonosTransferencia,
      total_gastos:             totalGastos,
      saldo_final:              saldoFinal,
      monto_cierre:             montoCierre,
      nota_cierre:              (c.nota_cierre as string | null) ?? undefined,
      cobrosRep,
      listaGastos,
      ventas: listaVentas,
      totalVentasPdv,
    },
    error: null,
  }
}

// ─── Label data for /print-label/[id] — venta-label kind ─────────────────────

export interface VentaLabelFetchData {
  id: string
  folio: string | null
  cliente_nombre: string | null
  items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>
  total: number
  created_at: string
}

export async function getVentaLabelData(
  ventaId: string
): Promise<{ data: VentaLabelFetchData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: venta, error } = await supabase
    .from("ventas")
    .select("id, folio, cliente_nombre, total, created_at, estado")
    .eq("id", ventaId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !venta) return { data: null, error: "Venta no encontrada." }

  const v = venta as Record<string, unknown>
  const est = v.estado as string | undefined
  if (est === "anulado" || est === "cancelada") {
    return { data: null, error: "Esta venta fue anulada." }
  }

  const { data: detalles } = await supabase
    .from("detalle_ventas")
    .select("descripcion, cantidad, precio_unitario")
    .eq("venta_id", ventaId)

  return {
    data: {
      id: v.id as string,
      folio: (v.folio as string | null) ?? null,
      cliente_nombre: (v.cliente_nombre as string | null) ?? null,
      items: (detalles ?? []) as Array<{ descripcion: string; cantidad: number; precio_unitario: number }>,
      total: Number(v.total ?? 0),
      created_at: v.created_at as string,
    },
    error: null,
  }
}

// ─── Historial: ticket PDV + anulación ───────────────────────────────────────

/** Cualquier usuario autenticado del taller puede anular ventas. La seguridad real está en el RPC `anular_venta_pdv`. */
export async function canAnularVentas(): Promise<boolean> {
  const tallerId = await getCurrentTallerId()
  return !!tallerId
}

export async function getVentaParaTicket(
  ventaId: string
): Promise<{ venta: VentaCreada | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: venta, error } = await supabase
    .from("ventas")
    .select(
      "id, folio, cliente_nombre, cliente_telefono, total, descuento, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio, created_at, estado"
    )
    .eq("id", ventaId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !venta) return { venta: null, error: "Venta no encontrada." }

  const estado = (venta as { estado?: string }).estado
  if (estado === "anulado" || estado === "cancelada") {
    return { venta: null, error: "Esta venta fue anulada." }
  }

  const { data: detalles, error: dErr } = await supabase
    .from("detalle_ventas")
    .select(
      "producto_id, descripcion, cantidad, precio_unitario, costo_unitario, es_especial, imei_serie, color, condicion, marca, modelo, procesador, ram, almacenamiento"
    )
    .eq("venta_id", ventaId)

  if (dErr) return { venta: null, error: dErr.message }

  const v = venta as Record<string, unknown>
  const items: DetalleVentaInput[] = (detalles ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      producto_id: (r.producto_id as string | undefined) ?? undefined,
      descripcion: String(r.descripcion ?? ""),
      cantidad: Number(r.cantidad ?? 1),
      precio_unitario: Number(r.precio_unitario ?? 0),
      costo_unitario: Number(r.costo_unitario ?? 0),
      es_especial: Boolean(r.es_especial ?? false),
      imei_serie: (r.imei_serie as string | undefined) ?? undefined,
      color: (r.color as string | undefined) ?? undefined,
      condicion: (r.condicion as string | undefined) ?? undefined,
      marca: (r.marca as string | undefined) ?? undefined,
      modelo: (r.modelo as string | undefined) ?? undefined,
      procesador: (r.procesador as string | undefined) ?? undefined,
      ram: (r.ram as string | undefined) ?? undefined,
      almacenamiento: (r.almacenamiento as string | undefined) ?? undefined,
    }
  })

  return {
    venta: {
      id: v.id as string,
      folio: String(v.folio ?? ""),
      total: Number(v.total ?? 0),
      descuento: Number(v.descuento ?? 0),
      metodo_pago: String(v.metodo_pago ?? "efectivo"),
      monto_efectivo: Number(v.monto_efectivo ?? 0),
      monto_tarjeta: Number(v.monto_tarjeta ?? 0),
      monto_transferencia: Number(v.monto_transferencia ?? 0),
      cambio: Number(v.cambio ?? 0),
      created_at: v.created_at as string,
      items,
      cliente_nombre: (v.cliente_nombre as string | undefined) ?? undefined,
      cliente_telefono: (v.cliente_telefono as string | undefined) ?? undefined,
    },
    error: null,
  }
}

export interface CobroReparacionTicketData {
  folio: string
  cliente: string
  conceptos: string
  monto: number
  metodo_pago: string
  fechaIso: string
  tipoMov: "anticipo" | "liquidacion"
}

export async function getCobroReparacionParaTicket(
  movimientoId: string
): Promise<{ data: CobroReparacionTicketData | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: mov, error } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, monto, metodo_pago, fecha, referencia_id, descripcion")
    .eq("id", movimientoId)
    .eq("taller_id", tallerId)
    .single()

  if (error || !mov) return { data: null, error: "Movimiento no encontrado." }

  const m = mov as Record<string, unknown>
  const tipo = m.tipo as string
  if (tipo !== "anticipo_reparacion" && tipo !== "liquidacion_reparacion") {
    return { data: null, error: "Este movimiento no es un cobro de reparación." }
  }

  const rid = m.referencia_id as string | undefined
  let folio = "—"
  let cliente = "—"
  let equipo = ""
  if (rid) {
    const { data: rep } = await supabase
      .from("reparaciones")
      .select("folio, cliente_nombre, tipo_equipo, marca, modelo")
      .eq("id", rid)
      .eq("taller_id", tallerId)
      .maybeSingle()
    if (rep) {
      const r = rep as Record<string, unknown>
      folio = String(r.folio ?? "—")
      cliente = String(r.cliente_nombre ?? "").trim() || "—"
      const tipo = String(r.tipo_equipo ?? "").trim()
      const marca = String(r.marca ?? "").trim()
      const modelo = String(r.modelo ?? "").trim()
      equipo = `${tipo ? tipo + " " : ""}${marca} ${modelo}`.trim()
    }
  }

  const tipoMov = tipo === "liquidacion_reparacion" ? "liquidacion" : "anticipo"
  const descripcion = String(m.descripcion ?? "").trim()
  const conceptos = [
    tipoMov === "liquidacion" ? "Liquidación" : "Anticipo",
    equipo ? `· ${equipo}` : "",
    descripcion ? `· ${descripcion}` : "",
  ]
    .filter(Boolean)
    .join(" ")

  const fechaIso = (m.fecha as string) || ""

  return {
    data: {
      folio,
      cliente,
      conceptos: conceptos || "—",
      monto: Number(m.monto ?? 0),
      metodo_pago: String(m.metodo_pago ?? "efectivo"),
      fechaIso,
      tipoMov,
    },
    error: null,
  }
}

/**
 * Anula una venta de mostrador en una sola transacción (RPC `anular_venta_pdv`):
 * estado `anulado`, auditoría, movimiento de caja, reversión de stock en `productos`.
 */
export async function anularVenta(
  ventaId: string,
  motivo?: string | null
): Promise<{ success: boolean; error: string | null }> {
  if (!(await canAnularVentas())) {
    return { success: false, error: "No tienes permiso para anular ventas." }
  }

  const { supabase, tallerId } = await createCurrentTenantClient()
  const cajaGuard = await requireOpenCajaForFinancialOperation({ supabase, tallerId })
  if (!cajaGuard.ok) {
    return { success: false, error: cajaGuard.error }
  }

  const { data, error } = await supabase.rpc("anular_venta_pdv", {
    p_venta_id: ventaId,
    p_taller_id: tallerId,
    p_anulado_por: tallerId,
    p_motivo: motivo ?? null,
  })

  if (error) {
    console.error("[anularVenta] RPC:", error)
    return { success: false, error: error.message }
  }

  const payload = data as { ok?: boolean; error?: string } | null
  if (!payload?.ok) {
    return {
      success: false,
      error: typeof payload?.error === "string" ? payload.error : "No se pudo anular la venta.",
    }
  }

  return { success: true, error: null }
}

/** @deprecated Usar `anularVenta`. */
export async function cancelarVentaMostrador(ventaId: string) {
  return anularVenta(ventaId, null)
}
