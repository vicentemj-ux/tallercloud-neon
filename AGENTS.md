# AGENTS.md

Quick reference for agents working on TallerCloud. See CLAUDE.md for full project context.

## Product Direction

- TallerCloud is a multi-tenant SaaS for repair shops and related stores: cell phones, computers, video game consoles, electronics, parts, accessories, and services.
- Public site: `tallercloud.net`. Registration is open with a 30-day free trial.
- Commercial focus starts in Mexico, but the SaaS must support LATAM countries. Uruguay is already an early validation case.
- Subscription plans: **Normal** and **Pro**. The 30-day trial should provide full Pro access so users can decide which plan fits.
- Normal should cover complete core operation for a small shop. Pro should add automation, scale, advanced reporting, workflow depth, and premium capabilities.
- Keep SaaS decisions separate from local hardware needs. Tauri/Rust hardware integration is mainly a side project for CDSE, Reparatech, and Electronica Morelos.
- Full product strategy lives in `docs/PRODUCT_STRATEGY.md`.

### Module Map

- Core/general: Vista General, Mi Suscripcion, Ventas (POS), Reparaciones, Historial de Ventas, Inventario, Clientes, Bitacora de Gastos, Mi Equipo, Configuracion.
- Pro: Bitacora de Visitas, Chat Taller, Compras, Control de Utilidad, Mercado, Reportes, Servicios.
- Bitacora de Visitas goal: every customer visit must be logged efficiently; future control should block daily cash closing if the day's visits are incomplete.
- Mercado direction is still undecided: either internal TallerCloud marketplace between tenants or public shop pages under `tallercloud.net` subdomains.

## Commands

```bash
pnpm dev              # Next.js dev server (localhost:3000)
pnpm build           # Production build
pnpm lint            # ESLint
```

> No automated tests in this project.

## Critical Conventions

- **Never use `createAdminClient()`** except in `/admin` routes and `/tracking` pages
- **Always use `createTenantClient(tallerId)` or `createCurrentTenantClient()`** in Server Actions for tenant isolation
- **Never query `inventario` table** — it doesn't exist. Use `productos` table for inventory
- **Use `imprimirTicket()`** from `lib/print.ts` for all printing (iframe method for thermal printers)
- **WhatsApp links must use:** `https://api.whatsapp.com/send?phone=...` with normalized international numbers. Mexico default is `52`, but do not hard-code it for all tenants.

## Database Gotchas

- `ventas`, `caja`, `movimientos_caja` have `taller_id` as **text**, not UUID
- All other tables with `taller_id` use UUID type
- RLS policies on `ventas`/`caja` tables do NOT cast to UUID — don't add `::uuid`
- RPC functions: `get_dashboard_stats`, `get_next_folio`, `batch_decrement_stock`

## UI Patterns

- Page container: `<div className="min-h-screen bg-slate-50"><div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">`
- Tables: wrap in `w-full overflow-x-auto` for mobile scroll
- POS: `flex flex-col lg:flex-row gap-6` (mobile: carousel below, desktop: two columns)
- Accent color: `bg-blue-600` / `text-blue-600` (strict corporate palette)

### Toast Notifications
- **TallerCloud usa Sonner** (`components/ui/sonner.tsx`) con estilo oscuro pill global.
- Todos los `toast.success()` aparecen con fondo `slate-900/95`, bordes redondeados `9999px`, título en `uppercase tracking-widest`.
- Iconos custom: `CheckCircle2` (emerald) para success, `XCircle` (red) para error.
- No usar `richColors` — el estilo se controla vía `toastOptions.classNames`.
- Para llamar: `import { toast } from "@/hooks/use-toast"` (wrapper legacy-compat).

### Botones Primarios (Glow Effect)
- Los botones de acción principal (Guardar, Registrar, etc.) deben incluir la clase **`btn-glow`**.
- El efecto es un pseudo-elemento `::before` con `radial-gradient` + `filter: blur` que se expande en hover.
- Ejemplo: `<Button className="bg-blue-600 hover:bg-blue-700 text-white btn-glow">Guardar</Button>`
- Definición en `app/globals.css` (sección "Glow premium en botones primarios").

## Offline Support

IndexedDB at `lib/offline/` stores repair drafts and sync queue. Fails silently if unavailable.

## Security Notes

- JWT signed with `SUPABASE_JWT_SECRET` contains `taller_id` claim
- JWT expires in 1 hour, regenerated per request
- Rate limiting on 5 auth endpoints
- All tenant-scoped queries MUST include `taller_id` filter
- Google OAuth auto-provisions tenant+user+configuracionTaller in `signIn` callback (`lib/auth.ts`)

## Env Vars Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
RESEND_API_KEY
NEXT_PUBLIC_SUPABASE_INVENTORY_BUCKET (default: "inventario")
AUTH_GOOGLE_ID               # Google OAuth client ID (for Google sign-in)
AUTH_GOOGLE_SECRET           # Google OAuth client secret
```

---

## Versionado y Roadmap Tauri

> **Esta sección es contexto permanente del proyecto.**

| Versión | Estado | Descripción |
|---------|--------|-------------|
| **v1.1** | Actual (checkpoint) | Web-only (Next.js + Supabase). Última versión estable antes de Tauri. Tag: `v1.1.0` |
| **v1.2** | En desarrollo | Desktop híbrido Windows (Tauri v2 + Next.js). Commands nativos para hardware. |

### Arquitectura v1.2 (Tauri)

```
tallercloud/
├── src/                     # Next.js app (web + desktop UI)
├── src-tauri/               # Rust + Tauri (desktop shell)
│   ├── src/commands/
│   │   ├── print.rs         # ESC/POS → 2 impresoras térmicas USB
│   │   ├── camera.rs        # Webcam local + RTSP IP PTZ (Hikvision)
│   │   └── system.rs
│   └── capabilities/
├── lib/tauri/               # Wrapper TypeScript para invoke()
│   ├── print.ts
│   ├── camera.ts
│   └── index.ts
```

### Commands Rust Planificados

- `print_ticket(printer_id, raw_escpos)` — Imprime bytes ESC/POS a impresora USB genérica
- `list_printers()` — Lista impresoras USB térmicas disponibles
- `capture_webcam(device_id?, resolution)` — Captura foto desde webcam local
- `connect_rtsp(url)` — Conecta a stream RTSP de cámara IP Hikvision
- `rtsp_ptz_control(stream_id, action, speed)` — Control PTZ (pan/tilt/zoom)

### Estrategia de Impresión

- **Web (celular/tablet)**: `react-to-print` vía iframe (comportamiento actual)
- **Desktop (Windows)**: Tauri command `print_escpos_ticket` genera bytes ESC/POS en Rust y los envía vía `WritePrinter` (API Windows) al driver de la impresora seleccionada. Calidad máxima, sin diálogos.
- Detección de entorno: `if (window.__TAURI__)` → usar invoke; fallback → iframe
- **2 impresoras configurables**: `impresora_ticket` (80mm) y `impresora_etiqueta` (2x1") en tabla `configuracion_taller`

### Hardware Soportado (v1.2)

| Dispositivo | Tipo | Conexión | Driver Windows | Estado |
|-------------|------|----------|---------------|--------|
| Impresora térmica 1 (Ticket 80mm) | Genérica china ESC/POS | USB | ✅ Requerido | En desarrollo |
| Impresora térmica 2 (Etiqueta 2x1") | Genérica china ESC/POS | USB | ✅ Requerido | En desarrollo |
| Webcam | Recepción de reparaciones | USB | — | Pendiente |
| Cámara IP PTZ | Hikvision | RTSP (red) | — | Pendiente (sin instalar) |

> **IMPORTANTE**: Las impresoras DEBEN tener driver Windows instalado (aparecer en "Dispositivos e Impresoras"). TallerCloud envía bytes ESC/POS generados en Rust a través de la API `WritePrinter` de Windows, que pasa por el driver nativo para máxima calidad. NUNCA se usa USB bulk directo (rusb).

### Convenciones Tauri

- Usar **Tauri v2** (stable)
- Frontend sigue siendo **Next.js**
- **BLOQUEADOR v1.2**: `output: 'export'` requiere migrar todas las Server Actions a llamadas Supabase cliente (el proyecto usa ~40 Server Actions en `lib/actions/`). Sin esta migración, el build estático falla.
  - **Estrategia temporal**: Tauri en dev carga `localhost:3000` (Next.js dev server). En producción desktop se requiere la migración antes de activar `output: 'export'`.
- Commands Rust en `src-tauri/src/commands/*.rs`
- Wrapper TS en `lib/tauri/*.ts` — nunca llamar `invoke()` directamente desde componentes
- Capacidades: `main` capability con permisos mínimos (`core:default` + comandos custom)

### Commands Rust Implementados

| Command | Archivo | Estado | Descripción |
|---------|---------|--------|-------------|
| `list_system_printers` | `commands/print.rs` | ✅ Activo | `EnumPrintersW` — lista impresoras del Panel de Control |
| `print_escpos_ticket` | `commands/print.rs` | ✅ Activo | Genera ESC/POS desde datos JSON + `WritePrinter` Windows API |
| `print_test_page` | `commands/print.rs` | ✅ Activo | Ticket de prueba con corte automático |
| `list_video_devices` | `commands/camera.rs` | ✅ Stub | Lista webcams (pendiente integrar `nokhwa`) |
| `capture_webcam` | `commands/camera.rs` | ✅ Stub | Captura foto desde webcam (pendiente integrar `nokhwa`) |
| `connect_rtsp` | `commands/camera.rs` | ✅ Stub | Conecta stream RTSP (pendiente integrar `ffmpeg-next`) |
| `rtsp_ptz_control` | `commands/camera.rs` | ✅ Stub | Control PTZ (pendiente protocolo ONVIF/Hikvision) |
| `disconnect_rtsp` | `commands/camera.rs` | ✅ Stub | Cierra stream RTSP |

### Dependencias Rust Actuales

- `tauri` v2 — framework desktop
- `tauri-plugin-shell` — abrir URLs externas
- `winapi` v0.3 — `EnumPrintersW` + `WritePrinter` para impresión directa por driver Windows
- `serde` / `serde_json` — serialización commands
