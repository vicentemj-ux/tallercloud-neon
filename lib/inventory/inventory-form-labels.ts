/**
 * Etiquetas neutras / dinámicas según categoría (sin amarrar a marcas comerciales).
 */
export function getInventoryFieldLabels(categoria: string) {
  const cat = (categoria || "").trim().toUpperCase()

  if (cat === "EQUIPOS") {
    return {
      marca: "Marca del equipo",
      modelo: "Modelo o referencia",
      condicion: "Condición del equipo",
      ubicacion: "Ubicación en almacén",
      procesador: "Procesador / SoC",
      ram: "Memoria RAM",
      almacenamiento: "Almacenamiento",
      color: "Color / acabado",
    }
  }

  if (cat === "REFACCIONES" || cat === "PANTALLAS" || cat === "BATERIAS") {
    return {
      marca: "Marca compatible",
      modelo: "Referencia / modelo",
      condicion: "Condición",
      ubicacion: "Ubicación en almacén",
      procesador: "Especificación principal",
      ram: "Detalle adicional",
      almacenamiento: "Capacidad / tamaño",
      color: "Color",
    }
  }

  return {
    marca: "Marca / fabricante",
    modelo: "Modelo o referencia",
    condicion: "Condición",
    ubicacion: "Ubicación en almacén",
    procesador: "Especificación 1",
    ram: "Especificación 2",
    almacenamiento: "Especificación 3",
    color: "Color / variante",
  }
}
