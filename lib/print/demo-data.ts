/**
 * Datos de demostración para la vista previa en tiempo real del módulo IMPRENTA.
 * Cada tipo de documento tiene un mock realista para renderizar su template.
 */

import type { TicketRecepcionData } from "@/components/print-templates/TicketRecepcionTemplate"
import type { VentaCreada } from "@/lib/actions/ventas"
import type { LabelRepairTemplateData } from "@/components/print-templates/LabelRepairTemplate"
import type { ProductSaleLabelTemplateData } from "@/components/print-templates/ProductSaleLabelTemplate"

export type DocumentType = "reparacion" | "venta" | "compra" | "etiqueta" | "barras"

export interface PurchaseTicketData {
  folio: string
  fecha: string
  vendedor: string
  documento: string
  marca: string
  modelo: string
  serial: string
  imei: string
  monto: number
  condicion: string
  color: string
  capacidad: string
  observaciones: string
}

export const DEMO_REPARACION: TicketRecepcionData = {
  folio: "REP-00152",
  customerName: "Juan Pérez García",
  customerPhone: "6681234567",
  deviceModel: "iPhone 14 Pro",
  deviceBrand: "Apple",
  tipo_equipo: "smartphone",
  imei: "35 123402 123456 7",
  color: "Morado oscuro",
  reportedFault: "No enciende, posible daño en placa lógica tras caída. Cliente reporta que se apagó y no respondió.",
  falla: "No enciende",
  estimatedPrice: "2,850.00",
  deposit: "500.00",
  date: new Date().toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
  repairId: "rep-demo-123",
}

export const DEMO_VENTA: VentaCreada = {
  id: "venta-demo-456",
  folio: "V-00842",
  total: 3850.0,
  descuento: 0,
  metodo_pago: "tarjeta",
  monto_efectivo: 0,
  monto_tarjeta: 3850.0,
  monto_transferencia: 0,
  cambio: 0,
  created_at: new Date().toISOString(),
  cliente_nombre: "María Elena Rodríguez",
  cliente_telefono: "6689876543",
  items: [
    {
      descripcion: "Pantalla iPhone 13 Original",
      cantidad: 1,
      precio_unitario: 2850.0,
      costo_unitario: 1800.0,
      es_especial: false,
      marca: "Apple",
      modelo: "iPhone 13",
      color: "Negro",
    },
    {
      descripcion: "Mica de Cristal Templado",
      cantidad: 2,
      precio_unitario: 150.0,
      costo_unitario: 45.0,
      es_especial: false,
    },
    {
      descripcion: "Servicio de instalación",
      cantidad: 1,
      precio_unitario: 200.0,
      costo_unitario: 0,
      es_especial: true,
    },
  ],
}

export const DEMO_COMPRA: PurchaseTicketData = {
  folio: "C-00091",
  fecha: new Date().toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
  vendedor: "Carlos Alberto Méndez López",
  documento: "INE 12345678901",
  marca: "Samsung",
  modelo: "Galaxy S23 Ultra",
  serial: "R52RA00ABCD1",
  imei: "35 890701 234567 8",
  monto: 4200.0,
  condicion: "Usado - Buen estado",
  color: "Verde",
  capacidad: "256 GB",
  observaciones: "Equipo desbloqueado de fábrica. Sin cuenta Samsung vinculada. Batería al 87% de salud.",
}

export const DEMO_ETIQUETA: LabelRepairTemplateData = {
  folio: "REP-00152",
  deviceName: "iPhone 14 Pro",
  customerName: "Juan Pérez",
  customerPhone: "6681234567",
  reportedFault: "No enciende - daño en placa",
  estimatedPrice: "2850",
  accessCode: "PIN: 2580",
  extras: "Sin funda",
  tallerName: "Electrónica del Centro",
}

export const DEMO_BARRAS: ProductSaleLabelTemplateData = {
  kind: "product-sale-label",
  shopName: "Electrónica del Centro",
  deviceName: "iPhone 13 128GB",
  marca: "Apple",
  modelo: "iPhone 13",
  imei: "35 123402 123456 7",
  color: "Medianoche",
  condicion: "Seminuevo",
  capacidad: "128 GB",
  procesador: "A15 Bionic",
  ram: "4 GB",
  almacenamiento: "128 GB",
  precio: 9850.0,
  folio: "EQ-0045",
}

export function getDemoData(type: DocumentType) {
  switch (type) {
    case "reparacion":
      return DEMO_REPARACION
    case "venta":
      return DEMO_VENTA
    case "compra":
      return DEMO_COMPRA
    case "etiqueta":
      return DEMO_ETIQUETA
    case "barras":
      return DEMO_BARRAS
    default:
      return DEMO_REPARACION
  }
}
