'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClientsTable } from "@/components/dashboard/clients-table"
import { ClientDetailModal } from "@/components/dashboard/client-detail-modal"
import { ClientEditModal } from "@/components/dashboard/client-edit-modal"
import { ClientsSearchFilter } from "@/components/dashboard/clients-search-filter"
import { getAllClients, searchClients, getClientDetail, deleteClient } from "@/lib/actions/clients-prisma"
import type { Client, ClientDetail } from "@/lib/actions/clients-prisma"
import { Users } from "lucide-react"

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const { clients: data, error } = await getAllClients()
    if (!error) setClients(data)
    setLoading(false)
  }

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadClients()
      return
    }
    setLoading(true)
    const { clients: data, error } = await searchClients(query)
    if (!error) setClients(data)
    setLoading(false)
  }, [])

  const handleView = async (client: Client) => {
    const { client: detail, error } = await getClientDetail(client.id)
    if (!error && detail) {
      setSelectedClient(detail)
      setDetailOpen(true)
    }
  }

  const handleEdit = (client: Client) => {
    setEditingClient(client)
    setEditOpen(true)
  }

  const handleDelete = async (client: Client) => {
    const { success } = await deleteClient(client.id)
    if (success) {
      setClients((prev) => prev.filter((c) => c.id !== client.id))
    }
  }

  const handleSaveEdit = async (updatedClient: Client) => {
    setClients((prev) =>
      prev.map((c) => (c.id === updatedClient.id ? { ...updatedClient, ordenes_count: c.ordenes_count } : c))
    )
    setEditOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto w-full px-6 sm:px-8 lg:px-10 py-10 space-y-8">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 shrink-0">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
          <h1 className="italic font-extrabold text-2xl tracking-tight text-slate-900">CLIENTES PRO</h1>
          <p className="text-[10px] tracking-widest text-slate-500 font-semibold">
            DIRECTORIO Y EXPEDIENTE DE REPARACIONES
          </p>
          <p className="mt-1 text-sm tracking-tight text-slate-500">
            {loading ? "Cargando..." : `${clients.length} ${clients.length === 1 ? "cliente encontrado" : "clientes encontrados"}`}
          </p>
          </div>
        </div>
      </div>
      </div>

      {/* Search */}
      <ClientsSearchFilter onSearch={handleSearch} isLoading={loading} />

      {/* Cards grid */}
      <ClientsTable
        clients={clients}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isLoading={loading}
      />

      {/* Modals */}
      <ClientDetailModal
        client={selectedClient}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false)
          setSelectedClient(null)
        }}
      />

      <ClientEditModal
        client={editingClient}
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false)
          setEditingClient(null)
        }}
        onSave={handleSaveEdit}
      />
      </div>
    </div>
  )
}
