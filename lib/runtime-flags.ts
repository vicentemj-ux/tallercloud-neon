export const PRO_FEATURES_TEMP_DISABLED = true

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

// Caja se mantiene únicamente dentro del módulo de Ventas durante la migración.
export const GLOBAL_CAJA_GUARD_DISABLED = true
