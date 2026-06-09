'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, AttachedFile } from '@/lib/centralChatbot'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import LabValuesForm from './LabValuesForm'

interface ChatPanelProps {
  messages: ChatMessage[]
  loading: boolean
  voiceMode: boolean
  language: 'bn-BD' | 'en-US'
  onSend: (text: string, file?: AttachedFile) => void
}

const QUICK_CHIPS = [
  { label: '🩺 My vitals',       msg: 'Take me to my vitals page' },
  { label: '🥗 Nutrition plan',  msg: 'Show me my nutrition plan' },
  { label: '⚠️ Risk level',      msg: "What's my health risk level?" },
  { label: '👨‍⚕️ Book a doctor', msg: 'I want to book a doctor' },
  { label: '📊 My report',       msg: 'Show me my health report' },
  { label: '🧪 Lab results',     msg: '__LAB_FORM__' },
]

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs">✦</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({ messages, loading, voiceMode, language, onSend }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showLabForm, setShowLabForm] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, showLabForm])

  function handleChip(msg: string) {
    if (msg === '__LAB_FORM__') {
      setShowLabForm(true)
      return
    }
    onSend(msg)
  }

  function handleLabSubmit(message: string) {
    setShowLabForm(false)
    onSend(message)
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 overscroll-contain">
        {isEmpty && !showLabForm ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg">
              <span className="text-white text-3xl">✦</span>
            </div>
            <p className="text-gray-800 font-semibold">Hi! I&apos;m Shetu AI</p>
            <p className="text-gray-400 text-sm mt-1 leading-relaxed">
              Your health companion. Ask me anything — I can navigate the app, analyse lab results, and answer health questions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => handleChip(chip.msg)}
                  className="text-xs px-3 py-1.5 rounded-full border border-purple-200 text-purple-700 bg-white hover:bg-purple-50 transition-colors shadow-sm"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Lab values form — shown inline above input */}
      {showLabForm && (
        <LabValuesForm
          onSubmit={handleLabSubmit}
          onClose={() => setShowLabForm(false)}
        />
      )}

      {/* "Enter lab values" button in conversation context — appears after messages too */}
      {!isEmpty && !showLabForm && !loading && (
        <div className="px-3 pb-1 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setShowLabForm(true)}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-purple-200 text-purple-700 bg-white hover:bg-purple-50 transition-colors shadow-sm"
          >
            🧪 Enter lab values
          </button>
        </div>
      )}

      <ChatInput onSend={onSend} disabled={loading} voiceMode={voiceMode} language={language} />
    </div>
  )
}
