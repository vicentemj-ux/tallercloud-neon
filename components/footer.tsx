import Link from "next/link"
import { buildWhatsAppSendUrl, TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS } from "@/lib/whatsapp-send-url"

export function Footer() {
  return (
    <footer id="contacto" className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Brand */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/images/logo.png"
                alt="TallerCloud logo"
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-bold text-foreground">TallerCloud</span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              La plataforma en la nube que simplifica la gestión de talleres de reparación.
            </p>
            <p className="text-sm text-muted-foreground">
              Hecho en Los Mochis, Sinaloa 🇲🇽
            </p>
          </div>

          {/* Producto */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">Producto</h4>
            <nav className="flex flex-col gap-2" aria-label="Enlaces del producto">
              <Link href="#caracteristicas" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Características
              </Link>
              <Link href="#precios" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Precios
              </Link>
              <a
                href={buildWhatsAppSendUrl(
                  TALLERCLOUD_WHATSAPP_SUPPORT_DIGITS,
                  "Hola, me interesa TallerCloud y tengo algunas preguntas",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Contacto por WhatsApp
              </a>
            </nav>
          </div>

          {/* Legal */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">Legal</h4>
            <nav className="flex flex-col gap-2" aria-label="Enlaces legales">
              <Link href="/terminos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Términos de Servicio
              </Link>
              <Link href="/privacidad" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Política de Privacidad
              </Link>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            © 2026 TallerCloud. Todos los derechos reservados.
          </p>
          <p className="text-sm text-muted-foreground">
            Los Mochis, Sinaloa, México
          </p>
        </div>
      </div>
    </footer>
  )
}
