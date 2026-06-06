'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Send, Mic, MicOff, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useMother, formatEDD, getTrimesterLabel } from '@/lib/mother-utils'
import { sendMessageToMaa } from '@/lib/gemini'
import BottomNav from '@/components/mother/BottomNav'
import type { ChatMessage } from '@/lib/types'

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  redFlagDetected?: boolean
  redFlagType?: string
}

const WELCOME: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "আসসালামু আলাইকুম! আমি শেতু মা। আপনার গর্ভাবস্থা সম্পর্কে যেকোনো প্রশ্ন করুন।\n\nHello! I'm Shetu Maa. Ask me anything about your pregnancy, symptoms, or health. 💚",
  redFlagDetected: false,
}

export default function ChatPage() {
  const router = useRouter()
  const { patient, pregnancy, loading } = useMother()

  const [messages, setMessages] = useState<UIMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supported = !!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition
    )
    setVoiceSupported(supported)
  }, [])

  useEffect(() => {
    if (loading) return
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    if (!patient || !pregnancy) { router.replace('/dashboard/mother/onboarding'); return }
    loadPreviousMessages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, patient, pregnancy])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function loadPreviousMessages() {
    if (!patient || !pregnancy) return
    try {
      const supabase = createClient()
      const { data: conv } = await supabase
        .from('maa_conversations')
        .select('id, started_at')
        .eq('patient_id', patient.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!conv) return

      const age = Date.now() - new Date(conv.started_at).getTime()
      if (age > 24 * 60 * 60 * 1000) return

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
            id: m.id,
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            redFlagDetected: m.red_flag_detected,
            redFlagType: m.red_flag_type,
          }))
        )
      }
    } catch (e) {
      console.error('[Chat] Failed to load messages:', e)
    }
  }

  async function toggleVoice() {
    if (voiceListening) {
      recognitionRef.current?.stop()
      setVoiceListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Voice input not supported on this browser. Use Chrome.')
      setTimeout(() => setError(''), 4000)
      return
    }

    // Trigger the browser mic permission prompt explicitly. If it was blocked
    // before, guide the user to re-enable it from the address-bar lock icon.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
    } catch {
      setError('Microphone blocked. Tap the 🔒 icon in the address bar → set Microphone to "Allow", then retry.')
      setTimeout(() => setError(''), 7000)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any
    recognition.lang = 'bn-BD'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onstart = () => setVoiceListening(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript
      setInput(prev => prev ? prev + ' ' + transcript : transcript)
      setVoiceListening(false)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error)
      setVoiceListening(false)
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Allow microphone in browser settings.')
        setTimeout(() => setError(''), 5000)
      }
    }

    recognition.onend = () => setVoiceListening(false)

    recognition.start()
    recognitionRef.current = recognition
  }

  async function handleSend() {
    if (!input.trim() || sending || !patient || !pregnancy) return

    const userText = input.trim()
    setInput('')
    setError('')

    const tempId = Date.now().toString()
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: userText,
      redFlagDetected: false,
    }])
    setSending(true)

    try {
      const supabase = createClient()
      const raw = localStorage.getItem('shetu_user')
      const userId = raw ? JSON.parse(raw).id : ''

      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
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

      let convId = conversationId
      if (!convId) {
        const { data: newConv, error: convErr } = await supabase
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

        if (convErr) console.error('[Chat] Conversation create error:', convErr)
        if (newConv) { convId = newConv.id; setConversationId(convId) }
      }

      if (convId && userId) {
        const { error: msgErr } = await supabase.from('maa_messages').insert([
          { conversation_id: convId, role: 'user', content: userText,
            safety_gate_passed: true, red_flag_detected: false },
          { conversation_id: convId, role: 'assistant', content: response,
            model_used: 'gemini-2.5-flash', safety_gate_passed: true,
            red_flag_detected: redFlagDetected, red_flag_type: redFlagType ?? null },
        ])
        if (msgErr) console.error('[Chat] Message save error:', msgErr)

        if (redFlagDetected) {
          await supabase.from('maa_conversations')
            .update({ escalated_to_sos: true, risk_flags_detected: [redFlagType ?? 'danger_sign'] })
            .eq('id', convId)
        }
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        redFlagDetected,
        redFlagType,
      }])

    } catch (err) {
      console.error('[Chat] Send error:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg.includes('API key') ? msg : 'Maa is temporarily unavailable. Please try again.')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center">
        <div className="animate-spin border-2 border-t-[#0E7C66] rounded-full w-8 h-8" />
      </div>
    )
  }

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
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-600 font-medium">Online</span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Voice listening indicator */}
      {voiceListening && (
        <div className="mx-4 mt-2 bg-teal-50 border border-teal-200 text-teal-700 text-xs rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          Listening... Speak in Bangla or English
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%]">
              {msg.role === 'assistant' ? (
                <div className="flex items-end gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#0E7C66] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-1">
                    M
                  </div>
                  <div>
                    <div className="bg-white shadow-sm rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                    {msg.redFlagDetected && (
                      <div className="mt-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-red-500 shrink-0" />
                          <p className="text-xs text-red-600">This sounds serious — call 999 or use SOS.</p>
                        </div>
                        <button
                          onClick={() => router.push('/dashboard/mother/pregnancy/sos')}
                          className="text-xs text-white bg-red-500 rounded-lg px-2 py-1 shrink-0 font-medium"
                        >
                          SOS
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[#0E7C66] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2">
              <div className="w-6 h-6 rounded-full bg-[#0E7C66] flex items-center justify-center text-white text-[10px] font-bold shrink-0">M</div>
              <div className="bg-white shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-10">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button
            onClick={toggleVoice}
            title={voiceSupported ? (voiceListening ? 'Stop' : 'Tap to speak') : 'Voice not supported'}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              voiceListening
                ? 'bg-red-500 animate-pulse'
                : voiceSupported
                  ? 'bg-gray-100 hover:bg-gray-200'
                  : 'bg-gray-50 opacity-40 cursor-not-allowed'
            }`}
          >
            {voiceListening
              ? <MicOff size={17} className="text-white" />
              : <Mic size={17} className={voiceSupported ? 'text-gray-600' : 'text-gray-400'} />
            }
          </button>

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={voiceListening ? 'Listening…' : 'Ask anything about your pregnancy...'}
            disabled={sending || voiceListening}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C66] disabled:bg-gray-50"
          />

          <button
            onClick={handleSend}
            disabled={sending || !input.trim() || voiceListening}
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