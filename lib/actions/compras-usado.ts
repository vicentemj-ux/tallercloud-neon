"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { revalidatePath } from "next/cache"

export interface CompraUsadoInput {
  vendedor: string
  documento: string
  telefono: string
  marca: string
  modelo: string
  serial: string
  imei: string
  color: string
  condicion: string
  capacidad: string
  monto: number
  observaciones?: string
}

export interface CompraUsadaRow {
  id: string
  folio: string
  fecha: string
  vendedor: string
  documento: string
  telefono: string | null
  marca: string
  modelo: string
  serial: string | null
  imei: string | null
  color: string | null
  condicion: string | null
  capacidad: string | null
  monto: number
  observaciones: string | null
  actor_nombre: string | null
  created_at: string
}

export async function getComprasUsadas(): Promise<{ data: CompraUsadaRow[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("compras_usadas")
    .select("*")
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as CompraUsadaRow[], error: null }
}

export async function registrarCompraUsado(input: CompraUsadoInput): Promise<{
  success: boolean
  folio: string
  error: string | null
}> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorNombre = await getCurrentActorDisplayName()

  // 1. Validar caja abierta
  const { data: cajaRow, error: cajaErr } = await supabase
    .from("caja")
    .select("id, saldo_actual")
    .eq("taller_id", tallerId)
    .eq("estado", "abierta")
    .order("fecha_apertura", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cajaErr) {
    console.error("[registrarCompraUsado] Error buscando caja:", cajaErr)
    return { success: false, folio: "", error: "Error al verificar caja." }
  }

  if (!cajaRow?.id) {
    return { success: false, folio: "", error: "No hay caja abierta. Abre caja antes de registrar una compra." }
  }

  const saldoActual = Number(cajaRow.saldo_actual ?? 0)
  const montoAbs = Math.abs(input.monto)

  if (saldoActual < montoAbs) {
    return { success: false, folio: "", error: `Saldo insuficiente en caja ($${saldoActual.toLocaleString("es-MX", { minimumFractionDigits: 2 })}).` }
  }

  const folio = `CU-${Date.now().toString().slice(-6)}`
  const nowIso = new Date().toISOString()

  // 2. Insertar en tabla estructurada
  const { error: insertErr } = await supabase.from("compras_usadas").insert({
    taller_id:     tallerId,
    folio,
    fecha:         nowIso,
    vendedor:      input.vendedor.trim(),
    documento:     input.documento.trim(),
    telefono:      input.telefono.trim() || null,
    marca:         input.marca.trim(),
    modelo:        input.modelo.trim(),
    serial:        input.serial.trim() || null,
    imei:          input.imei.trim() || null,
    color:         input.color.trim() || null,
    condicion:     input.condicion.trim() || null,
    capacidad:     input.capacidad.trim() || null,
    monto:         montoAbs,
    observaciones: input.observaciones?.trim() || null,
    actor_nombre:  actorNombre,
  })

  if (insertErr) {
    console.error("[registrarCompraUsado] Error insertando compra_usada:", insertErr)
    return { success: false, folio: "", error: "No se pudo registrar la compra." }
  }

  // 3. Insertar movimiento de caja (egreso)
  const { error: movError } = await supabase.from("movimientos_caja").insert({
    taller_id:    tallerId,
    caja_id:      cajaRow.id,
    tipo:         "compra_equipo_usado",
    referencia_id: folio,
    descripcion:  `Compra equipo usado — ${input.marca} ${input.modelo} (Vendedor: ${input.vendedor})`,
    monto:        -montoAbs,
    metodo_pago:  "efectivo",
    fecha:        nowIso,
    actor_nombre: actorNombre,
  })

  if (movError) {
    console.error("[registrarCompraUsado] movimientos_caja insert:", movError)
    return { success: false, folio: "", error: "No se pudo registrar el egreso en caja." }
  }

  // 4. Actualizar saldo de caja
  const { error: saldoError } = await supabase
    .from("caja")
    .update({ saldo_actual: saldoActual - montoAbs })
    .eq("id", cajaRow.id)

  if (saldoError) {
    console.error("[registrarCompraUsado] Error actualizando saldo:", saldoError)
    // Best-effort rollback
    await supabase.from("movimientos_caja").delete().eq("referencia_id", folio).eq("taller_id", tallerId)
    await supabase.from("compras_usadas").delete().eq("folio", folio).eq("taller_id", tallerId)
    return { success: false, folio: "", error: "Error al actualizar saldo de caja." }
  }

  revalidatePath("/dashboard/compras")
  revalidatePath("/dashboard/ventas")

  return { success: true, folio, error: null }
}
