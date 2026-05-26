import type { ReactNode } from "react"

interface ChatShellProps {
  sidebar: ReactNode
  header: ReactNode
  messages: ReactNode
  input: ReactNode
  footer?: ReactNode
}

export function ChatShell({ sidebar, header, messages, input, footer }: ChatShellProps) {
  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="min-h-0">{sidebar}</div>
      <div className="min-h-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/45 px-1 py-2 sm:px-2">{messages}</div>
          {input}
          {footer ? <div className="bg-white px-4 pb-3 text-center">{footer}</div> : null}
        </div>
      </div>
    </section>
  )
}
