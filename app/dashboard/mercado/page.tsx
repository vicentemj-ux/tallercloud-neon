import { ModuleConstruction } from "@/components/dashboard/module-construction"
import { Store } from "lucide-react"

export default function MercadoPage() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <ModuleConstruction 
        moduleName="Mercado"
        moduleIcon={<Store className="h-10 w-10 text-green-600" />}
        description="Explora el mercado de refacciones y servicios disponibles para tu taller."
      />
    </div>
  )
}
