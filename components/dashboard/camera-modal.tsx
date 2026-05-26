"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { optimizeImageForUpload } from "@/lib/image-optimizer"

const FRIENDLY_FAIL = "No se pudo detectar una camara activa."
const SECURE_FAIL = "Para usar la camara, abre TallerCloud en HTTPS o localhost."
const API_FAIL = "Tu navegador no permite acceso directo a la camara."
const DIALOG_Z = "z-[220]"
type CameraPermissionState = PermissionState | "unsupported"

export interface CameraModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (file: File) => void | Promise<void>
}

export function CameraModal({ open, onOpenChange, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [permissionState, setPermissionState] = useState<CameraPermissionState>("unsupported")

  const stopCamera = useCallback(() => {
    try {
      if (!streamRef.current) return
      streamRef.current.getTracks().forEach((track) => track.stop())
    } finally {
      streamRef.current = null
      const el = videoRef.current
      if (el) el.srcObject = null
    }
  }, [])

  const getCameraErrorMessage = useCallback((error: unknown): string => {
    if (error && typeof error === "object" && "name" in error) {
      const name = String((error as { name?: string }).name || "")
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPermissionDenied(true)
        return "Permiso de camara bloqueado. Habilitalo en tu navegador y vuelve a intentar."
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "No se encontro una camara disponible en este dispositivo."
      }
      if (name === "NotReadableError" || name === "TrackStartError") {
        return "La camara esta en uso por otra aplicacion."
      }
    }
    return FRIENDLY_FAIL
  }, [])

  const getCameraPermissionState = useCallback(async (): Promise<CameraPermissionState> => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported"
    try {
      const result = await navigator.permissions.query({ name: "camera" as PermissionName })
      return result.state
    } catch {
      return "unsupported"
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setCameraError(null)
      setPermissionDenied(false)
      return
    }

    let mounted = true

    const startCamera = async () => {
      try {
        setCameraError(null)
        setPermissionDenied(false)

        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")

        if (typeof window !== "undefined" && !window.isSecureContext && !isLocalhost) {
          setCameraError(SECURE_FAIL)
          return
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError(API_FAIL)
          return
        }

        const currentPermissionState = await getCameraPermissionState()
        setPermissionState(currentPermissionState)
        if (currentPermissionState === "denied") {
          setPermissionDenied(true)
          setCameraError(
            "Permiso de camara bloqueado. Chrome bloqueo la camara para TallerCloud y no mostrara el popup automaticamente."
          )
          return
        }

        let stream: MediaStream | null = null

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          })
        } catch (primaryError) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            })
          } catch (fallbackError) {
            if (!mounted) return
            setCameraError(getCameraErrorMessage(fallbackError ?? primaryError))
            return
          }
        }

        if (!stream) return

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const el = videoRef.current

        if (el) {
          el.srcObject = stream
          try {
            await el.play()
          } catch (playError) {
            setCameraError(getCameraErrorMessage(playError))
            stream.getTracks().forEach((t) => t.stop())
            streamRef.current = null
            el.srcObject = null
          }
        }
      } catch (error) {
        if (mounted) setCameraError(getCameraErrorMessage(error))
      }
    }

    void startCamera()

    return () => {
      mounted = false
      stopCamera()
    }
  }, [open, retryToken, stopCamera, getCameraErrorMessage, getCameraPermissionState])

  const handleRetry = () => {
    stopCamera()
    setCameraError(null)
    setPermissionDenied(false)
    setRetryToken((t) => t + 1)
  }

  const handleCapture = async () => {
    if (!videoRef.current) return
    setCapturing(true)
    try {
      const video = videoRef.current
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720

      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("canvas")

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (fileBlob) => {
            if (!fileBlob) return reject(new Error("blob"))
            resolve(fileBlob)
          },
          "image/jpeg",
          0.85,
        )
      })

      const rawFile = new File([blob], `reparacion-${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      })

      const optimized = await optimizeImageForUpload(rawFile)
      await onCapture(optimized)
      stopCamera()
      onOpenChange(false)
    } catch (error) {
      setCameraError(getCameraErrorMessage(error))
    } finally {
      setCapturing(false)
    }
  }

  const handleCancel = () => {
    stopCamera()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={DIALOG_Z}
        className={`${DIALOG_Z} max-w-lg border-slate-200 bg-white p-4 sm:p-6`}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-slate-900">Tomar foto</DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {cameraError ? (
            <div className="flex min-h-[200px] w-full flex-col items-center justify-center gap-4 px-4 py-8 text-center">
              <p className="max-w-md text-sm leading-relaxed text-slate-600">{cameraError}</p>
              {permissionDenied ? (
                <div className="max-w-md rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                  <p className="text-xs font-semibold text-slate-800">Como habilitar camara en Chrome Android:</p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                    <li>Toca el icono de controles o candado junto a la URL.</li>
                    <li>Entra a Permisos del sitio.</li>
                    <li>Cambia Camara a Permitir.</li>
                    <li>Recarga TallerCloud.</li>
                    <li>Vuelve a tocar Abrir Camara.</li>
                  </ol>
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200"
                onClick={handleRetry}
              >
                {permissionDenied ? "Ya habilite permisos, reintentar" : "Reintentar permiso"}
              </Button>
              {permissionState === "prompt" ? (
                <p className="max-w-md text-xs text-slate-500">Si aparece el popup del navegador, permite el acceso a camara.</p>
              ) : null}
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-[40vh] w-full bg-slate-100 object-cover"
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 text-slate-700"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => void handleCapture()}
            disabled={Boolean(cameraError) || capturing}
          >
            <Camera className="mr-2 h-4 w-4" aria-hidden />
            Capturar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
