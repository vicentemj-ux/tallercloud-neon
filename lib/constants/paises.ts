export interface PaisInfo {
  nombre: string
  codigoTelefono: string
}

export const PAISES: PaisInfo[] = [
  { nombre: "México", codigoTelefono: "52" },
  { nombre: "Argentina", codigoTelefono: "54" },
  { nombre: "Bolivia", codigoTelefono: "591" },
  { nombre: "Chile", codigoTelefono: "56" },
  { nombre: "Colombia", codigoTelefono: "57" },
  { nombre: "Costa Rica", codigoTelefono: "506" },
  { nombre: "Cuba", codigoTelefono: "53" },
  { nombre: "Ecuador", codigoTelefono: "593" },
  { nombre: "El Salvador", codigoTelefono: "503" },
  { nombre: "Estados Unidos", codigoTelefono: "1" },
  { nombre: "Guatemala", codigoTelefono: "502" },
  { nombre: "Honduras", codigoTelefono: "504" },
  { nombre: "Nicaragua", codigoTelefono: "505" },
  { nombre: "Panamá", codigoTelefono: "507" },
  { nombre: "Paraguay", codigoTelefono: "595" },
  { nombre: "Perú", codigoTelefono: "51" },
  { nombre: "Puerto Rico", codigoTelefono: "1" },
  { nombre: "República Dominicana", codigoTelefono: "1" },
  { nombre: "Uruguay", codigoTelefono: "598" },
  { nombre: "Venezuela", codigoTelefono: "58" },
  { nombre: "España", codigoTelefono: "34" },
]

export function getCodigoTelefono(paisNombre: string): string {
  const p = PAISES.find((p) => p.nombre === paisNombre)
  return p?.codigoTelefono ?? "52"
}

export const ESTADOS_MEXICO = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
  "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "México",
  "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla",
  "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora",
  "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
]

export function getPaisesNombres(): string[] {
  return PAISES.map((p) => p.nombre)
}
