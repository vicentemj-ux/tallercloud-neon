"use server"

import { createCurrentTenantClient } from "@/lib/supabase/tenant-client"
import { createClient as createSsrClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import type { ChatMember, ChatUser, WorkshopMessage } from "@/components/dashboard/chat/types"

async function getCurrentActorId(tallerId: string): Promise<string> {
  const ssr = await createSsrClient()
  const {
    data: { user },
  } = await ssr.auth.getUser()
  return user?.id ?? tallerId
}

export async function getChatMembers(): Promise<{ data: ChatMember[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()

  const [ownerRes, membersRes] = await Promise.all([
    supabase.from("taller_users").select("id, nombre_propietario, email").eq("id", tallerId).maybeSingle(),
    supabase
      .from("miembros_taller")
      .select("id, auth_user_id, nombre, rol_id")
      .eq("taller_id", tallerId)
      .eq("activo", true)
      .order("created_at", { ascending: true }),
  ])

  if (ownerRes.error) return { data: [], error: ownerRes.error.message }
  if (membersRes.error) return { data: [], error: membersRes.error.message }

  const roleIds = (membersRes.data ?? []).map((m) => m.rol_id).filter(Boolean)
  const { data: rolesRows } = roleIds.length
    ? await supabase.from("roles_taller").select("id, nombre").in("id", roleIds)
    : { data: [] as Array<{ id: string; nombre: string }> }
  const roleMap = new Map((rolesRows ?? []).map((r) => [String(r.id), String(r.nombre)]))

  const out: ChatMember[] = []
  if (ownerRes.data) {
    const ownerName =
      (ownerRes.data as { nombre_propietario?: string | null; email?: string | null }).nombre_propietario ||
      (ownerRes.data as { email?: string | null }).email ||
      "Propietario"
    out.push({
      id: String((ownerRes.data as { id: string }).id),
      name: ownerName,
      role: "Propietario",
      online: true,
    })
  }

  for (const member of membersRes.data ?? []) {
    const memberId = String(member.auth_user_id || member.id)
    out.push({
      id: memberId,
      name: (member.nombre as string) || "Miembro",
      role: roleMap.get(String(member.rol_id)) || "Equipo",
      online: false,
    })
  }

  return { data: out, error: null }
}

export async function getChatCurrentUser(): Promise<{ data: ChatUser | null; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorId = await getCurrentActorId(tallerId)
  const actorName = await getCurrentActorDisplayName()

  if (actorId === tallerId) {
    return { data: { id: actorId, name: actorName || "Propietario" }, error: null }
  }

  const { data: member } = await supabase
    .from("miembros_taller")
    .select("nombre")
    .eq("taller_id", tallerId)
    .eq("auth_user_id", actorId)
    .eq("activo", true)
    .maybeSingle()

  return { data: { id: actorId, name: (member as { nombre?: string } | null)?.nombre || actorName || "Miembro" }, error: null }
}

export async function getWorkshopMessages(
  peerId?: string | null,
): Promise<{ data: WorkshopMessage[]; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorId = await getCurrentActorId(tallerId)

  let query = supabase
    .from("workshop_messages")
    .select("id, content, sender_id, sender_name, recipient_id, created_at")
    .eq("taller_id", tallerId)
    .order("created_at", { ascending: true })
    .limit(500)

  if (peerId) {
    query = query.or(
      `and(sender_id.eq.${actorId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${actorId})`,
    )
  } else {
    query = query.is("recipient_id", null)
  }

  const { data, error } = await query
  if (error) return { data: [], error: error.message }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      content: row.content as string,
      sender_id: row.sender_id ? String(row.sender_id) : "",
      sender_name: (row.sender_name as string) || "Tecnico",
      recipient_id: row.recipient_id ? String(row.recipient_id) : null,
      created_at: row.created_at as string,
    })),
    error: null,
  }
}

export async function sendWorkshopMessage(
  contentRaw: string,
  recipientId?: string | null,
): Promise<{ success: boolean; error: string | null }> {
  const content = contentRaw.trim()
  if (!content) return { success: false, error: "El mensaje no puede estar vacio." }

  const { supabase, tallerId } = await createCurrentTenantClient()
  const actorName = await getCurrentActorDisplayName()
  const senderId = await getCurrentActorId(tallerId)

  const { error } = await supabase.from("workshop_messages").insert({
    taller_id: tallerId,
    sender_id: senderId,
    sender_name: actorName || "Tecnico",
    recipient_id: recipientId || null,
    content,
  })

  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

export async function debugChatMembers(): Promise<{ data: unknown; error: string | null }> {
  const { supabase, tallerId } = await createCurrentTenantClient()
  const admin = await createAdminClient()
  const [members, roles] = await Promise.all([
    supabase
      .from("miembros_taller")
      .select("id, auth_user_id, nombre, rol_id, activo")
      .eq("taller_id", tallerId),
    admin.from("roles_taller").select("id, nombre"),
  ])
  return { data: { tallerId, members: members.data ?? [], roles: roles.data ?? [] }, error: members.error?.message ?? null }
}
