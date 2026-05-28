import { Suspense } from "react"
import CalibrationClient from "./calibration-client"

export default function PrintCalibrationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white p-8 text-sm text-slate-500">
          Preparando calibracion de impresion…
        </div>
      }
    >
      <CalibrationClient />
    </Suspense>
  )
}
