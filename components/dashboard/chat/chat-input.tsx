import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { RefObject } from "react"

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  inputRef: RefObject<HTMLInputElement | null>
}

export function ChatInput({ value, onChange, onSend, inputRef }: ChatInputProps) {
  return (
    <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-5 sm:py-4">
      <form
        className="mx-auto flex w-full max-w-4xl items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Escribe un mensaje para tu equipo..."
          className="h-14 flex-1 rounded-full border-slate-200 bg-white text-sm shadow-sm placeholder:text-slate-400 sm:text-base"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim()}
          className="btn-glow h-10 w-10 shrink-0 rounded-full bg-blue-600 text-white hover:bg-blue-700"
          aria-label="Enviar mensaje"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  )
}
