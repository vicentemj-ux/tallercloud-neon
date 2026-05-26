import { CheckCircle2, Clock3, FileText, XCircle } from "lucide-react"

interface Stats {
  total: number
  pendientes: number
  aceptadas: number
  rechazadas: number
}

function StatCard(props: { title: string; value: number; icon: React.ReactNode; iconBg: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${props.iconBg}`}>{props.icon}</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{props.title}</p>
          <p className="text-3xl font-black leading-none text-slate-900">{props.value}</p>
        </div>
      </div>
    </div>
  )
}

export function CotizacionesStats({ stats }: { stats: Stats }) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Total Generado" value={stats.total} icon={<FileText className="h-4 w-4 text-blue-600" />} iconBg="bg-blue-50" />
      <StatCard title="Pendientes" value={stats.pendientes} icon={<Clock3 className="h-4 w-4 text-amber-600" />} iconBg="bg-amber-50" />
      <StatCard title="Aceptadas" value={stats.aceptadas} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} iconBg="bg-emerald-50" />
      <StatCard title="Rechazadas" value={stats.rechazadas} icon={<XCircle className="h-4 w-4 text-red-600" />} iconBg="bg-red-50" />
    </section>
  )
}
