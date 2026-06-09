'use client'

import { Volume2 } from 'lucide-react'
import type { ChatMessage } from '@/lib/centralChatbot'
import { useVoiceOutput, detectLang } from '@/hooks/useVoiceOutput'

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function modelBadge(modelUsed?: string, tier?: number): string | null {
  if (!modelUsed) return null
  const parts = modelUsed.split('/')
  const name = parts[parts.length - 1]
  if (name.includes('gemini-2.0-flash')) return 'Gemini Flash'
  if (name.includes('gemini-1.5-flash')) return 'Gemini 1.5'
  if (name.includes('llama-3.3')) return 'Llama 3.3'
  if (name.includes('llama3.2')) return 'Llama 3.2'
  if (name.includes('mistral')) return 'Mistral 7B'
  if (name.includes('qwen')) return 'Qwen 3'
  if (name.includes('phi3')) return 'Phi-3'
  if (tier === 3) return 'Local LLM'
  return name.split(':')[0]
}

interface Props {
  message: ChatMessage
}

export default function MessageBubble({ message }: Props) {
  const { speak } = useVoiceOutput()
  const isUser = message.role === 'user'
  const badge = modelBadge(message.modelUsed, message.tier)

  return (
    <div className={`flex items-end gap-2 mb-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 mb-4">
          <span className="text-white text-xs">✦</span>
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        {message.fileAttachment?.previewUrl && (
          <img
            src={message.fileAttachment.previewUrl}
            alt={message.fileAttachment.name}
            className="rounded-xl max-w-full max-h-36 object-cover border border-gray-200"
          />
        )}

        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-br-sm'
              : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
          }`}
        >
          {message.content}
        </div>

        <div className={`flex items-center gap-2 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-gray-400">{timeAgo(message.timestamp)}</span>
          {!isUser && (
            <>
              <button
                onClick={() => speak(message.content, detectLang(message.content))}
                className="text-gray-300 hover:text-purple-500 transition-colors"
                title="Read aloud"
              >
                <Volume2 size={12} />
              </button>
              {badge && (
                <span className="text-[9px] text-gray-300 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-full">
                  via {badge}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
