# Legacy Files Cleanup — Delete at End of Migration

> Inventario completo de archivos legacy (Supabase híbrido) que deben eliminarse al concluir todas las fases de migración a Prisma nativo. Organizado por módulo.

## Reglas

1. **No borrar hasta que todos los módulos estén migrados y probados.**
2. Cada archivo legacy tiene un archivo `-prisma.ts` que lo reemplaza.
3. Verificar que ningún import activo apunte al archivo legacy antes de borrar.
4. Los archivos en `_archive/` no se tocan (son respaldo histórico).

---

## CORE MODULES

### Servicios ✅ (Fase 1 completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/servicios.ts` | 238 | `servicios-prisma.ts` | ✅ Listo para borrar |

### Reparaciones ✅ (completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/repairs.ts` | 2906 | `repairs-prisma.ts` | ✅ Listo para borrar |

### Ventas / POS ✅ (completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/ventas.ts` | 2153 | `ventas-prisma.ts` | ✅ **Ya eliminado** |

### Gastos ✅ (completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/gastos.ts` | 327 | `gastos-prisma.ts` | ✅ Listo para borrar |

### Clientes ✅ (completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/clients.ts` | 195 | `clients-prisma.ts` | ✅ Listo para borrar |

### Configuración ✅ (completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/settings.ts` | 323 | `settings-prisma.ts` | ✅ Listo para borrar |

### Auth / Seguridad

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/auth.ts` | 536 | `auth-prisma.ts` | 🟡 Verificar imports activos |
| `lib/actions/email-verification.ts` | 155 | — | 🔴 Pendiente migración |
| `lib/auth/get-current-taller.ts` | 111 | — | 🔴 Pendiente migración |
| `lib/auth-server.ts` | 46 | — | 🔴 Pendiente migración |
| `lib/storage-server.ts` | 51 | — | 🔴 Pendiente migración |

---

## PRO MODULES

### Control de Utilidad ✅ (Fase 2 completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/utilidad.ts` | 172 | `utilidad-prisma.ts` | ✅ Listo para borrar |

### Reportes ✅ (Fase 3 completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/reportes.ts` | 311 | `reportes-prisma.ts` | ✅ Listo para borrar |

### Bitácora de Visitas ✅ (Fase 4 completada)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/bitacora-visitas.ts` | 231 | `bitacora-visitas-prisma.ts` | ✅ Listo para borrar |
| `app/api/visitas/detect/route.ts` | 88 | — | 🔴 API route |
| `app/api/sse/visitas/route.ts` | 76 | — | 🔴 API route (SSE) |
| `app/api/alarms/hikvision/[tallerId]/route.ts` | ~200 | — | 🔴 API route |

### Chat Taller ⏳ (Fase 5)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/chat.ts` | 157 | `chat-prisma.ts` | ⏳ Pendiente |

### Compras ⏳ (Fase 6)

| Archivo Legacy | Líneas | Reemplazado por | Estado |
|----------------|--------|----------------|--------|
| `lib/actions/compras.ts` | 705 | `compras-prisma.ts` | ⏳ Pendiente |
| `lib/actions/compras-usado.ts` | 142 | `compras-usado-prisma.ts` | ⏳ Pendiente |

### Mercado ⏳ (Fase 7)

Sin archivos legacy (solo placeholder).

---

## ─prisma.ts FILES WITH REMAINING RAW SQL

Estos archivos ya están en Prisma pero aún usan `$queryRawUnsafe`/`$executeRawUnsafe`. Deben limpiarse durante la migración de sus respectivos módulos.

| Archivo | Raw SQL Calls | Módulo | Estado |
|---------|--------------|--------|--------|
| `lib/actions/compras-prisma.ts` | 22 (12 + 10) | Compras | ⏳ Fase 6 |
| `lib/actions/compras-usado-prisma.ts` | 5 (3 + 2) | Compras | ⏳ Fase 6 |
| `lib/actions/productos-prisma.ts` | 1 | Inventario | 🟡 Pendiente |
| `lib/actions/historial-ventas.ts` | 4 | Historial Ventas | 🟡 Pendiente |

---

## SUPPORT FILES (no reemplazo directo)

Estos archivos no tienen un equivalente `-prisma.ts` pero usan Supabase y deben evaluarse:

| Archivo | Líneas | Uso |
|---------|--------|-----|
| `lib/actions/cotizaciones.ts` | 393 | CRUD cotizaciones (usa Supabase) |
| `lib/actions/firma-digital.ts` | 157 | Firma digital (usa Supabase) |
| `lib/actions/flujo-pro.ts` | 74 | Ajustes FlujoPro (usa Supabase, 1 query) |
| `lib/actions/roles.ts` | 115 | Roles taller (usa Supabase) |
| `lib/actions/import.ts` | 146 | Importación masiva (usa Supabase) |
| `lib/actions/admin-otp.ts` | 156 | Admin OTP (usa raw SQL en Prisma) |
| `lib/caja/guard.ts` | 79 | Guard de caja (usa Supabase) |
| `app/garantia/[id]/view.tsx` | 433 | Página de garantía (usa Supabase RPC) |
| `app/api/generate-poster/route.ts` | 346 | API route (usa Supabase) |

---

## SUABASE CLIENT DEFINITIONS (lib/supabase/)

Se eliminan solo cuando ningún archivo activo los importe:

| Archivo | Líneas |
|---------|--------|
| `lib/supabase/admin.ts` | 21 |
| `lib/supabase/client.ts` | 7 |
| `lib/supabase/server.ts` | 33 |
| `lib/supabase/tenant-client.ts` | 65 |

---

## SUMMARY BY PHASE

| Fase | Archivos a eliminar | Líneas totales |
|------|--------------------|---------------|
| ✅ Core ya completados | `repairs.ts`, `gastos.ts`, `clients.ts`, `settings.ts`, `servicios.ts` | ~3989 |
| ✅ Fase 2 — Utilidad | `utilidad.ts` | ~172 |
| ✅ Fase 3 — Reportes | `reportes.ts` | ~311 |
| ✅ Fase 4 — Visitas | `bitacora-visitas.ts` + API routes | ~600 |
| ⏳ Fase 5 — Chat | `chat.ts` | ~157 |
| ⏳ Fase 6 — Compras | `compras.ts`, `compras-usado.ts` | ~847 |
| 🧹 Post-migración | Support files + supabase clients | ~1800 |
| **TOTAL** | **~20 archivos** | **~7900 líneas** |
