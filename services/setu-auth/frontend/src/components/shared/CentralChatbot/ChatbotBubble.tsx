'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import { X, Minus, Mic, MicOff, Volume2, VolumeX, Bot } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { sendChatMessage, CENTRAL_SYSTEM_PROMPT, type ChatMessage, type AttachedFile } from '@/lib/centralChatbot'
import { parseActions, fillReactInput, getPageLabel } from '@/lib/chatbotActions'
import { useChatbotContext, buildSystemPromptWithContext } from '@/hooks/useChatbotContext'
import { useVoiceOutput, detectLang } from '@/hooks/useVoiceOutput'
import ChatPanel from './ChatPanel'

let msgCounter = 0
function newId() { return `msg-${++msgCounter}-${Date.now()}` }

export default function ChatbotBubble() {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false)
  const messagesRef = useRef<ChatMessage[]>([])

  const ctx = useChatbotContext()
  const { speak, stop: stopSpeaking } = useVoiceOutput()
  const router = useRouter()

  // Draggable bubble (Messenger chat-head style). Position is an offset from the
  // default bottom-right anchor, persisted to localStorage across renders.
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const draggedRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('shetu_bubble_pos')
      if (raw) {
        const { x, y } = JSON.parse(raw) as { x: number; y: number }
        if (typeof x === 'number') dragX.set(x)
        if (typeof y === 'number') dragY.set(y)
      }
    } catch { /* ignore */ }
  }, [dragX, dragY])

  const pushMessage = useCallback((msg: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, msg]
    setMessages([...messagesRef.current])
  }, [])

  const handleSend = useCallback(async (text: string, file?: AttachedFile) => {
    if (!text.trim() && !file) return
    stopSpeaking()

    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text || `[File: ${file?.name}]`,
      timestamp: new Date(),
      fileAttachment: file,
    }
    pushMessage(userMsg)
    setLoading(true)

    try {
      const systemPrompt = buildSystemPromptWithContext(CENTRAL_SYSTEM_PROMPT, ctx)
      // Pass history without the message we just added
      const historyForApi = messagesRef.current.slice(0, -1)

      const { response, modelUsed, tier } = await sendChatMessage(
        historyForApi,
        text || `Attached file: ${file?.name}`,
        systemPrompt,
        file
      )

      const { cleanText, actions } = parseActions(response)

      const aiMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: cleanText,
        timestamp: new Date(),
        modelUsed,
        tier,
      }
      pushMessage(aiMsg)

      if (!open || minimized) setHasUnread(true)
      if (voiceOutputEnabled && cleanText) speak(cleanText, detectLang(cleanText))

      // Execute parsed actions sequentially
      for (const action of actions) {
        await new Promise(r => setTimeout(r, 300))

        if (action.type === 'navigate') {
          router.push(action.path)
          await new Promise(r => setTimeout(r, 800))
          const confirmMsg: ChatMessage = {
            id: newId(),
            role: 'assistant',
            content: `I've taken you to ${getPageLabel(action.path)}. What would you like to do next?`,
            timestamp: new Date(),
            modelUsed,
            tier,
          }
          pushMessage(confirmMsg)
          break
        } else if (action.type === 'open_sos') {
          router.push('/dashboard/mother/pregnancy/sos')
          break
        } else if (action.type === 'fill_form') {
          await new Promise(r => setTimeout(r, 700))
          for (const [fieldId, value] of Object.entries(action.fields)) {
            const el = document.querySelector(`[data-field-id="${fieldId}"]`) as
              HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
            if (el) fillReactInput(el, value)
          }
        } else if (action.type === 'scroll_to') {
          document.querySelector(action.selector)?.scrollIntoView({ behavior: 'smooth' })
        } else if (action.type === 'click_element') {
          (document.querySelector(action.selector) as HTMLElement | null)?.click()
        }
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        timestamp: new Date(),
      }
      pushMessage(errMsg)
    } finally {
      setLoading(false)
    }
  }, [ctx, open, minimized, voiceOutputEnabled, speak, stopSpeaking, pushMessage, router])

  const panelVisible = open && !minimized

  function handleBubbleTap() {
    // Ignore the click that fires at the end of a drag gesture.
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    if (panelVisible) {
      // Second tap → close.
      setOpen(false)
      setMinimized(false)
    } else {
      // First tap → open.
      setOpen(true)
      setMinimized(false)
      setHasUnread(false)
    }
  }

  return (
    <>
      <AnimatePresence>
        {panelVisible && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: 'spring', damping: 22, stiffness: 280 }}
            className="fixed bottom-24 right-4 z-[9998] flex flex-col rounded-2xl shadow-2xl border border-gray-100 overflow-hidden bg-white"
            style={{
              width: 'min(400px, calc(100vw - 2rem))',
              height: 'min(600px, calc(100vh - 8rem))',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={18} className="text-white select-none" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm leading-none">Shetu AI</p>
                <p className="text-white/60 text-[10px] mt-0.5">
                  Powered by AI · {ctx.currentPage.split('/').filter(Boolean).pop() ?? 'Home'}
                </p>
              </div>

              <button
                onClick={() => { setVoiceOutputEnabled(v => !v); if (voiceOutputEnabled) stopSpeaking() }}
                className={`p-1.5 rounded-lg transition-colors ${voiceOutputEnabled ? 'bg-white/30 text-white' : 'text-white/60 hover:text-white'}`}
                title={voiceOutputEnabled ? 'Mute AI voice' : 'Enable AI voice'}
              >
                {voiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>

              <button
                onClick={() => setVoiceMode(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${voiceMode ? 'bg-red-400/80 text-white' : 'text-white/60 hover:text-white'}`}
                title={voiceMode ? 'Exit voice mode' : 'Voice mode'}
              >
                {voiceMode ? <MicOff size={15} className="animate-pulse" /> : <Mic size={15} />}
              </button>

              <button
                onClick={() => setMinimized(true)}
                className="p-1.5 text-white/60 hover:text-white transition-colors"
                title="Minimize"
              >
                <Minus size={15} />
              </button>
              <button
                onClick={() => { setOpen(false); setMinimized(false) }}
                className="p-1.5 text-white/60 hover:text-white transition-colors"
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Greeting popup */}
            <div className="px-4 pt-3 pb-2 bg-white flex-shrink-0">
              <p className="text-sm font-semibold text-gray-800">Hi, I&apos;m your AI assistant</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Ask me anything about your health or the app</p>
              <div className="mt-2 border-b border-gray-100" />
            </div>

            <div className="flex-1 min-h-0">
              <ChatPanel
                messages={messages}
                loading={loading}
                voiceMode={voiceMode}
                language={ctx.language === 'bn' ? 'bn-BD' : 'en-US'}
                onSend={handleSend}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating bubble — draggable chat head */}
      <motion.button
        drag
        dragMomentum={false}
        dragElastic={0}
        style={{ x: dragX, y: dragY }}
        onDragStart={() => { draggedRef.current = true }}
        onDragEnd={() => {
          try {
            localStorage.setItem(
              'shetu_bubble_pos',
              JSON.stringify({ x: dragX.get(), y: dragY.get() })
            )
          } catch { /* ignore */ }
        }}
        onClick={handleBubbleTap}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-4 right-4 z-[9999] w-16 h-16 rounded-full shadow-2xl bg-gradient-to-br from-purple-500 via-purple-600 to-pink-500 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        title="Shetu AI — drag to move, tap to open"
        aria-label="Open Shetu AI chatbot"
      >
        <Bot size={28} className="text-white select-none" />
        {hasUnread && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">!</span>
          </span>
        )}
      </motion.button>
    </>
  )
}
