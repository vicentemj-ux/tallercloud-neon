/**
 * Shim de compatibilidad: mapea la API legacy de Radix Toast a Sonner.
 *
 * Todos los componentes que usen:
 *   import { toast } from "@/hooks/use-toast"
 *   toast({ title: "...", description: "...", variant: "destructive" })
 *
 * ...siguen funcionando sin cambiar ninguna llamada.
 *
 * Mapeo:
 *   variant: "destructive"  → toast.error()   (rojo)
 *   variant: "default" | sin variant → toast.success() (verde)
 */
import { toast as sonner } from "sonner"

type ToastInput = {
  title?: string
  description?: string
  variant?: "default" | "destructive"
  /** Duración en ms (opcional, default heredado del Toaster global) */
  duration?: number
  className?: string
}

function toast({ title = "", description, variant, duration }: ToastInput) {
  const opts = {
    ...(description ? { description } : {}),
    ...(duration    ? { duration }    : {}),
  }

  if (variant === "destructive") {
    sonner.error(title, opts)
  } else {
    sonner.success(title, opts)
  }
}

// Variantes de conveniencia — para nuevos componentes que quieran la API moderna directa
toast.success = (title: string, opts?: Omit<ToastInput, "title" | "variant">) =>
  sonner.success(title, opts)

toast.error = (title: string, opts?: Omit<ToastInput, "title" | "variant">) =>
  sonner.error(title, opts)

toast.info = (title: string, opts?: Omit<ToastInput, "title" | "variant">) =>
  sonner.info(title, opts)

toast.warning = (title: string, opts?: Omit<ToastInput, "title" | "variant">) =>
  sonner.warning(title, opts)

toast.loading = (title: string, opts?: Omit<ToastInput, "title" | "variant">) =>
  sonner.loading(title, opts)

toast.dismiss = (id?: string | number) => sonner.dismiss(id)

/** Hook legacy — algunos componentes hacen const { toast } = useToast() */
function useToast() {
  return { toast }
}

export { useToast, toast }
