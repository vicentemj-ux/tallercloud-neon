"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReparacionGasto {
  id: string
  reparacion_id: string
  concepto: string
  monto: number
  tipo: "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"
  producto_id: string | null
  mostrar_cliente: boolean
  creado_por_nombre?: string
  created_at: string
}

export interface GastoOperativo {
  id: string
  concepto: string
  categoria: string
  monto: number
  metodo_pago: string
  fecha: string
  notas: string | null
  created_at: string
}

export interface AddGastoTicketInput {
  reparacion_id: string
  concepto: string
  monto: number
  tipo: "mano_obra" | "refaccion" | "maquila" | "insumo" | "otro"
  producto_id?: string | null
  mostrar_cliente?: boolean
}

export interface AddGastoOperativoInput {
  concepto: string
  categoria: string
  monto: number
  metodo_pago: string
  fecha: string
  notas?: string | null
}

// ─── Nivel 1: Gastos por ticket ───────────────────────────────────────────────

export async function getGastosTicket(
  reparacion_id: string
): Promise<{ data: ReparacionGasto[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("reparacion_gastos")
    .select("*")
    .eq("taller_id", tallerId)
    .eq("reparacion_id", reparacion_id)
    .order("created_at", { ascending: false })

  if (error) return { data: [], error: error.message }

  return { data: data as ReparacionGasto[], error: null }
}

export async function addGastoTicket(
  input: AddGastoTicketInput
): Promise<{ data: ReparacionGasto | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const actorNombre = await getCurrentActorDisplayName()
  const usuarioReal = actorNombre || "Sistema"

  const { data: cajaCheck } = await supabase
    .from("caja")
    .select("id")
    .eq("taller_id", tallerId)
    .eq("estado", "abierta")
    .order("fecha_apertura", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cajaCheck?.id) {
    return { data: null, error: "No hay caja abierta. Abre la caja antes de registrar un gasto." }
  }

  const cajaId = cajaCheck.id as string

  const { data: repairRow } = await supabase
    .from("reparaciones")
    .select("folio")
    .eq("id", input.reparacion_id)
    .single()

  const folio = repairRow?.folio ?? "?"
  
  const tipoLabel = {
    mano_obra: "Mano de Obra",
    refaccion: "Refacción",
    maquila: "Maquila/Externo",
    insumo: "Insumos",
    otro: "Otros"
  }[input.tipo]

  const { data, error } = await supabase
    .from("reparacion_gastos")
    .insert({
      taller_id:        tallerId,
      reparacion_id:    input.reparacion_id,
      concepto:         input.concepto.trim(),
      monto:            input.monto,
      tipo:             input.tipo,
      producto_id:      input.producto_id ?? null,
      mostrar_cliente:  input.mostrar_cliente ?? false,
      creado_por_nombre: usuarioReal,
    })
    .select()
    .single()

  if (error) {
    console.error("[addGastoTicket] Error:", error)
    return { data: null, error: error.message }
  }

  const gastoRow = data as ReparacionGasto

  const { error: movError } = await supabase.from("movimientos_caja").insert({
    taller_id:       tallerId,
    caja_id:         cajaId,
    tipo:            "gasto_reparacion",
    /** ID de `reparacion_gastos` (1:1 con el movimiento; antes se usaba `reparacion_id` y fallaba con varios gastos). */
    referencia_id:   gastoRow.id,
    descripcion:     `Inversión Folio #${folio} - ${tipoLabel}: ${input.concepto.trim()}`,
    monto:           -Math.abs(input.monto),
    metodo_pago:     "efectivo",
    fecha:           new Date().toISOString(),
    vendedor_nombre: usuarioReal,
  })

  if (movError) {
    console.error("[addGastoTicket] movimientos_caja insert:", movError)
    await supabase.from("reparacion_gastos").delete().eq("id", gastoRow.id).eq("taller_id", tallerId)
    return {
      data: null,
      error:
        movError.message ||
        "No se pudo registrar el egreso en caja. Revisa permisos de Storage/RLS o que exista caja abierta.",
    }
  }

  revalidatePath(`/dashboard/reparaciones/${input.reparacion_id}`)
  revalidatePath("/dashboard/ventas")
  return { data: gastoRow, error: null }
}

export async function deleteGastoTicket(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: gastoRow } = await supabase
    .from("reparacion_gastos")
    .select("id, reparacion_id, concepto, monto")
    .eq("id", id)
    .eq("taller_id", tallerId)
    .maybeSingle()

  if (!gastoRow) return { error: "Gasto no encontrado" }

  const { error } = await supabase
    .from("reparacion_gastos")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)

  if (error) return { error: error.message }

  const { data: cajaRow } = await supabase
    .from("caja")
    .select("id")
    .eq("taller_id", tallerId)
    .eq("estado", "abierta")
    .order("fecha_apertura", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cajaRow) {
    const { data: byGastoId } = await supabase
      .from("movimientos_caja")
      .select("id")
      .eq("taller_id", tallerId)
      .eq("caja_id", cajaRow.id)
      .eq("referencia_id", id)
      .in("tipo", ["gasto_reparacion", "gasto"])
      .maybeSingle()

    let originalMov: { id: string } | null = byGastoId ?? null
    if (!originalMov) {
      const { data: legacyMov } = await supabase
        .from("movimientos_caja")
        .select("id")
        .eq("taller_id", tallerId)
        .eq("caja_id", cajaRow.id)
        .eq("referencia_id", gastoRow.reparacion_id)
        .in("tipo", ["gasto_reparacion", "gasto"])
        .eq("monto", -Math.abs(Number(gastoRow.monto ?? 0)))
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle()
      originalMov = legacyMov ?? null
    }

    if (originalMov?.id) {
      await supabase.from("movimientos_caja").delete().eq("id", originalMov.id)
    } else {
      console.warn(
        "[deleteGastoTicket] No se encontró movimiento de caja para el gasto; omitiendo ajuste (legacy o caja distinta).",
        { gastoId: id, reparacionId: gastoRow.reparacion_id },
      )
    }
  }

  revalidatePath(`/dashboard/reparaciones/${gastoRow.reparacion_id}`)
  revalidatePath("/dashboard/ventas")
  return { error: null }
}

export async function searchProductosParaGasto(
  query: string
): Promise<{ data: { id: string; nombre: string; precio_venta: number }[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data, error } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta")
    .eq("taller_id", tallerId)
    .ilike("nombre", `%${query}%`)
    .limit(8)

  if (error) return { data: [], error: error.message }
  return {
    data: (data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio_venta: Number(p.precio_venta ?? 0),
    })),
    error: null,
  }
}

// ─── Nivel 2: Gastos operativos ───────────────────────────────────────────────

export async function getGastosOperativos(opts?: {
  desde?: string
  hasta?: string
}): Promise<{ data: GastoOperativo[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  let q = supabase
    .from("bitacora_gastos")
    .select("id, concepto, categoria, monto, metodo_pago, fecha, notas, created_at")
    .eq("taller_id", tallerId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)

  if (opts?.desde) q = q.gte("fecha", opts.desde)
  if (opts?.hasta) q = q.lte("fecha", opts.hasta)

  const { data, error } = await q

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as GastoOperativo[], error: null }
}

export async function addGastoOperativo(
  input: AddGastoOperativoInput
): Promise<{ data: GastoOperativo | null; error: string | null; cajaAplicada?: boolean }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: gasto, error: gastoErr } = await supabase
    .from("bitacora_gastos")
    .insert({
      taller_id:   tallerId,
      concepto:    input.concepto.trim(),
      categoria:   input.categoria,
      monto:       input.monto,
      metodo_pago: input.metodo_pago,
      fecha:       input.fecha,
      notas:       input.notas?.trim() || null,
    })
    .select()
    .single()

  if (gastoErr) return { data: null, error: gastoErr.message }

  let cajaAplicada = false

  if (input.metodo_pago === "efectivo") {
    const { data: cajaRow, error: cajaErr } = await supabase
      .from("caja")
      .select("id, saldo_actual")
      .eq("taller_id", tallerId)
      .eq("estado", "abierta")
      .order("fecha_apertura", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cajaErr) {
      console.error("[addGastoOperativo] Error buscando caja abierta:", cajaErr)
    }

    if (cajaRow?.id) {
      const { data: movRow, error: movError } = await supabase
        .from("movimientos_caja")
        .insert({
          taller_id:    tallerId,
          caja_id:      cajaRow.id,
          tipo:         "gasto",
          descripcion:  input.concepto.trim(),
          monto:        -Math.abs(input.monto),
          metodo_pago:  "efectivo",
          fecha:        input.fecha,
          actor_nombre: await getCurrentActorDisplayName(),
        })
        .select("id")
        .single()

      if (movError || !movRow?.id) {
        console.error("[addGastoOperativo] movimientos_caja insert:", movError)
      } else {
        const { error: linkError } = await supabase
          .from("bitacora_gastos")
          .update({ caja_id: movRow.id })
          .eq("id", (gasto as GastoOperativo).id)

        if (linkError) {
          console.error("[addGastoOperativo] link caja_id error:", linkError)
        }

        const { error: saldoError } = await supabase
          .from("caja")
          .update({ saldo_actual: Number(cajaRow.saldo_actual ?? 0) - Math.abs(input.monto) })
          .eq("id", cajaRow.id)

        if (saldoError) {
          console.error("[addGastoOperativo] Error actualizando saldo de caja:", saldoError)
          await supabase.from("movimientos_caja").delete().eq("id", movRow.id).eq("taller_id", tallerId)
          await supabase.from("bitacora_gastos").update({ caja_id: null }).eq("id", (gasto as GastoOperativo).id)
          return { data: null, error: "No se pudo aplicar el gasto a la caja. Intenta de nuevo." }
        }

        cajaAplicada = true
      }
    }
  }

  return { data: gasto as GastoOperativo, error: null, cajaAplicada }
}

export async function deleteGastoOperativo(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const { data: row } = await supabase
    .from("bitacora_gastos")
    .select("caja_id")
    .eq("id", id)
    .eq("taller_id", tallerId)
    .single()

  const { error } = await supabase
    .from("bitacora_gastos")
    .delete()
    .eq("id", id)
    .eq("taller_id", tallerId)

  if (!error && row?.caja_id) {
    await supabase
      .from("movimientos_caja")
      .delete()
      .eq("id", row.caja_id)
      .eq("taller_id", tallerId)
  }

  return { error: error?.message ?? null }
}