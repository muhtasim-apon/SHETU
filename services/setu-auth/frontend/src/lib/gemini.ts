import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY
const OPENROUTER_KEY = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY

if (!API_KEY && !OPENROUTER_KEY) {
  console.error('[Shetu] No AI key configured. Add NEXT_PUBLIC_GEMINI_API_KEY or NEXT_PUBLIC_OPENROUTER_API_KEY to .env.local')
}

const genAI = new GoogleGenerativeAI(API_KEY ?? '')

// Tried in order. When one hits a rate limit / quota / error we fall through to
// the next so Maa keeps answering even after Gemini 2.5 Flash is exhausted.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]

// OpenRouter fallbacks (used only if every Gemini model above fails). Free /
// cheap models that support multilingual (Bangla + English) chat.
const OPENROUTER_MODELS = [
  'deepseek/deepseek-chat',
  'qwen/qwen-2.5-72b-instruct',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct',
]

export const MATERNAL_SYSTEM_PROMPT = `You are Shetu Maa, a warm and trusted maternal health companion for pregnant women in Bangladesh. You speak like a caring relative who also knows maternal health deeply.

Guidelines:
- Respond in the same language the user writes in (Bangla or English)
- Be supportive, calm, never alarming
- For danger signs (severe headache, blurred vision, heavy bleeding, severe abdominal pain, no fetal movement 12+ hours, high fever) tell the user to call 999 and use SOS immediately
- Never diagnose. Always say "consult your doctor"
- Keep responses under 150 words for mobile readability
- Reference pregnancy week and trimester when helpful
- Remind about ANC visits, iron supplements, nutrition`

const RED_FLAGS = [
  '999', 'emergency', 'immediately', 'call doctor now',
  'heavy bleeding', 'severe headache', 'no movement',
  'hospital now', 'danger sign',
]

type History = Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>

// A 429 / quota / rate-limit error means "try the next model", not "give up".
function isQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('exhausted') ||
    msg.includes('too many requests')
  )
}

async function tryGemini(
  model: string,
  systemPrompt: string,
  history: History,
  userMessage: string
): Promise<string> {
  const m = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt })
  const chat = m.startChat({ history })
  const result = await chat.sendMessage(userMessage)
  return result.response.text()
}

async function tryOpenRouter(
  model: string,
  systemPrompt: string,
  history: History,
  userMessage: string
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts.map(p => p.text).join(' '),
    })),
    { role: 'user', content: userMessage },
  ]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'X-Title': 'Shetu Maa',
    },
    body: JSON.stringify({ model, messages }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter returned empty response')
  return content
}

export async function sendMessageToMaa(
  history: History,
  userMessage: string,
  context: { weeks: number; trimester: string; edd: string }
): Promise<{ response: string; redFlagDetected: boolean; redFlagType?: string; modelUsed: string }> {

  if (!API_KEY && !OPENROUTER_KEY) {
    throw new Error('AI not configured. Add NEXT_PUBLIC_GEMINI_API_KEY or NEXT_PUBLIC_OPENROUTER_API_KEY to .env.local')
  }

  const systemPrompt = `${MATERNAL_SYSTEM_PROMPT}
- Patient is ${context.weeks} weeks pregnant (trimester ${context.trimester}), due: ${context.edd}`

  let responseText: string | null = null
  let modelUsed = ''
  let lastError: unknown = null

  // 1. Walk the Gemini model chain.
  if (API_KEY) {
    for (const model of GEMINI_MODELS) {
      try {
        responseText = await tryGemini(model, systemPrompt, history, userMessage)
        modelUsed = model
        break
      } catch (err) {
        lastError = err
        console.warn(`[Shetu Maa] ${model} failed${isQuotaError(err) ? ' (quota)' : ''}, trying next…`, err)
        // For non-quota errors (e.g. invalid request) trying another model of the
        // same family is unlikely to help, but it's cheap, so keep going.
      }
    }
  }

  // 2. Fall back to OpenRouter if every Gemini model failed.
  if (responseText === null && OPENROUTER_KEY) {
    for (const model of OPENROUTER_MODELS) {
      try {
        responseText = await tryOpenRouter(model, systemPrompt, history, userMessage)
        modelUsed = `openrouter:${model}`
        break
      } catch (err) {
        lastError = err
        console.warn(`[Shetu Maa] OpenRouter ${model} failed, trying next…`, err)
      }
    }
  }

  if (responseText === null) {
    console.error('[Shetu Maa] All models failed:', lastError)
    throw lastError instanceof Error ? lastError : new Error('All AI models are unavailable. Please try again shortly.')
  }

  const lower = responseText.toLowerCase()
  const matchedFlag = RED_FLAGS.find(flag => lower.includes(flag))

  return {
    response: responseText,
    redFlagDetected: !!matchedFlag,
    redFlagType: matchedFlag,
    modelUsed,
  }
}
