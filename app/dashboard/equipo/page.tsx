"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Pencil, Plus, Trash2, Users, X } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  createMiembro,
  deleteMiembro,
  getEquipoPageData,
  updateMiembro,
} from "@/lib/actions/team-prisma"
import type {
  RolOption,
  EquipoMiembroRow,
  EquipoOwnerRow,
} from "@/lib/team-types"

type MemberCard = {
  key: string
  nombre: string
  email: string
  rol: string
  estado: string
  owner?: boolean
  initial: string
  miembroId?: string
  rolId?: string
}

export default function EquipoPage() {
  const [owner, setOwner] = useState<EquipoOwnerRow | null>(null)
  const [miembros, setMiembros] = useState<EquipoMiembroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rolesOptions, setRolesOptions] = useState<RolOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [nombreMiembro, setNombreMiembro] = useState("")
  const [emailMiembro, setEmailMiembro] = useState("")
  const [rolIdMiembro, setRolIdMiembro] = useState("")
  const [passwordMiembro, setPasswordMiembro] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editMemberId, setEditMemberId] = useState("")
  const [editNombre, setEditNombre] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRolId, setEditRolId] = useState("")
  const [editPassword, setEditPassword] = useState("")

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteMemberId, setDeleteMemberId] = useState("")
  const [deleteMemberName, setDeleteMemberName] = useState("")

  // PERF: getEquipoPageData ya retorna roles - una sola llamada en vez de dos useEffects separados
  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { owner: o, miembros: m, roles: r, error } = await getEquipoPageData()
      if (error) {
        setLoadError(error)
        toast({ title: "Aviso", description: error, variant: "destructive" })
      }
      setOwner(o)
      setMiembros(m)
      setRolesOptions(r)
    } catch (e) {
      console.error(e)
      setLoadError("No se pudo cargar el equipo.")
      toast({ title: "Error", description: "No se pudo cargar el equipo.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!createOpen || rolesOptions.length === 0) return
    setRolIdMiembro((prev) => {
      if (prev) return prev
      const def = rolesOptions.find((r) => r.slug === "tecnico_estandar")
      return def?.id ?? rolesOptions[0]?.id ?? ""
    })
  }, [createOpen, rolesOptions])

  const rolesEstandar = useMemo(
    () => rolesOptions.filter((r) => r.categoria === "estandar"),
    [rolesOptions]
  )
  const rolesEspecial = useMemo(
    () => rolesOptions.filter((r) => r.categoria === "especial"),
    [rolesOptions]
  )

  const memberCards = useMemo<MemberCard[]>(() => {
    const rows: MemberCard[] = []
    if (owner) {
      rows.push({
        key: "owner",
        nombre: owner.nombre,
        email: owner.email,
        rol: "SUPER ADMIN",
        estado: "ACTIVO",
        owner: true,
        initial: (owner.nombre?.trim()?.charAt(0) || "P").toUpperCase(),
      })
    }

    for (const m of miembros) {
      rows.push({
        key: m.id,
        miembroId: m.id,
        rolId: m.rolId,
        nombre: m.nombre,
        email: m.email,
        rol: m.rolNombre.toUpperCase(),
        estado: m.activo ? "ACTIVO" : "INACTIVO",
        initial: (m.nombre?.trim()?.charAt(0) || "U").toUpperCase(),
      })
    }
    return rows
  }, [owner, miembros])

  const openCreateModal = () => {
    if (loadError) return
    setNombreMiembro("")
    setEmailMiembro("")
    setPasswordMiembro("")
    const def = rolesOptions.find((r) => r.slug === "tecnico_estandar")
    setRolIdMiembro(def?.id ?? rolesOptions[0]?.id ?? "")
    setCreateOpen(true)
  }

  const openEditModal = (member: MemberCard) => {
    if (!member.miembroId || member.owner) return
    setEditMemberId(member.miembroId)
    setEditNombre(member.nombre)
    setEditEmail(member.email)
    setEditRolId(member.rolId || "")
    setEditPassword("")
    setEditOpen(true)
  }

  const openDeleteDialog = (member: MemberCard) => {
    if (!member.miembroId || member.owner) return
    setDeleteMemberId(member.miembroId)
    setDeleteMemberName(member.nombre)
    setDeleteOpen(true)
  }

  const handleCrearUsuario = async () => {
    const nombre = nombreMiembro.trim()
    const email = emailMiembro.trim()
    const password = passwordMiembro
    const rolId = rolIdMiembro

    if (!nombre) {
      toast({ title: "Campo requerido", description: "Ingresa el nombre.", variant: "destructive" })
      return
    }
    if (!email) {
      toast({ title: "Campo requerido", description: "Ingresa el email.", variant: "destructive" })
      return
    }
    if (!password || password.length < 6) {
      toast({ title: "Contrasena invalida", description: "Minimo 6 caracteres.", variant: "destructive" })
      return
    }
    if (!rolId) {
      toast({ title: "Campo requerido", description: "Selecciona un puesto/rol.", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createMiembro({ nombre, email, password, rolId })
      if (!result.success) {
        toast({ title: "Error", description: result.error ?? "No se pudo crear el usuario.", variant: "destructive" })
        return
      }

      toast({ title: "Usuario creado", description: `${nombre} ya puede iniciar sesion con su email.` })
      setCreateOpen(false)
      await load()
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "Ocurrio un error al guardar.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGuardarEdicion = async () => {
    const nombre = editNombre.trim()
    const rolId = editRolId
    const password = editPassword

    if (!editMemberId) {
      toast({ title: "Error", description: "Miembro invalido.", variant: "destructive" })
      return
    }
    if (!nombre) {
      toast({ title: "Campo requerido", description: "Ingresa el nombre.", variant: "destructive" })
      return
    }
    if (!rolId) {
      toast({ title: "Campo requerido", description: "Selecciona un puesto/rol.", variant: "destructive" })
      return
    }
    if (password && password.length < 6) {
      toast({ title: "Contrasena invalida", description: "Minimo 6 caracteres.", variant: "destructive" })
      return
    }

    setIsSubmitting(true)
    try {
      const result = await updateMiembro({
        miembroId: editMemberId,
        nombre,
        rolId,
        password,
      })

      if (!result.success) {
        toast({ title: "Error", description: result.error ?? "No se pudo editar el miembro.", variant: "destructive" })
        return
      }

      toast({ title: "Cambios guardados", description: "La informacion del miembro fue actualizada." })
      setEditOpen(false)
      await load()
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo guardar la edicion.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteMember = async () => {
    if (!deleteMemberId) return
    setIsSubmitting(true)
    try {
      const result = await deleteMiembro(deleteMemberId)
      if (!result.success) {
        toast({ title: "Error", description: result.error ?? "No se pudo eliminar el miembro.", variant: "destructive" })
        return
      }

      toast({ title: "Miembro eliminado", description: "Se revoco su acceso correctamente." })
      setDeleteOpen(false)
      setDeleteMemberId("")
      setDeleteMemberName("")
      await load()
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "No se pudo eliminar el miembro.", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-7xl mx-auto w-full px-6 sm:px-8 lg:px-10 py-10 flex flex-col gap-8">
      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Mi Equipo esta temporalmente degradado: {loadError}
        </div>
      ) : null}
      {/* HEADER SUPERIOR */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4">
        {/* Titulo y subtitulo */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black italic tracking-tight text-slate-900">Mi Equipo</h1>
              <p className="inline-flex mt-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {memberCards.length} / 5 Miembros activos
              </p>
            </div>
          </div>

          {/* Botones de accion */}
          <div className="flex items-center gap-2">
            <Button
              onClick={openCreateModal}
              disabled={Boolean(loadError)}
              className="gap-2 text-xs font-bold uppercase tracking-tight bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-8 py-3 h-11 flex-1 sm:flex-none"
            >
              <Plus className="h-4 w-4" />
              <span>+ NUEVO MIEMBRO</span>
            </Button>
          </div>
        </div>
      </div>
      </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full flex items-center justify-center rounded-2xl border border-gray-200 bg-white py-20 text-slate-500 shadow-sm">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Cargando...
            </div>
          ) : memberCards.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-gray-200 bg-white py-14 text-center text-slate-500 shadow-sm">
              No hay miembros disponibles.
            </div>
          ) : (
            memberCards.map((member) => (
              <article key={member.key} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {member.initial}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-gray-900">{member.nombre}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge
                          className={
                            member.owner
                              ? "border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-50"
                              : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                          }
                        >
                          {member.rol}
                        </Badge>
                        {member.owner && (
                          <Badge className="border border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-50">
                            DUENO
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {!member.owner && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-gray-400 transition-colors hover:text-blue-600"
                        aria-label={`Editar ${member.nombre}`}
                        onClick={() => openEditModal(member)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-gray-400 transition-colors hover:text-red-600"
                        aria-label={`Eliminar ${member.nombre}`}
                        onClick={() => openDeleteDialog(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email de acceso</p>
                  <p className="mt-1 truncate text-sm text-gray-800">{member.email || "-"}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    {member.estado}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !isSubmitting && setCreateOpen(o)}>
        <DialogContent showCloseButton={false} className="max-w-md border-gray-200 bg-white p-0 text-gray-900 sm:rounded-2xl">
          <DialogHeader className="space-y-1 border-b border-gray-200 px-6 pb-4 pt-6">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-left text-xl font-bold text-gray-900">Nuevo Miembro</DialogTitle>
              <button
                type="button"
                onClick={() => !isSubmitting && setCreateOpen(false)}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-left text-sm text-gray-500">Agrega un tecnico o administrador a tu equipo.</p>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Nombre</Label>
              <Input
                value={nombreMiembro}
                onChange={(e) => setNombreMiembro(e.target.value)}
                placeholder="Nombre completo"
                className="h-12 rounded-xl border-gray-200 bg-white text-gray-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Email</Label>
              <Input
                type="email"
                value={emailMiembro}
                onChange={(e) => setEmailMiembro(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="h-12 rounded-xl border-gray-200 bg-white text-gray-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Puesto / rol del miembro</Label>
              <Select value={rolIdMiembro} onValueChange={setRolIdMiembro}>
                <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-white text-left text-gray-900">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent className="border-gray-200 bg-white text-gray-900">
                  {rolesEstandar.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-xs font-bold text-gray-800">Roles estandar</SelectLabel>
                      {rolesEstandar.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {rolesEspecial.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="pt-2 text-xs font-bold text-gray-800">Roles con permisos especiales</SelectLabel>
                      {rolesEspecial.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Contrasena</Label>
              <Input
                type="password"
                value={passwordMiembro}
                onChange={(e) => setPasswordMiembro(e.target.value)}
                placeholder="********"
                className="h-12 rounded-xl border-gray-200 bg-white text-gray-900"
              />
            </div>

            <Button
              type="button"
              disabled={isSubmitting}
              className="mt-2 h-12 w-full rounded-2xl bg-blue-600 text-sm font-bold uppercase tracking-tight text-white hover:bg-blue-700"
              onClick={handleCrearUsuario}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                "Crear usuario"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => !isSubmitting && setEditOpen(o)}>
        <DialogContent showCloseButton={false} className="max-w-md border-gray-200 bg-white p-0 text-gray-900 sm:rounded-2xl">
          <DialogHeader className="space-y-1 border-b border-gray-200 px-6 pb-4 pt-6">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-left text-xl font-bold text-gray-900">Editar Miembro</DialogTitle>
              <button
                type="button"
                onClick={() => !isSubmitting && setEditOpen(false)}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-left text-sm text-gray-500">Actualiza los datos y permisos del miembro.</p>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Nombre</Label>
              <Input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                className="h-12 rounded-xl border-gray-200 bg-white text-gray-900"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Email</Label>
              <Input
                type="email"
                value={editEmail}
                disabled
                className="h-12 rounded-xl border-gray-200 bg-gray-100 text-gray-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Puesto / rol del miembro</Label>
              <Select value={editRolId} onValueChange={setEditRolId}>
                <SelectTrigger className="h-12 rounded-xl border-gray-200 bg-white text-left text-gray-900">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent className="border-gray-200 bg-white text-gray-900">
                  {rolesEstandar.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-xs font-bold text-gray-800">Roles estandar</SelectLabel>
                      {rolesEstandar.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {rolesEspecial.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="pt-2 text-xs font-bold text-gray-800">Roles con permisos especiales</SelectLabel>
                      {rolesEspecial.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Contrasena</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Dejar vacio para no cambiar"
                className="h-12 rounded-xl border-gray-200 bg-white text-gray-900"
              />
            </div>

            <Button
              type="button"
              disabled={isSubmitting}
              className="mt-2 h-12 w-full rounded-2xl bg-blue-600 text-sm font-bold uppercase tracking-tight text-white hover:bg-blue-700"
              onClick={handleGuardarEdicion}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !isSubmitting && setDeleteOpen(o)}>
        <AlertDialogContent className="rounded-3xl border-gray-200 bg-white text-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900">Eliminar Miembro</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600">
              ¿Estas seguro de que deseas eliminar a {deleteMemberName || "este miembro"}? Esta accion revocara su acceso al sistema de TallerCloud de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteMember}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Eliminando..." : "Eliminar Miembro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
