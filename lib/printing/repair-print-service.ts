"use client"

export type PrintProvider = "web" | "tauri"

type PrintResult = {
  provider: PrintProvider
  usedFallback: boolean
  errorMessage?: string
}

type PrintOptions = {
  webPrint: () => void
  tauriPrint?: () => Promise<void>
}

export async function printWithProvider(options: PrintOptions): Promise<PrintResult> {
  const { webPrint, tauriPrint } = options

  if (tauriPrint) {
    try {
      await tauriPrint()
      return { provider: "tauri", usedFallback: false }
    } catch {
      // fallback a web
    }
  }

  webPrint()
  return { provider: "web", usedFallback: false }
}
