'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export interface ChatbotUserContext {
  name: string
  role: 'mother' | 'patient' | 'unknown'
  language: 'bn' | 'en'
  currentPage: string
  sessionContext: string
}

function readUser(): Pick<ChatbotUserContext, 'name' | 'role' | 'language'> {
  if (typeof localStorage === 'undefined') return { name: 'User', role: 'unknown', language: 'en' }
  try {
    const raw = localStorage.getItem('shetu_user')
    if (!raw) return { name: 'User', role: 'unknown', language: 'en' }
    const u = JSON.parse(raw) as { name?: string; role?: string; language?: string }
    return {
      name: u.name ?? 'User',
      role: (u.role === 'mother' || u.role === 'patient') ? u.role : 'unknown',
      language: u.language === 'bn' ? 'bn' : 'en',
    }
  } catch {
    return { name: 'User', role: 'unknown', language: 'en' }
  }
}

function pageToContext(path: string): string {
  if (path.includes('pregnancy/vitals')) return 'User is logging pregnancy vitals'
  if (path.includes('pregnancy/sos')) return 'User is on the SOS emergency page'
  if (path.includes('pregnancy')) return 'User is tracking pregnancy'
  if (path.includes('saathi/checkin')) return 'User is doing daily mental health check-in'
  if (path.includes('saathi/vitals')) return 'User is logging vitals'
  if (path.includes('saathi/goals')) return 'User is managing health goals'
  if (path.includes('saathi/report')) return 'User is viewing health report'
  if (path.includes('saathi/consultancy')) return 'User is looking for doctor consultancy'
  if (path.includes('nutrition')) return 'User is viewing nutrition plan'
  if (path.includes('risk-prediction')) return 'User is checking risk assessment'
  if (path.includes('health-assistant')) return 'User is using the health assistant'
  if (path.includes('dashboard/mother')) return 'User is on the mother dashboard'
  if (path.includes('dashboard/patient')) return 'User is on the patient dashboard'
  return 'User is browsing the Shetu app'
}

export function useChatbotContext(): ChatbotUserContext {
  const pathname = usePathname()
  const [user, setUser] = useState<Pick<ChatbotUserContext, 'name' | 'role' | 'language'>>({
    name: 'User', role: 'unknown', language: 'en',
  })

  useEffect(() => {
    setUser(readUser())
    // Listen for login/logout events
    const handler = () => setUser(readUser())
    window.addEventListener('shetu_auth_change', handler)
    return () => window.removeEventListener('shetu_auth_change', handler)
  }, [])

  return {
    ...user,
    currentPage: pathname ?? '/',
    sessionContext: pageToContext(pathname ?? '/'),
  }
}

export function buildSystemPromptWithContext(basePrompt: string, ctx: ChatbotUserContext): string {
  return `${basePrompt}

Current user context:
- Name: ${ctx.name}
- Role: ${ctx.role}
- Language preference: ${ctx.language === 'bn' ? 'Bangla (respond in Bangla if user writes in Bangla)' : 'English'}
- Current page: ${ctx.currentPage}
- Session context: ${ctx.sessionContext}`
}
