"use client"

import type { TallerSettings } from "@/lib/actions/settings-prisma"

interface HardwareProps {
  settings: TallerSettings | null
  onSettingsUpdate?: (patch: Partial<TallerSettings>) => void
}

export function Hardware({ settings: _settings, onSettingsUpdate: _onSettingsUpdate }: HardwareProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">Hardware (PRO)</h3>
        <p className="mt-2 text-sm text-slate-600">Proximamente.</p>
      </div>
    </div>
  )
}

