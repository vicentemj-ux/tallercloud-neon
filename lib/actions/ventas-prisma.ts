"use server"

import { revalidatePath } from "next/cache"
import { getPrismaClient } from "@/lib/prisma"
import { getCurrentTallerId } from "@/lib/auth/get-current-taller"
import { getCurrentActorDisplayName } from "@/lib/auth/actor-display-name"
import { getInventoryPublicUrl } from "@/lib/storage"

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

export interface CrearVentaInput {
  caja_id?: string | null
  cliente_nombre?: string | null
  cliente_id?: string | null
  cliente_telefono?: string | null
  total: number
  descuento?: number
  metodo_pago: string
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
  cliente_nombre?: string | null
  cliente_telefono?: string | null
}

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
  monto_cierre?: number | null
  nota_cierre?: string
  cobrosRep: CorteCobro[]
  listaGastos: CorteGasto[]
  ventas: CorteVentaLinea[]
  totalVentasPdv: number
}

export interface AbrirCajaResult {
  caja: CajaRow | null
  error: string | null
  status: "opened" | "already_open" | "error"
}

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

export interface VentaLabelFetchData {
  id: string
  folio: string | null
  cliente_nombre: string | null
  items: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>
  total: number
  created_at: string
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

function toNum(v: unknown): number {
  return Number(v ?? 0)
}

function normCaja(row: Record<string, unknown>): CajaRow {
  return {
    id: String(row.id),
    taller_id: String(row.taller_id),
    monto_inicial: toNum(row.monto_inicial),
    monto_cierre: row.monto_cierre == null ? null : toNum(row.monto_cierre),
    fecha_apertura: String(row.fecha_apertura),
    fecha_cierre: row.fecha_cierre == null ? null : String(row.fecha_cierre),
    estado: row.estado === "cerrada" ? "cerrada" : "abierta",
    total_efectivo: toNum(row.total_efectivo),
    total_tarjeta: toNum(row.total_tarjeta),
    total_transferencia: toNum(row.total_transferencia),
    total_ventas: toNum(row.total_ventas),
    nota_cierre: row.nota_cierre == null ? null : String(row.nota_cierre),
    numero_corte: row.numero_corte == null ? null : toNum(row.numero_corte),
  }
}

let _allPosTablesReady = false

async function ensureAllPosTablesExist() {
  if (_allPosTablesReady) return
  const prisma = getPrismaClient()

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS caja (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      taller_id text NOT NULL,
      monto_inicial numeric(12,2) NOT NULL DEFAULT 0,
      monto_cierre numeric(12,2),
      fecha_apertura timestamptz NOT NULL DEFAULT now(),
      fecha_cierre timestamptz,
      estado text NOT NULL DEFAULT 'abierta',
      total_efectivo numeric(12,2) NOT NULL DEFAULT 0,
      total_tarjeta numeric(12,2) NOT NULL DEFAULT 0,
      total_transferencia numeric(12,2) NOT NULL DEFAULT 0,
      total_ventas numeric(12,2) NOT NULL DEFAULT 0,
      nota_cierre text,
      numero_corte integer
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_abierta_tenant
    ON caja (taller_id) WHERE estado = 'abierta';
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ventas (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      taller_id text NOT NULL,
      caja_id text,
      folio text NOT NULL,
      cliente_nombre text,
      cliente_id text,
      cliente_telefono text,
      total numeric(12,2) NOT NULL DEFAULT 0,
      descuento numeric(12,2) NOT NULL DEFAULT 0,
      metodo_pago text NOT NULL DEFAULT 'efectivo',
      monto_efectivo numeric(12,2) NOT NULL DEFAULT 0,
      monto_tarjeta numeric(12,2) NOT NULL DEFAULT 0,
      monto_transferencia numeric(12,2) NOT NULL DEFAULT 0,
      cambio numeric(12,2) NOT NULL DEFAULT 0,
      estado text NOT NULL DEFAULT 'activa',
      vendedor_nombre text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS detalle_ventas (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      venta_id text NOT NULL,
      producto_id text,
      descripcion text NOT NULL,
      cantidad integer NOT NULL DEFAULT 1,
      precio_unitario numeric(12,2) NOT NULL,
      costo_unitario numeric(12,2) NOT NULL DEFAULT 0,
      subtotal numeric(12,2) NOT NULL DEFAULT 0,
      es_especial boolean NOT NULL DEFAULT false,
      imei_serie text,
      color text,
      condicion text,
      marca text,
      modelo text,
      categoria text,
      procesador text,
      ram text,
      almacenamiento text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  await prisma.$executeRawUnsafe(`ALTER TABLE detalle_ventas ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS movimientos_caja (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      taller_id text NOT NULL,
      caja_id text,
      tipo text NOT NULL,
      referencia_id text,
      descripcion text,
      monto numeric(12,2) NOT NULL DEFAULT 0,
      metodo_pago text,
      fecha timestamptz NOT NULL DEFAULT now(),
      folio text,
      vendedor_nombre text
    );
  `)

  await prisma.$executeRawUnsafe(`ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS folio text`);
  await prisma.$executeRawUnsafe(`ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS vendedor_nombre text`);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION get_next_venta_folio(p_taller_id text)
    RETURNS text
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_count integer;
    BEGIN
      SELECT COALESCE(COUNT(*), 0) + 1 INTO v_count
      FROM ventas WHERE taller_id = p_taller_id;
      RETURN 'VTA-' || LPAD(v_count::text, 6, '0');
    END;
    $$;
  `)

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION anular_venta_pdv(
      p_venta_id text,
      p_taller_id text,
      p_caja_id text,
      p_motivo text DEFAULT NULL
    )
    RETURNS TABLE(ok boolean, error text)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE ventas SET estado = 'anulado' WHERE id = p_venta_id AND taller_id = p_taller_id;
      IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Venta no encontrada o ya anulada.';
        RETURN;
      END IF;
      RETURN QUERY SELECT true, NULL::text;
    END;
    $$;
  `)

  // ─── Repair audit tables ───────────────────────────────────────────────────

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS historial_reparacion (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      reparacion_id text NOT NULL,
      taller_id text NOT NULL,
      usuario_id text,
      estado_anterior text,
      estado_nuevo text NOT NULL,
      nota_tecnica text,
      actor_nombre text,
      fecha timestamptz NOT NULL DEFAULT now()
    );
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cambios_reparaciones (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      taller_id text NOT NULL,
      reparacion_id text NOT NULL,
      tipo_cambio text NOT NULL,
      descripcion text,
      valor_anterior text,
      valor_nuevo text,
      usuario text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  // ─── Admin OTP codes table ─────────────────────────────────────────────────

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS admin_otp_codes (
      id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      admin_id text NOT NULL,
      code text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      attempts integer DEFAULT 0,
      CONSTRAINT admin_otp_code_format CHECK (code ~ '^[0-9]{8}$')
    );
  `)

  _allPosTablesReady = true
}

export async function getCajaAbierta(): Promise<{ caja: CajaRow | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      "SELECT * FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
      tallerId,
    )
    return { caja: rows[0] ? normCaja(rows[0]) : null, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al verificar caja"
    if (message.includes("relation") && message.includes("does not exist")) {
      return { caja: null, error: null }
    }
    console.error("[ventas-prisma] getCajaAbierta:", message)
    return { caja: null, error: null }
  }
}

export async function requireCajaAbierta(): Promise<{ caja: CajaRow; error: null } | { caja: null; error: string }> {
  const { caja, error } = await getCajaAbierta()
  if (error) return { caja: null, error: `Error al verificar caja: ${error}` }
  if (!caja) return { caja: null, error: "No hay una caja abierta. Abre la caja antes de realizar esta operacion." }
  return { caja, error: null }
}

export async function abrirCaja(montoInicial: number): Promise<AbrirCajaResult> {
  let tallerId = ""
  try {
    const prisma = getPrismaClient()
    tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      "SELECT COUNT(*)::int AS total FROM caja WHERE taller_id = $1",
      tallerId,
    )
    const numeroCorte = (countRows[0]?.total ?? 0) + 1

    const inserted = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO caja (taller_id, monto_inicial, estado, numero_corte)
       VALUES ($1, $2, 'abierta', $3)
       RETURNING *`,
      tallerId,
      montoInicial,
      numeroCorte,
    )

    if (!inserted[0]) {
      return { status: "error", caja: null, error: "No se pudo crear la caja." }
    }

    return {
      status: "opened",
      caja: normCaja(inserted[0]),
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al abrir caja"

    if (message.includes("uq_caja_abierta_tenant") || message.includes("duplicate key")) {
      try {
        const prisma = getPrismaClient()
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          "SELECT * FROM caja WHERE taller_id = $1 AND estado = 'abierta' ORDER BY fecha_apertura DESC LIMIT 1",
          tallerId || (await getCurrentTallerId()),
        )
        if (rows[0]) {
          return {
            status: "already_open",
            caja: normCaja(rows[0]),
            error: "Ya hay una caja abierta.",
          }
        }
      } catch {
        // fallback a error generico
      }
    }

    console.error("[ventas-prisma] abrirCaja:", message)
    return { status: "error", caja: null, error: message }
  }
}

export async function cerrarCaja(cajaId: string, montoCierre: number): Promise<{ error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await prisma.$executeRawUnsafe(
      `UPDATE caja
       SET estado='cerrada', monto_cierre=$1, fecha_cierre=now()
       WHERE id=$2 AND taller_id=$3`,
      montoCierre,
      cajaId,
      tallerId,
    )
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al cerrar caja" }
  }
}

export async function getProductosDisponibles(): Promise<{ data: ProductoDisponible[]; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()

    const rows = await prisma.producto.findMany({
      where: { tenantId: tallerId, stockActual: { gt: 0 } },
      orderBy: { nombre: "asc" },
      take: 300,
    })

    return {
      data: rows.map((row) => ({
        id: row.id,
        taller_id: row.tenantId,
        nombre: row.nombre,
        sku: row.sku,
        categoria: row.categoria,
        precio_venta: Number(row.precioVenta),
        costo: Number(row.costo),
        stock_actual: row.stockActual,
        imagen_url: getInventoryPublicUrl(row.imagenUrl),
        es_equipo: row.esEquipo,
        imei_serie: row.imeiSerie,
        color: row.color,
        capacidad: row.capacidad,
        condicion: row.condicion,
        marca: row.marca,
        modelo: row.modelo,
        procesador: row.procesador,
        ram: row.ram,
        almacenamiento: row.almacenamiento,
      })),
      error: null,
    }
  } catch (error) {
    console.error("[ventas-prisma] getProductosDisponibles:", error)
    return { data: [], error: error instanceof Error ? error.message : "Error al cargar inventario" }
  }
}

export async function crearVenta(input: CrearVentaInput): Promise<{ venta: VentaCreada | null; error: string | null }> {
  const cajaCheck = await requireCajaAbierta()
  if (cajaCheck.error || !cajaCheck.caja) return { venta: null, error: cajaCheck.error ?? "No hay caja abierta" }
  if (!input.items?.length) return { venta: null, error: "El carrito esta vacio" }

  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    const actorNombre = await getCurrentActorDisplayName()
    await ensureAllPosTablesExist()

    const nextRows = await prisma.$queryRawUnsafe<Array<{ folio: string }>>(
      "SELECT get_next_venta_folio($1) AS folio",
      tallerId,
    )
    const folio = nextRows[0]?.folio
    if (!folio) return { venta: null, error: "No se pudo generar folio" }

    const insertedVenta = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO ventas
       (taller_id, caja_id, folio, cliente_nombre, cliente_id, cliente_telefono, total, descuento, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, cambio, vendedor_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, created_at`,
      tallerId,
      input.caja_id ?? null,
      folio,
      input.cliente_nombre ?? null,
      input.cliente_id ?? null,
      input.cliente_telefono ?? null,
      input.total,
      input.descuento ?? 0,
      input.metodo_pago,
      input.monto_efectivo,
      input.monto_tarjeta,
      input.monto_transferencia,
      input.cambio,
      actorNombre,
    )
    const ventaId = String(insertedVenta[0].id)

    for (const item of input.items) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO detalle_ventas
         (venta_id, producto_id, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, es_especial, imei_serie, color, condicion, marca, modelo, categoria, procesador, ram, almacenamiento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        ventaId,
        item.producto_id ?? null,
        item.descripcion,
        item.cantidad,
        item.precio_unitario,
        item.costo_unitario,
        item.precio_unitario * item.cantidad,
        item.es_especial,
        item.imei_serie ?? null,
        item.color ?? null,
        item.condicion ?? null,
        item.marca ?? null,
        item.modelo ?? null,
        item.categoria ?? null,
        item.procesador ?? null,
        item.ram ?? null,
        item.almacenamiento ?? null,
      )
    }

    const stockItems = input.items.filter((item) => item.producto_id && !item.es_especial)
    if (stockItems.length > 0) {
      try {
        await prisma.$queryRawUnsafe("SELECT batch_decrement_stock($1::jsonb)", JSON.stringify(stockItems.map((i) => ({ producto_id: i.producto_id, taller_id: tallerId, cantidad: i.cantidad }))))
      } catch {
        console.error("[ventas-prisma] batch_decrement_stock fallback - RPC not available")
      }
    }

    if (input.caja_id) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE caja
           SET total_efectivo = total_efectivo + $1,
               total_tarjeta = total_tarjeta + $2,
               total_transferencia = total_transferencia + $3,
               total_ventas = total_ventas + 1
           WHERE id = $4 AND taller_id = $5`,
          input.monto_efectivo - input.cambio,
          input.monto_tarjeta,
          input.monto_transferencia,
          input.caja_id,
          tallerId,
        )
      } catch {
        console.error("[ventas-prisma] update caja totals fallback - caja table may be missing")
      }

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO movimientos_caja (taller_id, caja_id, tipo, referencia_id, descripcion, monto, metodo_pago, fecha)
           VALUES ($1,$2,'venta_pdv',$3,$4,$5,$6,now())`,
          tallerId,
          input.caja_id,
          ventaId,
          `Venta ${folio}${input.cliente_nombre ? ` - ${input.cliente_nombre}` : ""}`,
          input.total,
          input.metodo_pago,
        )
      } catch {
        console.error("[ventas-prisma] insert movimiento_caja fallback - table may be missing")
      }
    }

    revalidatePath("/dashboard/historial-ventas")

    return {
      venta: {
        id: ventaId,
        folio,
        total: input.total,
        descuento: input.descuento ?? 0,
        metodo_pago: input.metodo_pago,
        monto_efectivo: input.monto_efectivo,
        monto_tarjeta: input.monto_tarjeta,
        monto_transferencia: input.monto_transferencia,
        cambio: input.cambio,
        created_at: String(insertedVenta[0].created_at),
        items: input.items,
        cliente_nombre: input.cliente_nombre,
        cliente_telefono: input.cliente_telefono,
      },
      error: null,
    }
  } catch (error) {
    console.error("[ventas-prisma] crearVenta:", error instanceof Error ? error.message : String(error))
    return { venta: null, error: error instanceof Error ? error.message : "Error al crear venta" }
  }
}

export async function getHistorialCaja(page = 0, pageSize = 30): Promise<{ data: HistorialCajaItem[]; error: string | null; total: number }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const from = page * pageSize

    const data = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM caja
       WHERE taller_id = $1 AND estado = 'cerrada'
       ORDER BY fecha_apertura DESC
       OFFSET $2 LIMIT $3`,
      tallerId,
      from,
      pageSize,
    )
    const totalRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      "SELECT COUNT(*)::int AS total FROM caja WHERE taller_id = $1 AND estado = 'cerrada'",
      tallerId,
    )

    const mapped: HistorialCajaItem[] = data.map((row) => {
      const montoInicial = toNum(row.monto_inicial)
      const saldoFinal = montoInicial + toNum(row.total_efectivo)
      return {
        id: String(row.id),
        numero_corte: row.numero_corte == null ? null : toNum(row.numero_corte),
        fecha_apertura: String(row.fecha_apertura),
        fecha_cierre: row.fecha_cierre == null ? null : String(row.fecha_cierre),
        estado: row.estado === "cerrada" ? "cerrada" : "abierta",
        monto_inicial: montoInicial,
        monto_cierre: row.monto_cierre == null ? null : toNum(row.monto_cierre),
        nota_cierre: row.nota_cierre == null ? null : String(row.nota_cierre),
        total_efectivo: toNum(row.total_efectivo),
        total_tarjeta: toNum(row.total_tarjeta),
        total_transferencia: toNum(row.total_transferencia),
        total_ventas: toNum(row.total_ventas),
        saldo_final: saldoFinal,
      }
    })

    return { data: mapped, error: null, total: totalRows[0]?.total ?? 0 }
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : "Error historial caja", total: 0 }
  }
}

export async function getDetalleCaja(cajaId: string): Promise<{ data: DetalleCajaData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const cajas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM caja WHERE id=$1 AND taller_id=$2 LIMIT 1", cajaId, tallerId)
    const caja = cajas[0]
    if (!caja) return { data: null, error: "Caja no encontrada" }

    const ventas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, folio, cliente_nombre, total, metodo_pago, monto_efectivo, monto_tarjeta, monto_transferencia, created_at
       FROM ventas WHERE caja_id=$1 AND taller_id=$2 AND estado='activa' ORDER BY created_at ASC`,
      cajaId,
      tallerId,
    )
    const movimientos = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, tipo, descripcion, monto, metodo_pago, fecha
       FROM movimientos_caja WHERE caja_id=$1 AND taller_id=$2 ORDER BY fecha ASC`,
      cajaId,
      tallerId,
    )

    return {
      data: {
        caja: {
          id: String(caja.id),
          numero_corte: caja.numero_corte == null ? null : toNum(caja.numero_corte),
          fecha_apertura: String(caja.fecha_apertura),
          fecha_cierre: caja.fecha_cierre == null ? null : String(caja.fecha_cierre),
          estado: caja.estado === "cerrada" ? "cerrada" : "abierta",
          monto_inicial: toNum(caja.monto_inicial),
          monto_cierre: caja.monto_cierre == null ? null : toNum(caja.monto_cierre),
          nota_cierre: caja.nota_cierre == null ? null : String(caja.nota_cierre),
          total_efectivo: toNum(caja.total_efectivo),
          total_tarjeta: toNum(caja.total_tarjeta),
          total_transferencia: toNum(caja.total_transferencia),
          total_ventas: toNum(caja.total_ventas),
          saldo_final: toNum(caja.monto_inicial) + toNum(caja.total_efectivo),
        },
        ventas: ventas.map((v) => ({
          id: String(v.id),
          folio: String(v.folio ?? ""),
          cliente_nombre: v.cliente_nombre == null ? null : String(v.cliente_nombre),
          total: toNum(v.total),
          metodo_pago: String(v.metodo_pago ?? ""),
          monto_efectivo: toNum(v.monto_efectivo),
          monto_tarjeta: toNum(v.monto_tarjeta),
          monto_transferencia: toNum(v.monto_transferencia),
          created_at: String(v.created_at),
        })),
        movimientos: movimientos.map((m) => ({
          id: String(m.id),
          tipo: String(m.tipo ?? ""),
          descripcion: m.descripcion == null ? null : String(m.descripcion),
          monto: toNum(m.monto),
          metodo_pago: m.metodo_pago == null ? null : String(m.metodo_pago),
          fecha: String(m.fecha),
        })),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error detalle caja" }
  }
}

export async function getAbonoById(movimientoId: string): Promise<{ data: AbonoPrintData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const movRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM movimientos_caja WHERE id=$1 AND taller_id=$2 LIMIT 1", movimientoId, tallerId)
    const mov = movRows[0]
    if (!mov) return { data: null, error: "Movimiento no encontrado." }
    const repRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT folio, cliente_nombre, cliente_telefono, marca, modelo, tipo_equipo, precio_estimado, anticipo FROM reparaciones WHERE id=$1 AND taller_id=$2 LIMIT 1", String(mov.referencia_id ?? ""), tallerId)
    const rep = repRows[0]
    if (!rep) return { data: null, error: "Reparacion no encontrada." }

    const presupuesto = toNum(rep.precio_estimado)
    const totalAbonado = toNum(rep.anticipo)
    return { data: {
      movimientoId: String(mov.id),
      folio: String(rep.folio ?? ""),
      clienteNombre: String(rep.cliente_nombre ?? ""),
      clienteTelefono: String(rep.cliente_telefono ?? ""),
      dispositivo: `${String(rep.tipo_equipo ?? "")} ${String(rep.marca ?? "")} ${String(rep.modelo ?? "")}`.trim(),
      metodoPago: String(mov.metodo_pago ?? "efectivo"),
      monto: toNum(mov.monto),
      totalAbonado,
      presupuesto,
      saldoRestante: Math.max(0, presupuesto - totalAbonado),
      fecha: String(mov.fecha),
    }, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al obtener abono" }
  }
}

export async function getCajaConDetalle(cajaId: string): Promise<{ data: CortePrintData | null; error: string | null }> {
  const detalle = await getDetalleCaja(cajaId)
  if (!detalle.data || detalle.error) return { data: null, error: detalle.error ?? "Corte no encontrado." }
  const c = detalle.data.caja
  const ventas = detalle.data.ventas.map((v) => ({ id: v.id, folio: v.folio, created_at: v.created_at, total: v.total, metodo_pago: v.metodo_pago }))
  return {
    data: {
      numero_corte: c.numero_corte ?? 0,
      fecha_apertura: c.fecha_apertura,
      fecha_cierre: c.fecha_cierre ?? new Date().toISOString(),
      monto_inicial: c.monto_inicial,
      total_ventas: c.total_ventas,
      total_efectivo: c.total_efectivo,
      total_tarjeta: c.total_tarjeta,
      total_transferencia: c.total_transferencia,
      total_abonos: 0,
      total_abonos_efectivo: 0,
      total_abonos_tarjeta: 0,
      total_abonos_transferencia: 0,
      total_gastos: 0,
      saldo_final: c.saldo_final,
      monto_cierre: c.monto_cierre,
      nota_cierre: c.nota_cierre ?? undefined,
      cobrosRep: [],
      listaGastos: [],
      ventas,
      totalVentasPdv: ventas.reduce((sum, v) => sum + v.total, 0),
    },
    error: null,
  }
}

export async function getVentaLabelData(ventaId: string): Promise<{ data: VentaLabelFetchData | null; error: string | null }> {
  const ticket = await getVentaParaTicket(ventaId)
  if (!ticket.venta || ticket.error) return { data: null, error: ticket.error }
  return {
    data: {
      id: ticket.venta.id,
      folio: ticket.venta.folio,
      cliente_nombre: ticket.venta.cliente_nombre ?? null,
      items: ticket.venta.items.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
      total: ticket.venta.total,
      created_at: ticket.venta.created_at,
    },
    error: null,
  }
}

export async function canAnularVentas(): Promise<boolean> {
  const tallerId = await getCurrentTallerId()
  return Boolean(tallerId)
}

export async function getVentaParaTicket(ventaId: string): Promise<{ venta: VentaCreada | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const ventas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM ventas WHERE id=$1 AND taller_id=$2 LIMIT 1", ventaId, tallerId)
    const venta = ventas[0]
    if (!venta) return { venta: null, error: "Venta no encontrada." }
    if (String(venta.estado ?? "") === "anulado") return { venta: null, error: "Esta venta fue anulada." }
    const detalles = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT producto_id, descripcion, cantidad, precio_unitario, costo_unitario, es_especial, imei_serie, color, condicion, marca, modelo, procesador, ram, almacenamiento FROM detalle_ventas WHERE venta_id=$1", ventaId)
    return {
      venta: {
        id: String(venta.id),
        folio: String(venta.folio ?? ""),
        total: toNum(venta.total),
        descuento: toNum(venta.descuento),
        metodo_pago: String(venta.metodo_pago ?? "efectivo"),
        monto_efectivo: toNum(venta.monto_efectivo),
        monto_tarjeta: toNum(venta.monto_tarjeta),
        monto_transferencia: toNum(venta.monto_transferencia),
        cambio: toNum(venta.cambio),
        created_at: String(venta.created_at),
        items: detalles.map((d) => ({
          producto_id: d.producto_id == null ? undefined : String(d.producto_id),
          descripcion: String(d.descripcion ?? ""),
          cantidad: toNum(d.cantidad),
          precio_unitario: toNum(d.precio_unitario),
          costo_unitario: toNum(d.costo_unitario),
          es_especial: Boolean(d.es_especial),
          imei_serie: d.imei_serie == null ? undefined : String(d.imei_serie),
          color: d.color == null ? undefined : String(d.color),
          condicion: d.condicion == null ? undefined : String(d.condicion),
          marca: d.marca == null ? undefined : String(d.marca),
          modelo: d.modelo == null ? undefined : String(d.modelo),
          procesador: d.procesador == null ? undefined : String(d.procesador),
          ram: d.ram == null ? undefined : String(d.ram),
          almacenamiento: d.almacenamiento == null ? undefined : String(d.almacenamiento),
        })),
        cliente_nombre: venta.cliente_nombre == null ? undefined : String(venta.cliente_nombre),
        cliente_telefono: venta.cliente_telefono == null ? undefined : String(venta.cliente_telefono),
      },
      error: null,
    }
  } catch (error) {
    return { venta: null, error: error instanceof Error ? error.message : "Error al obtener venta" }
  }
}

export async function getCobroReparacionParaTicket(movimientoId: string): Promise<{ data: CobroReparacionTicketData | null; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT * FROM movimientos_caja WHERE id=$1 AND taller_id=$2 LIMIT 1", movimientoId, tallerId)
    const m = rows[0]
    if (!m) return { data: null, error: "Movimiento no encontrado." }
    const tipo = String(m.tipo ?? "")
    if (tipo !== "anticipo_reparacion" && tipo !== "liquidacion_reparacion") return { data: null, error: "Este movimiento no es un cobro de reparacion." }
    let folio = "-"
    let cliente = "-"
    const rid = m.referencia_id == null ? null : String(m.referencia_id)
    if (rid) {
      const reps = await prisma.$queryRawUnsafe<Record<string, unknown>[]>("SELECT folio, cliente_nombre FROM reparaciones WHERE id=$1 AND taller_id=$2 LIMIT 1", rid, tallerId)
      if (reps[0]) {
        folio = String(reps[0].folio ?? "-")
        cliente = String(reps[0].cliente_nombre ?? "-")
      }
    }
    return {
      data: {
        folio,
        cliente,
        conceptos: tipo === "liquidacion_reparacion" ? "Liquidacion" : "Anticipo",
        monto: toNum(m.monto),
        metodo_pago: String(m.metodo_pago ?? "efectivo"),
        fechaIso: String(m.fecha ?? ""),
        tipoMov: tipo === "liquidacion_reparacion" ? "liquidacion" : "anticipo",
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Error al obtener cobro" }
  }
}

export async function anularVenta(ventaId: string, motivo?: string | null): Promise<{ success: boolean; error: string | null }> {
  try {
    const prisma = getPrismaClient()
    const tallerId = await getCurrentTallerId()
    await ensureAllPosTablesExist()
    const resp = await prisma.$queryRawUnsafe<Array<{ ok: boolean; error?: string }>>(
      "SELECT * FROM anular_venta_pdv($1,$2,$3,$4)",
      ventaId,
      tallerId,
      tallerId,
      motivo ?? null,
    )
    const payload = resp[0]
    if (!payload?.ok) return { success: false, error: payload?.error ?? "No se pudo anular la venta." }
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Error al anular venta" }
  }
}

export async function cancelarVentaMostrador(ventaId: string) {
  return anularVenta(ventaId, null)
}

export async function reenviarCorteEmail(_cajaId?: string): Promise<{ success: boolean; sentTo?: string; error?: string }> {
  return { success: false, error: "Funcion PRO temporalmente desactivada" }
}


