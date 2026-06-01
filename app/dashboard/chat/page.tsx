'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { ModuleHeader } from '@/components/dashboard/module-header'
import { ChatShell } from '@/components/dashboard/chat/chat-shell'
import { ChatSidebar } from '@/components/dashboard/chat/chat-sidebar'
import { ChatHeader } from '@/components/dashboard/chat/chat-header'
import { MessageList } from '@/components/dashboard/chat/message-list'
import { ChatInput } from '@/components/dashboard/chat/chat-input'
import type { ChatMember, ChatUser, WorkshopMessage } from '@/components/dashboard/chat/types'
import { getChatCurrentUser, getChatMembers, getWorkshopMessages, sendWorkshopMessage } from '@/lib/actions/chat-prisma'

export default function ChatPage() {
  const [messages, setMessages] = useState<WorkshopMessage[]>([])
  const [members, setMembers] = useState<ChatMember[]>([])
  const [currentUser, setCurrentUser] = useState<ChatUser | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [activePeer, setActivePeer] = useState<ChatMember | null>(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [sending, setSending] = useState(false)

  const isOwnMessage = (message: WorkshopMessage) => message.sender_id === currentUser?.id

  const formattedMessages = useMemo(
    () =>
      messages
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages],
  )

  useEffect(() => {
    const run = async () => {
      setLoading(true)

      const [messagesRes, membersRes, meRes] = await Promise.all([
        getWorkshopMessages(null),
        getChatMembers(),
        getChatCurrentUser(),
      ])
      if (!messagesRes.error) setMessages(messagesRes.data)
      if (!membersRes.error) setMembers(membersRes.data)
      if (meRes.data) setCurrentUser(meRes.data)

      setLoading(false)
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
    run()
  }, [])

  useEffect(() => {
    if (!formattedMessages.length) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [formattedMessages])

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data, error } = await getWorkshopMessages(activePeer?.id ?? null)
      if (!error) setMessages(data)
    }, 6000)
    return () => clearInterval(interval)
  }, [activePeer?.id])

  const loadChannel = async (peer: ChatMember | null) => {
    setActivePeer(peer)
    const { data, error } = await getWorkshopMessages(peer?.id ?? null)
    if (!error) setMessages(data)
  }

  const sendMessage = async () => {
    const text = messageInput.trim()
    if (!text || sending) return
    if (!currentUser) return
    setSending(true)
    setMessageInput('')
    inputRef.current?.focus()

    try {
      const sendRes = await sendWorkshopMessage(text, activePeer?.id ?? null)
      if (!sendRes.success) {
        setMessageInput(text)
      }
      const { data, error } = await getWorkshopMessages(activePeer?.id ?? null)
      if (!error) setMessages(data)
    } catch (error) {
      console.error('Error al enviar mensaje del taller:', error)
      setMessageInput(text)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:gap-8 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <ModuleHeader
          icon={MessageSquare}
          title="CHAT TALLER PRO"
          eyebrow="COMUNICACION INTERNA DEL EQUIPO"
          description="Canal permanente para coordinar pendientes, entregas, diagnosticos y avisos internos del taller."
          badge="PRO"
          stats={[
            { label: 'Mensajes', value: loading ? '...' : formattedMessages.length, tone: 'blue' },
            { label: 'Canales', value: 1, tone: 'slate' },
            { label: 'Estado', value: 'Online', tone: 'emerald' },
          ]}
        />

        <ChatShell
          sidebar={
            <ChatSidebar
              members={members}
              activePeerId={activePeer?.id ?? null}
              onSelectGeneral={() => void loadChannel(null)}
              onSelectPrivate={(member) => void loadChannel(member)}
            />
          }
          header={
            <ChatHeader
              currentUserName={currentUser?.name}
              modeLabel={activePeer ? `Chat privado con ${activePeer.name}` : "Canal general del taller"}
            />
          }
          messages={
            <>
              <MessageList loading={loading} messages={formattedMessages} isOwnMessage={isOwnMessage} />
              <div ref={messagesEndRef} />
            </>
          }
          input={
            <ChatInput
              value={messageInput}
              onChange={setMessageInput}
              onSend={sendMessage}
              inputRef={inputRef}
            />
          }
          footer={
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">
              Comunicacion cifrada - canal interno activo
            </p>
          }
        />
      </div>
    </div>
  )
}
