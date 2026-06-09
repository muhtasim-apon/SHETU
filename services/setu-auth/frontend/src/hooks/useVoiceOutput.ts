'use client'

import { useCallback, useRef } from 'react'

export function useVoiceOutput() {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const speak = useCallback((text: string, lang: 'bn-BD' | 'en-US' = 'en-US') => {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.95
    utterance.pitch = 1
    // Prefer a local voice for the chosen language
    const voices = speechSynthesis.getVoices()
    const match = voices.find(v => v.lang === lang) ?? voices.find(v => v.lang.startsWith(lang.split('-')[0]))
    if (match) utterance.voice = match
    utteranceRef.current = utterance
    speechSynthesis.speak(utterance)
  }, [])

  const stop = useCallback(() => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }, [])

  const isSpeaking = useCallback(() => {
    return typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking
  }, [])

  return { speak, stop, isSpeaking }
}

// Detect language of a string (rough heuristic: Unicode Bangla range U+0980–U+09FF)
export function detectLang(text: string): 'bn-BD' | 'en-US' {
  const banglaChars = (text.match(/[ঀ-৿]/g) ?? []).length
  return banglaChars / text.length > 0.15 ? 'bn-BD' : 'en-US'
}
