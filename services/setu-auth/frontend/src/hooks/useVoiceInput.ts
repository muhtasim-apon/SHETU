'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Browser Speech Recognition types (not in default TS lib)
interface ISpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
interface ISpeechRecognitionResult { readonly [index: number]: { transcript: string }; readonly isFinal: boolean }
interface ISpeechRecognitionEvent { readonly resultIndex: number; readonly results: { readonly [index: number]: ISpeechRecognitionResult; readonly length: number } }
interface ISpeechRecognitionErrorEvent { readonly error: string }
type ISpeechRecognitionCtor = new () => ISpeechRecognition

function getSpeechRecognition(): ISpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as ISpeechRecognitionCtor | null
}

interface UseVoiceInputOptions {
  language?: 'bn-BD' | 'en-US'
  continuous?: boolean
  onResult: (transcript: string, isFinal: boolean) => void
  onError?: (err: string) => void
}

export function useVoiceInput({ language = 'en-US', continuous = false, onResult, onError }: UseVoiceInputOptions) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition()
    if (!SpeechRecognitionCtor) {
      onError?.('Speech recognition is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = language
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      if (final) onResult(final, true)
      else if (interim) onResult(interim, false)
    }

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') onError?.('Microphone access denied.')
      else if (event.error !== 'no-speech') onError?.(`Voice error: ${event.error}`)
      setListening(false)
    }

    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      onError?.('Could not start voice recognition.')
    }
  }, [language, continuous, onResult, onError])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { listening, start, stop, toggle }
}
