import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircle2, AlertCircle, Info, XCircle, Loader2 } from "lucide-react"

/**
 * Toaster global de TallerCloud — estilo oscuro premium (pill shape).
 *
 * - Success: fondo slate-900, icono emerald, titulo uppercase tracking-widest
 * - Error: fondo slate-900, icono rojo
 * - Todos los toast: border-radius 9999px (pill), sin descripcion por defecto
 *
 * Montado en app/layout.tsx.
 */
const Toaster = (props: ToasterProps) => (
  <Sonner
    closeButton
    position="top-right"
    duration={4000}
    icons={{
      success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      error: <XCircle className="h-4 w-4 text-red-400" />,
      info: <Info className="h-4 w-4 text-blue-400" />,
      warning: <AlertCircle className="h-4 w-4 text-amber-400" />,
      loading: <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />,
    }}
    toastOptions={{
      classNames: {
        toast:
          "!bg-slate-900/95 !text-white !border-slate-700/50 !rounded-full !px-5 !py-3 !shadow-xl !shadow-black/20",
        title:
          "!text-[11px] !font-bold !uppercase !tracking-widest !text-white/90",
        description:
          "!text-[11px] !text-white/60 !font-medium",
        closeButton:
          "!bg-transparent !text-white/40 hover:!text-white !border-white/10",
      },
    }}
    {...props}
  />
)

export { Toaster }
