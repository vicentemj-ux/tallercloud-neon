import { NextResponse } from "next/server"
import { getPrismaClient } from "@/lib/prisma"
import { last4, onlyDigits } from "@/lib/phone"
import { getArchivoDisplayUrl } from "@/lib/archivo-url"

type VerifyBody = {
  ticketId?: string
  last4?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VerifyBody
    const ticketId = String(body.ticketId ?? "").trim()
    const phoneLast4 = onlyDigits(body.last4).slice(-4)

    if (!ticketId || phoneLast4.length !== 4) {
      return NextResponse.json(
        { ok: false, error: "Ingresa los ultimos 4 digitos validos." },
        { status: 400 },
      )
    }

    const prisma = getPrismaClient()
    const reparacion = await prisma.reparacion.findUnique({
      where: { id: ticketId },
      include: {
        tenant: {
          select: {
            nombre: true,
            configuracion: {
              select: { nombreComercial: true, logoUrl: true, telefono: true, whatsapp: true },
            },
          },
        },
        cliente: { select: { telefono: true } },
        archivos: {
          where: {
            visibility: "TRACKING_VERIFIED",
            tipo: "REPAIR_INTAKE_PHOTO",
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, publicUrl: true, storageKey: true, key: true },
        },
      },
    })

    if (!reparacion) {
      return NextResponse.json({ ok: false, error: "Ticket no encontrado." }, { status: 404 })
    }

    if (last4(reparacion.cliente?.telefono) !== phoneLast4) {
      return NextResponse.json(
        { ok: false, error: "Los ultimos 4 digitos no coinciden." },
        { status: 403 },
      )
    }

    const fotos = reparacion.archivos
      .map((a: { id: string; publicUrl: string | null; storageKey: string | null; key: string }) => ({
        id: a.id,
        url: getArchivoDisplayUrl(a),
      }))
      .filter((a: { id: string; url: string | null }): a is { id: string; url: string } => Boolean(a.url))

    return NextResponse.json({
      ok: true,
      reparacion: {
        id: reparacion.id,
        folio: reparacion.folio,
        marca: reparacion.equipoMarca,
        modelo: reparacion.equipoModelo,
        tipo_equipo: reparacion.tipoEquipo,
        numero_serie: reparacion.numeroSerie,
        falla: reparacion.falla,
        precio_estimado: reparacion.costoEstimado == null ? null : Number(reparacion.costoEstimado),
        estatus: reparacion.estado,
        created_at: reparacion.createdAt.toISOString(),
        updated_at: reparacion.updatedAt.toISOString(),
      },
      taller: {
        name: reparacion.tenant?.configuracion?.nombreComercial?.trim() || reparacion.tenant?.nombre || null,
        logoUrl: reparacion.tenant?.configuracion?.logoUrl ?? null,
        telefono: reparacion.tenant?.configuracion?.telefono ?? null,
        whatsapp: reparacion.tenant?.configuracion?.whatsapp ?? null,
      },
      fotos,
    })
  } catch (error) {
    console.error("[api/tracking/verify] error:", error)
    return NextResponse.json(
      { ok: false, error: "No se pudo validar el tracking en este momento." },
      { status: 500 },
    )
  }
}
