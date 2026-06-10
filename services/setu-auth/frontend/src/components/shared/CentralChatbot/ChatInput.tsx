'use client'

import { useRef, useState, KeyboardEvent, useEffect } from 'react'
import { Send, Paperclip, Mic, MicOff, X, FileText } from 'lucide-react'
import type { AttachedFile } from '@/lib/centralChatbot'
import { useVoiceInput } from '@/hooks/useVoiceInput'

interface ChatInputProps {
  onSend: (text: string, file?: AttachedFile) => void
  disabled?: boolean
  voiceMode?: boolean
  language?: 'bn-BD' | 'en-US'
}

async function extractPdfText(base64: string): Promise<string> {
  try {
    // Dynamically import pdfjs to avoid SSR issues
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
    const texts: string[] = []
    for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      texts.push(content.items.map((i: unknown) => (i as { str: string }).str).join(' '))
    }
    return texts.join('\n')
  } catch {
    return ''
  }
}

export default function ChatInput({ onSend, disabled, voiceMode, language = 'en-US' }: ChatInputProps) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<AttachedFile | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { listening, supported: voiceSupported, toggle: toggleVoice } = useVoiceInput({
    language,
    continuous: voiceMode,
    onResult: (transcript, isFinal) => {
      setText(transcript)
      if (isFinal && voiceMode) {
        setTimeout(() => {
          handleSend(transcript)
          setText('')
        }, 400)
      }
    },
    onError: (err) => {
      console.warn('[Voice]', err)
      setVoiceError(err)
    },
  })

  function handleSend(overrideText?: string) {
    const trimmed = (overrideText ?? text).trim()
    if (!trimmed && !file) return
    onSend(trimmed, file ?? undefined)
    setText('')
    setFile(null)
    textareaRef.current?.focus()
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      const isImage = f.type.startsWith('image/')
      const previewUrl = isImage ? result : undefined
      let extractedText: string | undefined
      if (f.type === 'application/pdf') {
        extractedText = await extractPdfText(base64)
      }
      setFile({ name: f.name, size: f.size, type: f.type, base64, previewUrl, extractedText })
    }
    reader.readAsDataURL(f)
    e.target.value = ''
  }

  function formatSize(bytes: number) {
    return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
  }

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`
  }, [text])

  return (
    <div className="border-t border-gray-100 p-3 bg-white rounded-b-2xl">
      {file && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
          {file.previewUrl ? (
            <img src={file.previewUrl} alt={file.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-purple-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{file.name}</p>
            <p className="text-[10px] text-gray-400">{formatSize(file.size)}{file.extractedText ? ' · text extracted' : ''}</p>
          </div>
          <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-400 transition-colors flex-shrink-0 p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {voiceError && (
        <div className="flex items-start gap-2 mb-2 p-2 bg-amber-50 rounded-xl border border-amber-100">
          <p className="flex-1 text-[11px] leading-snug text-amber-700">{voiceError}</p>
          <button onClick={() => setVoiceError(null)} className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0 p-0.5">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40"
          title="Attach file"
        >
          <Paperclip size={19} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? 'Listening…' : 'Ask Shetu AI anything…'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-purple-400 bg-gray-50 overflow-y-auto disabled:opacity-50 transition-colors"
          style={{ lineHeight: '1.5', minHeight: '38px', maxHeight: '96px' }}
        />

        <button
          onClick={() => { setVoiceError(null); toggleVoice() }}
          disabled={disabled || voiceSupported === false}
          className={`flex-shrink-0 p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            listening ? 'text-red-500' : 'text-gray-400 hover:text-purple-600'
          }`}
          title={
            voiceSupported === false
              ? 'Voice input needs an HTTPS connection on this device'
              : listening ? 'Stop recording' : 'Voice input'
          }
        >
          {listening ? <MicOff size={19} className="animate-pulse" /> : <Mic size={19} />}
        </button>

        <button
          onClick={() => handleSend()}
          disabled={disabled || (!text.trim() && !file)}
          className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  )
}
