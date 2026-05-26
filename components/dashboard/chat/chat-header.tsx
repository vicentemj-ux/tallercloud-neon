import { MessageCircle, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ChatHeaderProps {
  currentUserName?: string
  modeLabel?: string
}

export function ChatHeader({ currentUserName, modeLabel }: ChatHeaderProps) {
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
            <MessageCircle className="h-5 w-5 text-blue-600" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Chat Taller PRO</p>
            <h2 className="text-lg font-black tracking-tight text-slate-900 sm:text-xl">
              {modeLabel || "Canal general del taller"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Comunicacion interna para coordinar el trabajo del equipo
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge className="hidden border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
            <Wifi className="mr-1 h-3.5 w-3.5" aria-hidden />
            Cloud Online
          </Badge>
          {currentUserName ? (
            <Badge className="border-blue-200 bg-blue-50 text-blue-700">{currentUserName}</Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}
