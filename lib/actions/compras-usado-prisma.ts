"use server"

import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getPrismaClient } from "@/lib/prisma"

export interface CompraUsadaRow {
  id: string
  folio: string
  equipo_tipo: string
  marca: string
  modelo: string
  imei_serie: string | null
  capacidad: string | null
  condicion: string | null
  color: string | null
  costo_compra: number
  monto: number
  vendedor: string
  documento: string
  imei: string | null
  fecha: string
  proveedor_nombre: string | null
  fecha_compra: string
  notas: string | null
  created_at: string
}

export interface CompraUsadoInput {
  vendedor: string
  documento: string
  telefono?: string | null
  marca: string
  modelo: string
  serial?: string | null
  imei?: string | null
  capacidad?: string | null
  condicion?: string | null
  color?: string | null
  monto: number
  observaciones?: string | null
}

function extractTagValue(notas: string | null, tag: string): string {
  if (!notas) return "-"
  const match = notas.match(new RegExp(`${tag}:\\s*([^|]+)`))
  return match?.[1]?.trim() || "-"
}

export async function getComprasUsadas(): Promise<{ data: CompraUsadaRow[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, folio, equipo_tipo, marca, modelo, imei_serie, capacidad, condicion, color, costo_compra, proveedor_nombre, fecha_compra, notas, created_at
       FROM compras_usadas
       WHERE taller_id = $1
       ORDER BY created_at DESC
       LIMIT 300`,
      tallerId,
    )

    return {
      data: rows.map((r) => {
        const notas = r.notas == null ? null : String(r.notas)
        return {
          id: String(r.id),
          folio: String(r.folio ?? ""),
          equipo_tipo: String(r.equipo_tipo ?? ""),
          marca: String(r.marca ?? ""),
          modelo: String(r.modelo ?? ""),
          imei_serie: r.imei_serie == null ? null : String(r.imei_serie),
          capacidad: r.capacidad == null ? null : String(r.capacidad),
          condicion: r.condicion == null ? null : String(r.condicion),
          color: r.color == null ? null : String(r.color),
          costo_compra: Number(r.costo_compra ?? 0),
          monto: Number(r.costo_compra ?? 0),
          vendedor: r.proveedor_nombre == null ? "-" : String(r.proveedor_nombre),
          documento: extractTagValue(notas, "Documento"),
          imei: r.imei_serie == null ? null : String(r.imei_serie),
          fecha: String(r.fecha_compra ?? ""),
          proveedor_nombre: r.proveedor_nombre == null ? null : String(r.proveedor_nombre),
          fecha_compra: String(r.fecha_compra ?? ""),
          notas,
          created_at: String(r.created_at),
        }
      }),
      error: null,
    }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar compras usadas" }
  }
}

export async function registrarCompraUsado(input: CompraUsadoInput): Promise<{ success: boolean; error?: string; folio?: string }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actor = await getCurrentActorDisplayName()

    const c = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      "SELECT COUNT(*)::int AS total FROM compras_usadas WHERE taller_id = $1",
      tallerId,
    )
    const folio = `CU-${String((c[0]?.total ?? 0) + 1).padStart(5, "0")}`

    const imeiSerie = input.imei?.trim() || input.serial?.trim() || null
    const notasBase = [
      input.documento?.trim() ? `Documento: ${input.documento.trim()}` : null,
      input.telefono?.trim() ? `Telefono: ${input.telefono.trim()}` : null,
      input.observaciones?.trim() ? `Observaciones: ${input.observaciones.trim()}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join(" | ")

    await prisma.$executeRawUnsafe(
      `INSERT INTO compras_usadas (taller_id, folio, equipo_tipo, marca, modelo, imei_serie, capacidad, condicion, color, costo_compra, proveedor_nombre, fecha_compra, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      tallerId,
      folio,
      "dispositivo",
      input.marca,
      input.modelo,
      imeiSerie,
      input.capacidad ?? null,
      input.condicion ?? null,
      input.color ?? null,
      Number(input.monto),
      input.vendedor?.trim() ?? null,
      new Date().toISOString().slice(0, 10),
      notasBase || null,
    )

    const cajaRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
      tallerId,
    )
    const cajaId = cajaRows[0]?.id
    if (cajaId) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO movimientos_caja (taller_id, caja_id, tipo, referencia_id, descripcion, monto, metodo_pago, fecha, vendedor_nombre)
         VALUES ($1,$2,'compra_usado',$3,$4,$5,'efectivo',now(),$6)`,
        tallerId,
        cajaId,
        folio,
        `Compra usado ${input.marca} ${input.modelo}`,
        -Math.abs(Number(input.monto)),
        actor,
      )
    }

    return { success: true, folio }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error registrando compra" }
  }
}
