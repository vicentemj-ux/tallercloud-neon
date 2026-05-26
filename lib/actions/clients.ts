"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"

const createClient = async () => (await createCurrentTenantClient()).supabase

export interface Client {
  id: string
  nombre: string
  telefono: string
  telefono_secundario?: string | null
  correo?: string | null
  notas?: string | null
  created_at?: string
  ordenes_count?: number
  // Datos fiscales (opcionales — CFDI 4.0)
  rfc?: string | null
  razon_social?: string | null
  codigo_postal_fiscal?: string | null
  regimen_fiscal?: string | null
  uso_cfdi?: string | null
}

export interface ClientDetail extends Client {
  ordenes: Array<{
    id: string
    folio: string
    marca: string
    modelo: string
    falla: string
    estatus: string
    precio_estimado: number | null
    created_at: string
  }>
}

/** Construye mapa cliente_id → nº de reparaciones desde un array de rows ya descargado. */
function buildCountMap(repRows: Array<{ cliente_id: string | null }>): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of repRows) {
    if (r.cliente_id) map[r.cliente_id] = (map[r.cliente_id] || 0) + 1
  }
  return map
}

const CLIENT_SELECT =
  "id, nombre, telefono, telefono_secundario, correo, notas, created_at, rfc, razon_social, codigo_postal_fiscal, regimen_fiscal, uso_cfdi"

// Get all clients for current taller
export async function getAllClients(): Promise<{ clients: Client[]; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // PERF: clientes + conteo de reparaciones en paralelo — antes era waterfall (fetch clientes → esperar → fetch counts)
  const [clientRes, repRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(CLIENT_SELECT)
      .eq("taller_id", tallerId)
      .order("nombre", { ascending: true })
      .limit(200),
    supabase
      .from("reparaciones")
      .select("cliente_id")
      .eq("taller_id", tallerId)
      .not("cliente_id", "is", null),
  ])

  if (clientRes.error) {
    console.error("Error fetching clients:", clientRes.error)
    return { clients: [], error: "No se pudieron cargar los clientes" }
  }

  const countMap = buildCountMap((repRes.data ?? []) as Array<{ cliente_id: string | null }>)
  return {
    clients: (clientRes.data ?? []).map((c) => ({ ...c, ordenes_count: countMap[c.id] || 0 })),
    error: null,
  }
}

// Search clients by name, phone, or ID for current taller
export async function searchClients(
  query: string
): Promise<{ clients: Client[]; error: string | null }> {
  if (!query.trim()) return getAllClients()

  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const cleanedPhone = query.replace(/\D/g, "")
  const lowerQuery = query.toLowerCase()

  // PERF: clientes filtrados + conteo paralelo — antes era waterfall
  const [clientRes, repRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(CLIENT_SELECT)
      .eq("taller_id", tallerId)
      .or(
        `nombre.ilike.%${lowerQuery}%,telefono.ilike.%${cleanedPhone}%,id.ilike.%${lowerQuery}%,telefono_secundario.ilike.%${cleanedPhone}%`
      )
      .order("nombre", { ascending: true })
      .limit(200),
    supabase
      .from("reparaciones")
      .select("cliente_id")
      .eq("taller_id", tallerId)
      .not("cliente_id", "is", null),
  ])

  if (clientRes.error) {
    console.error("Error searching clients:", clientRes.error)
    return { clients: [], error: "Error en la búsqueda" }
  }

  const countMap = buildCountMap((repRes.data ?? []) as Array<{ cliente_id: string | null }>)
  return {
    clients: (clientRes.data ?? []).map((c) => ({ ...c, ordenes_count: countMap[c.id] || 0 })),
    error: null,
  }
}

// Get client detail with orders for current taller
export async function getClientDetail(
  clientId: string
): Promise<{ client: ClientDetail | null; error: string | null }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  // Get client info with taller_id verification
  const { data: clientData, error: clientError } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, telefono_secundario, correo, notas, created_at, rfc, razon_social, codigo_postal_fiscal, regimen_fiscal, uso_cfdi")
    .eq("id", clientId)
    .eq("taller_id", tallerId)
    .single()

  if (clientError) {
    console.error("Error fetching client:", clientError)
    return { client: null, error: "Cliente no encontrado" }
  }

  // Get client orders
  const { data: ordenes, error: ordenesError } = await supabase
    .from("reparaciones")
    .select("id, folio, marca, modelo, falla, estatus, precio_estimado, created_at")
    .eq("cliente_id", clientId)
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: false })

  if (ordenesError) {
    console.error("Error fetching orders:", ordenesError)
    return { client: null, error: "Error al cargar órdenes" }
  }

  return {
    client: {
      ...clientData,
      ordenes: ordenes || [],
    },
    error: null,
  }
}

// Update client for current taller
export async function updateClient(clientId: string, updates: Partial<Client>) {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const cleanedData: any = { ...updates }
  if (updates.telefono) {
    cleanedData.telefono = updates.telefono.replace(/\D/g, "")
  }
  if (updates.telefono_secundario !== undefined) {
    cleanedData.telefono_secundario = updates.telefono_secundario?.replace(/\D/g, "") || null
  }
  // RFC: siempre mayúsculas; vacío → null
  if (updates.rfc !== undefined) {
    cleanedData.rfc = updates.rfc?.trim().toUpperCase() || null
  }
  // Campos fiscales opcionales: vacío → null
  const nullableFields = ["razon_social", "codigo_postal_fiscal", "regimen_fiscal", "uso_cfdi"] as const
  for (const field of nullableFields) {
    if (updates[field] !== undefined) {
      cleanedData[field] = updates[field]?.trim() || null
    }
  }

  const { data, error } = await supabase
    .from("clientes")
    .update(cleanedData)
    .eq("id", clientId)
    .eq("taller_id", tallerId)
    .select("id, nombre, telefono, telefono_secundario, correo, notas, created_at, rfc, razon_social, codigo_postal_fiscal, regimen_fiscal, uso_cfdi")
    .single()

  if (error) {
    console.error("Error updating client:", error)
    return { client: null, error: "No se pudo actualizar el cliente" }
  }

  return { client: data, error: null }
}

// Delete a client for current taller
export async function deleteClient(clientId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const tallerId = await getCurrentTallerId()

  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("id", clientId)
    .eq("taller_id", tallerId)

  if (error) {
    console.error("Error deleting client:", error)
    return { success: false, error: "No se pudo eliminar el cliente" }
  }

  return { success: true }
}
