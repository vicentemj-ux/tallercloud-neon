import { ModuleConstruction } from "@/components/dashboard/module-construction"
import { Store } from "lucide-react"

export default function MercadoPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <ModuleConstruction 
        moduleName="Mercado"
        moduleIcon={<Store className="h-10 w-10 text-green-600" />}
        description="Explora el mercado de refacciones y servicios disponibles para tu taller."
      />
    </div>
  )
}
