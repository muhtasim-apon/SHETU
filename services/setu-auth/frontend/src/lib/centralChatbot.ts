import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? ''
const OPENROUTER_KEY = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ?? ''
const OLLAMA_BASE = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL ?? 'http://localhost:11434'

const genAI = new GoogleGenerativeAI(GEMINI_KEY)

// Only models confirmed working as of June 2026
const OPENROUTER_MODELS = [
  { model: 'openai/gpt-oss-20b:free', vision: false },
  { model: 'moonshotai/kimi-k2.6:free', vision: false },
  { model: 'openai/gpt-oss-120b:free', vision: false },
  { model: 'google/gemma-4-31b-it:free', vision: false },
  { model: 'nvidia/nemotron-3-super-120b-a12b:free', vision: false },
  { model: 'meta-llama/llama-3.3-70b-instruct:free', vision: false },
  { model: 'nousresearch/hermes-3-llama-3.1-405b:free', vision: false },
]

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
]

export const CENTRAL_SYSTEM_PROMPT = `You are Shetu AI, the intelligent health assistant for the Shetu platform — Bangladesh's maternal and general healthcare app. You help both pregnant mothers (Maa module) and general patients (Saathi module).

You know the full app structure:
- Auth: /auth/signin, /auth/signup
- Mother paths: /dashboard/mother, /dashboard/mother/pregnancy, /dashboard/mother/pregnancy/chat, /dashboard/mother/pregnancy/vitals, /dashboard/mother/pregnancy/sos, /dashboard/mother/nutrition, /dashboard/mother/risk-prediction, /dashboard/mother/saathi/consultancy, /dashboard/mother/saathi/report, /dashboard/mother/saathi/blog
- Patient paths: /dashboard/patient, /dashboard/patient/health-assistant, /dashboard/patient/nutrition, /dashboard/patient/risk-prediction, /dashboard/patient/saathi/checkin, /dashboard/patient/saathi/vitals, /dashboard/patient/saathi/goals, /dashboard/patient/saathi/profile, /dashboard/patient/saathi/report, /dashboard/patient/saathi/consultancy, /dashboard/patient/saathi/blog

When the user asks to navigate, go to a page, or do something app-related, embed this JSON on its own line in your response:
{"__action": "navigate", "path": "/dashboard/patient/saathi/vitals"}

For emergencies: say "Call 999 immediately" AND embed: {"__action": "open_sos"}
For form filling: {"__action": "fill_form", "formId": "vitals-form", "fields": {"weight": "58"}}

Guidelines:
- Be warm, supportive, speak in the user's language (Bangla or English)
- Keep responses under 200 words for mobile
- Never diagnose — always say "consult your doctor"
- For lab reports: extract hemoglobin, glucose, HbA1c, BP, creatinine, TSH and flag abnormals
- After navigation actions, confirm: "I've taken you to [page name]. What would you like to do next?"`

export interface AttachedFile {
  name: string
  size: number
  type: string
  base64?: string
  previewUrl?: string
  extractedText?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  fileAttachment?: AttachedFile
  modelUsed?: string
  tier?: number
}

type GeminiHistory = Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>

function toGeminiHistory(history: ChatMessage[]): GeminiHistory {
  return history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

async function callGeminiSDK(
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  userText: string,
  file?: AttachedFile
): Promise<string> {
  const m = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt })
  const chat = m.startChat({ history: toGeminiHistory(history) })

  if (file?.base64 && file.type.startsWith('image/')) {
    const result = await chat.sendMessage([
      { text: userText || 'Analyse this image.' },
      { inlineData: { data: file.base64, mimeType: file.type as 'image/jpeg' } },
    ])
    return result.response.text()
  }

  let text = userText
  if (file?.extractedText) text = `[PDF Content: ${file.extractedText.slice(0, 3000)}]\n\nUser: ${text}`
  else if (file) text = `${text}\n[Attached file: ${file.name}]`

  const result = await chat.sendMessage(text)
  return result.response.text()
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  userText: string,
  file?: AttachedFile
): Promise<string> {
  if (!OPENROUTER_KEY) throw new Error('No OpenRouter key')

  const messages: unknown[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  ]

  if (file?.base64 && file.type.startsWith('image/')) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userText || 'Analyse this image.' },
        { type: 'image_url', image_url: { url: `data:${file.type};base64,${file.base64}` } },
      ],
    })
  } else {
    let text = userText
    if (file?.extractedText) text = `[PDF Content: ${file.extractedText.slice(0, 3000)}]\n\nUser: ${text}`
    else if (file) text = `${text}\n[Attached: ${file.name}]`
    messages.push({ role: 'user', content: text })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'X-Title': 'Shetu AI',
      'HTTP-Referer': 'https://shetu.health',
    },
    body: JSON.stringify({ model, messages, max_tokens: 512 }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText)
    throw new Error(`OR ${res.status}: ${t.slice(0, 150)}`)
  }
  const data = await res.json() as { choices?: Array<{ message: { content: string | null } }> }
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty OpenRouter response')
  return content
}

async function callOllama(
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  userText: string
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000) // 5s timeout — fail fast if Ollama not running
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\n${history.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')}\nUser: ${userText}\nAssistant:`,
        stream: false,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as { response?: string }
    return data.response ?? ''
  } catch (e) {
    clearTimeout(timer)
    if ((e as { name?: string }).name === 'AbortError') throw new Error('Ollama not running (timeout)')
    throw e
  }
}

export async function sendChatMessage(
  history: ChatMessage[],
  userText: string,
  systemPrompt: string,
  file?: AttachedFile
): Promise<{ response: string; modelUsed: string; tier: number }> {
  const hasImage = !!file?.base64 && file.type.startsWith('image/')
  let lastError: unknown = null

  // For image (vision) requests, Gemini is the reliable path — try it FIRST.
  // OpenRouter free models here are text-only, and Ollama isn't vision-capable,
  // so for images we must not fall through to them (that produced the
  // misleading "Failed to fetch" from Ollama). See item 1e.
  if (hasImage && GEMINI_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await callGeminiSDK(model, systemPrompt, history, userText, file)
        return { response, modelUsed: `gemini/${model}`, tier: 1 }
      } catch (err) {
        lastError = err
        console.warn(`[Shetu AI] Gemini(vision)/${model} failed:`, (err as Error).message)
      }
    }
  }

  // Tier 1: OpenRouter free models (text, or vision-capable models if any)
  if (OPENROUTER_KEY) {
    for (const { model, vision } of OPENROUTER_MODELS) {
      if (hasImage && !vision) continue
      try {
        const response = await callOpenRouter(model, systemPrompt, history, userText, file)
        return { response, modelUsed: `openrouter/${model}`, tier: 1 }
      } catch (err) {
        lastError = err
        console.warn(`[Shetu AI] OR/${model} failed:`, (err as Error).message)
      }
    }
  }

  // Tier 2: Gemini SDK (text fallback when OpenRouter is exhausted)
  if (!hasImage && GEMINI_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await callGeminiSDK(model, systemPrompt, history, userText, file)
        return { response, modelUsed: `gemini/${model}`, tier: 2 }
      } catch (err) {
        lastError = err
        console.warn(`[Shetu AI] Gemini/${model} failed:`, (err as Error).message)
      }
    }
  }

  // Tier 3: Local Ollama (text only — skip entirely for image requests)
  if (!hasImage) {
    for (const model of ['llama3.2:3b', 'phi3:mini', 'llama3.2', 'mistral']) {
      try {
        const response = await callOllama(model, systemPrompt, history, userText)
        if (response) return { response, modelUsed: `ollama/${model}`, tier: 3 }
      } catch (err) {
        lastError = err
        console.warn(`[Shetu AI] Ollama/${model} failed:`, (err as Error).message)
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`AI unavailable — all providers failed. Last error: ${msg}`)
}
