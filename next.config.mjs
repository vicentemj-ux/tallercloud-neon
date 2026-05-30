/** @type {import('next').NextConfig} */

// Derivar hostname de Supabase desde env var para evitar hardcodear infraestructura
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "").split("/")[0] || "localhost"
const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL || ""
const r2PublicHost = r2PublicBaseUrl.replace(/^https?:\/\//, "").split("/")[0] || ""

// Content Security Policy
// 'unsafe-inline' y 'unsafe-eval' requeridos por Next.js App Router (hidratación + estilos).
// Se agregan permisos explícitos para imágenes desde el host de Supabase y el propio dominio.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://va.vercel-scripts.com https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' blob: data: https://${supabaseHost} https://*.supabase.co${r2PublicHost ? ` https://${r2PublicHost} https://*.r2.dev` : ""}`,
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://vitals.vercel-insights.com https://va.vercel-scripts.com https://cdn.jsdelivr.net`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: csp },
]

const nextConfig = {
  /** Requerido para build desktop (Tauri). Genera .next/standalone/ */
  output: 'standalone',
  /** Binarios nativos (napi-rs) + pg (util/types no disponible en bundler): no empaquetar con Turbopack. */
  serverExternalPackages: ["@resvg/resvg-js", "pg"],
  typescript: {
    // ignoreBuildErrors eliminado como parte de la auditoría de seguridad.
    // Todos los errores de TypeScript deben corregirse antes de deploy.
  },
  // Bundle optimization for Lighthouse score
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    // Optimized for Lighthouse score - enable Next.js image optimization in production
    // In dev, we keep unoptimized for faster HMR; in prod, we optimize
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "pub-*.r2.dev",
        pathname: "/**",
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      {
        source: "/tracking/:id",
        destination: "/track/:id",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
