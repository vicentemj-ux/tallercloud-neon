"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { revalidatePath } from "next/cache"

/**
 * Sanitiza campos de texto para prevenir inyección de fórmulas Excel/CSV.
 * Elimina caracteres de inicio de fórmula (=, +, -, @, \t, \r) al inicio del valor.
 */
function sanitizeImportField(value: unknown): string {
  if (value === null || value === undefined) return ""
  let str = String(value).trim()
  if (!str) return ""
  // Eliminar prefijos de fórmula al inicio
  str = str.replace(/^[+=\-@\t\r]+/, "")
  return str
}

/**
 * PASO 1: Carga Masiva a Staging
 * Toma los datos del Excel y los mete a la tabla temporal en lotes de 100.
 */
export async function uploadToStaging(data: any[], batchId: string) {
  const { supabase, tallerId } = await createCurrentTenantClient()

  try {
    const chunkSize = 100
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize)
      
      const rowsToInsert = chunk.map((row) => ({
        import_batch_id: batchId,
        taller_id: tallerId,
        folio: sanitizeImportField(row.folio) || "S/F",
        cliente_nombre: sanitizeImportField(row.cliente_nombre) || "Cliente Importado",
        cliente_telefono: sanitizeImportField(row.cliente_telefono) || "",
        marca: sanitizeImportField(row.marca),
        modelo: sanitizeImportField(row.modelo),
        falla: sanitizeImportField(row.falla),
        costo_total: parseFloat(row.costo_total) || 0,
        fecha_recepcion_original: row.fecha_recepcion_original || null,
        fecha_entrega_original: row.fecha_entrega_original || null,
        estatus_original: sanitizeImportField(row.estatus_original) || "Entregado",
        tecnico_original: sanitizeImportField(row.tecnico_original),
      }))

      const { error } = await supabase
        .from("staging_import_reparaciones")
        .insert(rowsToInsert)

      if (error) throw error
    }

    revalidatePath("/dashboard/configuracion/importacion")
    return { success: true, count: data.length, batchId }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * PASO 2: Procesamiento Definitivo
 * Mueve los datos de Staging a Reparaciones, creando clientes si no existen.
 */
export async function processStagingToFinal(batchId: string) {
  const { supabase, tallerId } = await createCurrentTenantClient()

  try {
    // 1. Traemos los registros de este lote que no han sido procesados
    const { data: stagingRecords, error: fetchError } = await supabase
      .from("staging_import_reparaciones")
      .select("*")
      .eq("import_batch_id", batchId)
      .eq("procesado", false)

    if (fetchError) throw fetchError
    if (!stagingRecords || stagingRecords.length === 0) return { success: true, processed: 0 }

    let count = 0

    for (const record of stagingRecords) {
      // A. Lógica de Cliente: Buscar por teléfono o crear uno nuevo
      let finalClienteId = null
      
      if (record.cliente_telefono) {
        const { data: existingClient } = await supabase
          .from("clientes")
          .select("id")
          .eq("taller_id", tallerId)
          .eq("telefono", record.cliente_telefono)
          .maybeSingle()
        
        if (existingClient) {
          finalClienteId = existingClient.id
        }
      }

      if (!finalClienteId) {
        const { data: newClient, error: clientError } = await supabase
          .from("clientes")
          .insert({
            taller_id: tallerId,
            nombre: record.cliente_nombre,
            telefono: record.cliente_telefono || ""
          })
          .select("id")
          .single()
        
        if (!clientError) finalClienteId = newClient.id
      }

      // B. Insertar en Reparaciones Oficial
      const { error: repairError } = await supabase
        .from("reparaciones")
        .insert({
          taller_id: tallerId,
          folio: record.folio,
          cliente_id: finalClienteId,
          cliente_nombre: record.cliente_nombre,
          cliente_telefono: record.cliente_telefono,
          marca: record.marca,
          modelo: record.modelo,
          falla: record.falla,
          costo_total: record.costo_total,
          estatus: record.estatus_original || "Entregado",
          fecha_entrega: record.fecha_entrega_original, // Columna existente en tu DB
          tecnico: record.tecnico_original,
          notas_internas: `Importación masiva (Lote: ${batchId})`
        })

      if (!repairError) {
        // C. Marcar como procesado con éxito
        await supabase
          .from("staging_import_reparaciones")
          .update({ procesado: true })
          .eq("id", record.id)
        count++
      }
    }

    revalidatePath("/dashboard/reparaciones")
    revalidatePath("/dashboard/configuracion/importacion")
    return { success: true, processed: count }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * PASO 3: Limpieza (Opcional pero recomendada)
 * Borra los registros ya procesados de la tabla temporal.
 */
export async function clearProcessedStaging(batchId: string) {
  const { supabase, tallerId } = await createCurrentTenantClient()
  
  const { error } = await supabase
    .from("staging_import_reparaciones")
    .delete()
    .eq("taller_id", tallerId)
    .eq("import_batch_id", batchId)
    .eq("procesado", true)

  return { success: !error, error: error?.message }
}