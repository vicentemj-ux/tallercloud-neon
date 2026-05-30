export const PRO_FEATURES_TEMP_DISABLED = false

export const PRO_DISABLED_ROUTES = [
  "/dashboard/bitacora-visitas",
  "/dashboard/chat",
  "/dashboard/cotizaciones",
  "/dashboard/compras",
  "/dashboard/utilidad",
  "/dashboard/mercado",
  "/dashboard/reportes",
  "/dashboard/servicios",
] as const

// Caja se mantiene unicamente dentro del modulo de Ventas durante la migracion.
export const GLOBAL_CAJA_GUARD_DISABLED = true
