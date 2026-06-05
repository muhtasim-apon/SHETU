'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Send, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useMother, formatEDD, getTrimesterLabel } from '@/lib/mother-utils'
import { sendMessageToMaa } from '@/lib/gemini'
import BottomNav from '@/components/mother/BottomNav'
import type { ChatMessage } from '@/lib/types'

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  redFlagDetected?: boolean
  redFlagType?: string
}

export default function ChatPage() {
  const router = useRouter()
  const { patient, pregnancy, loading } = useMother()
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (loading) return
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    if (!patient || !pregnancy) { router.replace('/dashboard/mother/onboarding'); return }
    loadPreviousMessages()
  }, [loading, patient, pregnancy])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadPreviousMessages() {
    if (!patient || !pregnancy) return
    try {
      const supabase = createClient()
      const { data: conv } = await supabase
        .from('maa_conversations')
        .select('id')
        .eq('patient_id', patient.id)
        .eq('pregnancy_id', pregnancy.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!conv) return

      setConversationId(conv.id)
      const { data: msgs } = await supabase
        .from('maa_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
        .limit(50)

      if (msgs && msgs.length > 0) {
        setMessages(
          (msgs as ChatMessage[]).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            redFlagDetected: m.red_flag_detected,
            redFlagType: m.red_flag_type,
          }))
        )
      }
    } catch {
      // silently fail, show welcome
    }
  }

  async function handleSend() {
    if (!input.trim() || sending || !patient || !pregnancy) return

    const userText = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userText }])
    setSending(true)

    try {
      const supabase = createClient()
      const raw = localStorage.getItem('shetu_user')
      const userId = raw ? JSON.parse(raw).id : ''

      // Build Gemini history (exclude the message we're sending)
      const history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = messages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }] as [{ text: string }],
      }))

      const { response, redFlagDetected, redFlagType } = await sendMessageToMaa(
        history,
        userText,
        {
          weeks: pregnancy.gestational_age_weeks,
          trimester: getTrimesterLabel(pregnancy.trimester),
          edd: formatEDD(pregnancy.edd),
        }
      )

      // Create conversation if needed
      let convId = conversationId
      if (!convId) {
        const { data: newConv } = await supabase
          .from('maa_conversations')
          .insert({
            patient_id: patient.id,
            pregnancy_id: pregnancy.id,
            session_type: 'text',
            escalated_to_sos: false,
            risk_flags_detected: [],
          })
          .select('id')
          .single()

        if (newConv) {
          convId = newConv.id
          setConversationId(convId)
        }
      }

      if (convId) {
        await supabase.from('maa_messages').insert([
          {
            conversation_id: convId,
            role: 'user',
            content: userText,
            safety_gate_passed: true,
            red_flag_detected: false,
          },
          {
            conversation_id: convId,
            role: 'assistant',
            content: response,
            model_used: 'gemini-1.5-flash',
            safety_gate_passed: true,
            red_flag_detected: redFlagDetected,
            red_flag_type: redFlagType ?? null,
          },
        ])

        if (redFlagDetected) {
          await supabase
            .from('maa_conversations')
            .update({
              escalated_to_sos: true,
              risk_flags_detected: [redFlagType ?? 'unknown'],
            })
            .eq('id', convId)
        }
      }

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response, redFlagDetected, redFlagType },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Maa is temporarily unavailable. Try again.' },
      ])
    } finally {
      setSending(false)
    }
  }

  const showWelcome = messages.length === 0 && !loading

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white shadow-sm px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => router.push('/dashboard/mother/pregnancy')} className="p-1">
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#0E7C66] flex items-center justify-center text-white font-bold text-sm shrink-0">
          M
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm leading-none">Chat with Maa</p>
          <p className="text-xs text-gray-500 mt-0.5">Your AI pregnancy companion</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-gray-500">Online</span>
        </div>
      </div>

      {toast && (
        <div className="mx-4 mt-2 bg-orange-50 border border-orange-200 text-orange-600 text-xs rounded-lg px-3 py-2">
          {toast}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {showWelcome && (
          <div className="max-w-[80%] bg-white shadow-sm rounded-2xl rounded-bl-sm p-3 mb-3 text-gray-800 text-sm">
            আসসালামু আলাইকুম! আমি শেতু মা। আপনার গর্ভাবস্থা সম্পর্কে যেকোনো প্রশ্ন করুন।
            <br /><br />
            Hello! I&apos;m Shetu Maa. Ask me anything about your pregnancy, symptoms, or health.
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%]">
              <div
                className={`px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#0E7C66] text-white rounded-2xl rounded-br-sm'
                    : 'bg-white shadow-sm text-gray-800 rounded-2xl rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'assistant' && msg.redFlagDetected && (
                <div className="mt-1 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-red-600">
                    ⚠️ This sounds serious. Please use SOS immediately or call 999.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/mother/pregnancy/sos')}
                    className="text-xs text-white bg-red-500 rounded-lg px-2 py-1 shrink-0"
                  >
                    Open SOS
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start mb-3">
            <div className="bg-white shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t px-4 py-3 z-10">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask anything about your pregnancy..."
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66]"
            disabled={sending}
          />
          <button
            onClick={() => {
              setToast('Voice input coming soon!')
              setTimeout(() => setToast(''), 2500)
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
          >
            <Mic size={18} className="text-gray-500" />
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-10 h-10 rounded-full bg-[#0E7C66] flex items-center justify-center shrink-0 disabled:opacity-40"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
      </div>

      <BottomNav activeTab="chat" />
    </div>
  )
}
