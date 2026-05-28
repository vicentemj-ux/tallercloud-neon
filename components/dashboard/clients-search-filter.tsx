"use client"

import { useState, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

interface ClientsSearchFilterProps {
  onSearch: (query: string) => void
  isLoading?: boolean
}

export function ClientsSearchFilter({ onSearch, isLoading = false }: ClientsSearchFilterProps) {
  const [query, setQuery] = useState("")

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      onSearch(value)
    },
    [onSearch]
  )

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <Input
        placeholder="Buscar por nombre, telefono o ID..."
        value={query}
        onChange={handleChange}
        disabled={isLoading}
        className="h-11 border-0 bg-transparent pl-10 text-slate-900 placeholder:text-slate-400 focus-visible:ring-0"
      />
    </div>
  )
}
