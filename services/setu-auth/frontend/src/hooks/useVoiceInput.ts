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
  abort(): void
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
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
  // Keep latest callbacks/flags in refs so the recognition event handlers
  // (bound once per start) never read stale closures.
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  const continuousRef = useRef(continuous)
  const languageRef = useRef(language)
  const wantListeningRef = useRef(false)

  useEffect(() => { onResultRef.current = onResult }, [onResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { continuousRef.current = continuous }, [continuous])
  useEffect(() => { languageRef.current = language }, [language])

  const stop = useCallback(() => {
    wantListeningRef.current = false
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    setListening(false)
  }, [])

  const beginRecognition = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognition()
    if (!SpeechRecognitionCtor) {
      onErrorRef.current?.('Speech recognition is not supported in this browser.')
      return
    }

    // Abort any previous instance to avoid InvalidStateError on restart.
    try { recognitionRef.current?.abort() } catch { /* ignore */ }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = languageRef.current
    recognition.continuous = continuousRef.current
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      if (final) onResultRef.current(final, true)
      else if (interim) onResultRef.current(interim, false)
    }

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onErrorRef.current?.('Microphone access denied. Allow mic access in your browser.')
        wantListeningRef.current = false
        setListening(false)
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.(`Voice error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      // In continuous mode the engine stops periodically — restart if the user
      // still wants to listen. Otherwise mark as stopped.
      if (wantListeningRef.current && continuousRef.current) {
        try { recognition.start() } catch { setListening(false) }
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      onErrorRef.current?.('Could not start voice recognition.')
      setListening(false)
    }
  }, [])

  const start = useCallback(async () => {
    wantListeningRef.current = true
    // Prime microphone permission explicitly — this reliably surfaces the
    // browser permission prompt before SpeechRecognition tries to use the mic.
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // We only needed the permission grant; release the tracks immediately.
        stream.getTracks().forEach((t) => t.stop())
      }
    } catch {
      onErrorRef.current?.('Microphone access denied. Allow mic access in your browser.')
      wantListeningRef.current = false
      return
    }
    if (wantListeningRef.current) beginRecognition()
  }, [beginRecognition])

  const toggle = useCallback(() => {
    if (listening) stop()
    else void start()
  }, [listening, start, stop])

  useEffect(() => () => { wantListeningRef.current = false; try { recognitionRef.current?.abort() } catch { /* ignore */ } }, [])

  return { listening, start, stop, toggle }
}
