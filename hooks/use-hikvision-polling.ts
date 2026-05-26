"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { testHikvisionConnection, pollHikvisionSnapshot, pollHikvisionEvents } from "@/lib/camera/hikvision-polling"
import { toast } from "@/hooks/use-toast"

export interface CameraPollingConfig {
  ip: string
  port: number
  username: string
  password: string
  channel: string
  tallerId: string
  mode: "snapshot" | "event"
  intervalMs?: number
}

export function useHikvisionPolling(config: CameraPollingConfig | null) {
  const [active, setActive] = useState(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastEventTimeRef = useRef<string>("")

  const sendToBackend = useCallback(async (payload: { eventType: string; dateTime: string; snapshotBase64?: string }) => {
    if (!config) return
    try {
      await fetch("/api/visitas/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tallerId: config.tallerId,
          cameraIp: config.ip,
          eventType: payload.eventType,
          dateTime: payload.dateTime,
          snapshotBase64: payload.snapshotBase64,
        }),
      })
      setLastEvent(`${payload.eventType} - ${new Date(payload.dateTime).toLocaleTimeString("es-MX")}`)
    } catch {
      // silent
    }
  }, [config])

  const captureAndSendSnapshot = useCallback(async () => {
    if (!config) return
    const result = await pollHikvisionSnapshot(config)
    if (result.type === "snapshot") {
      await sendToBackend({ eventType: "snapshot_polling", dateTime: result.dateTime, snapshotBase64: result.snapshotBase64 })
    }
  }, [config, sendToBackend])

  const pollEvents = useCallback(async () => {
    if (!config) return
    try {
      const events = await pollHikvisionEvents(config)
      for (const event of events) {
        if (event.dateTime > lastEventTimeRef.current) {
          lastEventTimeRef.current = event.dateTime
          await sendToBackend({ eventType: event.eventType, dateTime: event.dateTime })
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [config, sendToBackend])

  useEffect(() => {
    if (!config) return
    const intervalMs = config.intervalMs || (config.mode === "snapshot" ? 5000 : 3000)

    void testHikvisionConnection(config).then((result) => {
      if (result.ok) {
        setActive(true)
        setError(null)
        toast({ title: "Camara conectada", description: `Modo ${config.mode} cada ${intervalMs / 1000}s` })
      } else {
        setActive(false)
        setError(result.error || "No se pudo conectar")
      }
    })

    const pollFn = config.mode === "snapshot" ? captureAndSendSnapshot : pollEvents
    intervalRef.current = setInterval(pollFn, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      setActive(false)
    }
  }, [config, captureAndSendSnapshot, pollEvents])

  return { active, lastEvent, error }
}
