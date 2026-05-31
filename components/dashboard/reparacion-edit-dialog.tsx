"use client"

import { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { NuevaReparacionForm } from "@/components/dashboard/nueva-reparacion-form"
import { createRepair, updateRepairFull } from "@/lib/actions/repairs-prisma"
import type { ChecklistIngreso } from "@/lib/reparaciones/checklist-ingreso"
import { parseChecklistIngreso } from "@/lib/reparaciones/checklist-ingreso"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"


function parseChecklistFromForm(formData: FormData): ChecklistIngreso | undefined {
  const raw = (formData.get("checklist-ingreso") as string) || ""
  if (!raw.trim()) return undefined
  try {
    return parseChecklistIngreso(JSON.parse(raw)) ?? undefined
  } catch {
    return undefined
  }
}

interface ReparacionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Solo edicion de ticket existente */
  editingRepairId: string | null
  /** Tras guardar edicion correctamente */
  onEditSuccess?: (repairId: string) => void
}

/**
 * Modal de edicion de ticket (`NuevaReparacionForm` en modo edicion).
 * Reutilizable desde la lista de reparaciones o la ficha por ID.
 *
 * Seguridad del equipo (PIN, contrasena, patron) se edita en el colapsable «Seguridad»;
 * el **patron de desbloqueo 3x3** se abre al elegir «Patron» en Seguridad del equipo - mismo `ModalPatronSeguridad` que en el alta en modal.
 */
export function ReparacionEditDialog({
  open,
  onOpenChange,
  editingRepairId,
  onEditSuccess,
}: ReparacionEditDialogProps) {
  const [dirty, setDirty] = useState(false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [isReingreso, setIsReingreso] = useState(false)
  const [previousFolio, setPreviousFolio] = useState("")

  useEffect(() => {
    if (!open) {
      setIsReingreso(false)
      setPreviousFolio("")
    }
  }, [open])

  const handleFormSubmit = async (
    formData: FormData
  ): Promise<{ repairId?: string; folio?: string } | void> => {
    const clienteId = (formData.get("clienteId") as string) || ""
    const editRepairId = (formData.get("editingRepairId") as string) || ""

    const rawCustomerName = (formData.get("customer-name") as string) || ""
    const rawCustomerPhone = (formData.get("customer-phone") as string) || ""
    const clienteNombre =
      ((formData.get("clienteNombre") as string) || "").trim() || rawCustomerName.trim()
    const clienteTelefono =
      ((formData.get("clienteTelefono") as string) || "").trim() || rawCustomerPhone.trim()
    const tipo_equipo = formData.get("device-type") as string
    const brand = formData.get("brand") as string
    const model = formData.get("model") as string
    const imei = formData.get("imei") as string
    const color = (formData.get("color") as string) || ""
    const problemDesc = formData.get("problem-desc") as string
    const securityType = (formData.get("security-type") as string) || undefined
    const securityValue = (formData.get("security-value") as string) || undefined
    const technician = formData.get("technician") as string
    const estimatedPrice = formData.get("estimated-price") as string
    const deposit = formData.get("deposit") as string
    const metodoPagoAnticipo = (formData.get("metodo-pago-anticipo") as string) || "efectivo"
    const email = (formData.get("customer-email") as string) || ""
    const notasInternas = (formData.get("notas-internas") as string) || ""
    const serviciosRaw = (formData.get("servicios") as string) || ""
    const servicios: { servicio_id: string; cantidad?: number }[] = serviciosRaw
      ? JSON.parse(serviciosRaw)
      : []

    const photosBase64: string[] = []
    let photoIndex = 0
    while (formData.has(`photo_${photoIndex}`)) {
      const photoFile = formData.get(`photo_${photoIndex}`) as File
      if (photoFile) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(photoFile)
        })
        photosBase64.push(base64)
      }
      photoIndex++
    }

    const checklistParsed = parseChecklistFromForm(formData)

    const rawChecklistPro = (formData.get("checklist-pro-json") as string) || ""
    let checklistProParsed: unknown = undefined
    if (rawChecklistPro.trim()) {
      try {
        checklistProParsed = JSON.parse(rawChecklistPro) as unknown
      } catch {
        /* ignore */
      }
    }

    if (editRepairId) {
      const keptPhotos: string[] = JSON.parse((formData.get("existingPhotos") as string) || "[]")
      const removedPhotos: string[] = JSON.parse((formData.get("removedPhotos") as string) || "[]")

      const result = await updateRepairFull({
        repairId: editRepairId,
        customerName: clienteNombre,
        customerPhone: clienteTelefono,
        customerEmail: email,
        clienteId: clienteId || undefined,
        tipo_equipo: tipo_equipo || undefined,
        deviceBrand: brand,
        deviceModel: model,
        deviceSerial: imei || undefined,
        deviceColor: color || undefined,
        reportedFault: problemDesc,
        estimatedPrice: estimatedPrice || undefined,
        technician: technician && technician !== "Sin asignar" ? technician : undefined,
        securityType,
        securityValue,
        newPhotos: photosBase64,
        removedPhotos,
        keptPhotos,
        notasInternas: notasInternas || undefined,
        servicios: servicios,
        ...(checklistParsed !== undefined ? { checklistIngreso: checklistParsed } : {}),
      })

      if (!result.success) {
        throw new Error(result.error || "Error al guardar cambios")
      }

      return { repairId: editRepairId }
    }

    const result = await createRepair({
      customerName: clienteNombre,
      customerPhone: clienteTelefono,
      customerEmail: email,
      tipo_equipo,
      deviceBrand: brand,
      deviceModel: model,
      deviceSerial: imei,
      reportedFault: problemDesc,
      estimatedPrice,
      // El anticipo ya no se registra en caja desde la creacion del ticket
      // El usuario puede registrar abonos despues desde el modulo de caja
      clienteId: clienteId || undefined,
      technician: technician && technician !== "Sin asignar" ? technician : undefined,
      securityType,
      securityValue,
      photos: photosBase64,
      servicios: servicios,
      notasInternas: notasInternas || undefined,
      checklistIngreso: checklistParsed ?? null,
      checklist_pro: checklistProParsed,
    })

    if (!result.success || !result.repairId || !result.folio) {
      throw new Error(
        result.error?.trim() ||
          "El servidor no devolvio folio ni id. Revisa la consola de Vercel, migraciones de Supabase y columnas de `reparaciones`.",
      )
    }

    return { repairId: result.repairId, folio: result.folio }
  }

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true)
        return
      }
      if (dirty) {
        setConfirmDiscardOpen(true)
        return
      }
      onOpenChange(false)
    },
    [dirty, onOpenChange],
  )

  const confirmDiscard = useCallback(() => {
    setConfirmDiscardOpen(false)
    setDirty(false)
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          showCloseButton={false}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "!left-0 !top-0 !translate-x-0 !translate-y-0 h-[100dvh] w-screen max-w-none rounded-none border-0 bg-white p-0 shadow-none",
            "md:h-auto md:max-h-[90vh] md:w-[95vw] md:rounded-3xl md:border md:border-slate-200 md:shadow-sm",
            "md:!left-1/2 md:!top-1/2 md:!translate-x-[-50%] md:!translate-y-[-50%]",
            "lg:max-w-[1200px]",
            "flex flex-col gap-0 overflow-hidden",
          )}
        >
          <DialogHeader className="sticky top-0 z-20 shrink-0 gap-0 border-0 bg-transparent p-0">
            <div className="relative bg-[#0c1a2e] px-3 py-2 pr-14 sm:px-5 sm:py-2.5">
              <DialogTitle className="sr-only">
                {editingRepairId ? "Modificar ticket" : "Nuevo ticket"}
              </DialogTitle>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 text-lg font-black italic leading-tight tracking-tight text-white sm:text-2xl sm:leading-tight">
                  {editingRepairId ? "MODIFICAR TICKET" : "NUEVO TICKET"}
                </span>
                {/* Reingreso removed from here - use "Reactivar como Reingreso" on the ticket detail page */}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-1/2 h-9 w-9 shrink-0 -translate-y-1/2 text-white hover:bg-white/10 hover:text-white"
                aria-label="Cerrar"
                onClick={() => handleDialogOpenChange(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </DialogHeader>
          <NuevaReparacionForm
            key={editingRepairId ? `edit-${editingRepairId}` : `new-${open}`}
            onModalDirtyChange={setDirty}
            onSuccess={(repairId) => {
              setDirty(false)
              onOpenChange(false)
              onEditSuccess?.(repairId)
            }}
            isModal={true}
            onSubmit={handleFormSubmit}
            editingRepairId={editingRepairId}
            modalOrderType={{
              isReingreso,
              setIsReingreso,
              previousFolio,
              setPreviousFolio,
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent
          overlayClassName="z-[115]"
          className="z-[116] border-slate-200 sm:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              Los datos no guardados se perderan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200">Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={confirmDiscard}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
