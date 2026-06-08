import { GoogleGenerativeAI } from '@google/generative-ai'
import type { RiskProfile, QAAnswer, RiskReport } from './risk-prediction'
import type { NutritionProfile, NutritionPlan } from './nutrition'
import { getCurrentSeason } from './nutrition'

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

export const RISK_SYSTEM_PROMPT = `You are Shetu Risk, a clinical decision-support AI for Bangladesh. Given a patient profile and symptom questionnaire answers, return ONLY valid JSON (no markdown, no prose) in exactly this shape:
{
  "conditions": [
    {
      "name": string,
      "probability": number (0-100),
      "band": "low"|"watch"|"elevated"|"urgent",
      "contributing_symptoms": string[],
      "confidence": "low"|"medium"|"high"
    }
  ],
  "overall_band": "low"|"watch"|"elevated"|"urgent",
  "next_action": string,
  "timeframe": string,
  "alert_chw": boolean,
  "specialist_needed": boolean
}
Rank conditions by probability descending. Limit to top 5. For pregnant females always include miscarriage risk, preeclampsia risk, gestational diabetes risk as candidates even if probability is low.`

export const NUTRITION_SYSTEM_PROMPT = `You are Shetu Pushti, a Bangladesh nutrition AI. Given patient profile + season (derive from current month: Dec-Feb=winter, Mar-May=summer, Jun-Oct=monsoon, Nov=winter) + division + conditions, return ONLY valid JSON:
{
  "daily_calories_target": number,
  "avoid_foods": [{ "name": string, "reason": string }],
  "meal_plan": {
    "breakfast": [{ "food": string, "amount_g": number, "notes": string }],
    "lunch": [{ "food": string, "amount_g": number, "notes": string }],
    "snack": [{ "food": string, "amount_g": number, "notes": string }],
    "dinner": [{ "food": string, "amount_g": number, "notes": string }]
  },
  "weekly_variety": [
    { "day": "Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun", "highlight_food": string, "benefit": string }
  ],
  "hydration_ml": number,
  "supplements": [{ "name": string, "dose": string, "timing": string }],
  "track_id": "pregnancy"|"anaemia"|"diabetes"|"hypertension"|"child"|"adolescent"|"general"
}
Prioritise low price_tier foods from the patient's division and current season. For pregnant women: 300 extra kcal, emphasise folate, iron, calcium. For gestational diabetes: avoid high-GI foods, emphasise bitter melon, okra. For hypertension: low sodium, emphasise potassium-rich foods. For third-gender users: apply general adult track unless conditions specify.`

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

async function tryLocalLLM(prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', prompt, stream: false }),
  })
  if (!res.ok) throw new Error(`Local LLM ${res.status}`)
  const data = await res.json()
  return data.response ?? ''
}

const RISK_OPENROUTER_MODELS = ['openai/gpt-4o-mini', 'deepseek/deepseek-chat']
const RISK_GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.0-flash']

async function callLLMCascade(
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string,
  imageMimeType?: string
): Promise<string> {
  let lastError: unknown = null

  if (OPENROUTER_KEY) {
    for (const model of RISK_OPENROUTER_MODELS) {
      try {
        const content: unknown[] = [{ type: 'text', text: userPrompt }]
        if (imageBase64 && imageMimeType?.startsWith('image/')) {
          content.push({ type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } })
        }
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            'X-Title': 'Shetu Risk',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content },
            ],
          }),
        })
        if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content
        if (!text) throw new Error('Empty response')
        return text
      } catch (err) {
        lastError = err
        console.warn(`[Shetu] OpenRouter ${model} failed`, err)
      }
    }
  }

  if (API_KEY) {
    for (const model of RISK_GEMINI_MODELS) {
      try {
        const m = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt })
        if (imageBase64 && imageMimeType?.startsWith('image/') && model === 'gemini-2.0-flash') {
          const result = await m.generateContent([
            userPrompt,
            { inlineData: { data: imageBase64, mimeType: imageMimeType as 'image/png' | 'image/jpeg' } },
          ])
          return result.response.text()
        } else {
          const result = await m.generateContent(userPrompt)
          return result.response.text()
        }
      } catch (err) {
        lastError = err
        console.warn(`[Shetu] Gemini ${model} failed`, err)
      }
    }
  }

  try {
    return await tryLocalLLM(`${systemPrompt}\n\n${userPrompt}`)
  } catch (err) {
    lastError = err
    console.warn('[Shetu] Local LLM failed', err)
  }

  throw lastError instanceof Error ? lastError : new Error('All AI models unavailable')
}

export async function sendRiskPrediction(
  profile: RiskProfile,
  answers: QAAnswer[],
  fileBase64?: string,
  fileMimeType?: string
): Promise<RiskReport> {
  const answersText = answers
    .map((a) => `Q(${a.questionId}): ${a.label}`)
    .join('\n')

  let fileNote = ''
  if (fileBase64) {
    if (fileMimeType === 'application/pdf') {
      fileNote = '\n\nPDF lab report attached (base64). Extract numeric values (glucose, HbA1c, BP, haemoglobin, creatinine, etc.) and factor them into the risk assessment.'
    } else if (fileMimeType?.startsWith('image/')) {
      fileNote = '\n\nLab report image attached. Extract visible numeric values and factor them into the risk assessment.'
    }
  }

  const userPrompt = `Patient Profile:
- Gender: ${profile.gender}
- Pregnant: ${profile.pregnant}
- Age: ${profile.age}
- Weight: ${profile.weight_kg} kg
- Height: ${profile.height_cm} cm
- BMI: ${profile.bmi.toFixed(1)}
- Division: ${profile.division}
- Known Conditions: ${profile.conditions.join(', ') || 'None'}

Symptom Questionnaire Answers:
${answersText}${fileNote}`

  const isImage = fileMimeType?.startsWith('image/')
  const rawText = await callLLMCascade(
    RISK_SYSTEM_PROMPT,
    userPrompt,
    isImage ? fileBase64 : undefined,
    isImage ? fileMimeType : undefined
  )

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse risk report JSON')
  return JSON.parse(jsonMatch[0]) as RiskReport
}

export async function sendNutritionPlan(profile: NutritionProfile): Promise<NutritionPlan> {
  const season = getCurrentSeason()
  const month = new Date().toLocaleString('en', { month: 'long' })

  const userPrompt = `Patient Profile:
- Gender: ${profile.gender}
- Pregnant: ${profile.pregnant}
- Age: ${profile.age}
- Weight: ${profile.weight_kg} kg
- Height: ${profile.height_cm} cm
- BMI: ${profile.bmi.toFixed(1)}
- Division: ${profile.division}
- Known Conditions: ${profile.conditions.join(', ') || 'None'}
- Current Month: ${month} (Season: ${season})`

  const rawText = await callLLMCascade(NUTRITION_SYSTEM_PROMPT, userPrompt)

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse nutrition plan JSON')
  return JSON.parse(jsonMatch[0]) as NutritionPlan
}

export async function sendNutritionReview(
  ate: string[],
  missed: string[],
  profile: NutritionProfile
): Promise<string> {
  const season = getCurrentSeason()
  const prompt = `Summarise today's nutrition adherence (ate: [${ate.join(', ')}], missed: [${missed.join(', ')}]) for a ${profile.gender} patient aged ${profile.age} with conditions: ${profile.conditions.join(', ') || 'none'} in ${profile.division}, Bangladesh (${season} season). Call out top missed nutrient. Suggest one adjustment for tomorrow. Under 100 words. Respond in English.`
  return callLLMCascade(
    'You are Shetu Pushti, a friendly Bangladesh nutrition AI. Give concise, actionable feedback.',
    prompt
  )
}

export async function sendSubstituteRequest(
  food: string,
  profile: NutritionProfile
): Promise<{ food: string; amount_g: number; notes: string }> {
  const season = getCurrentSeason()
  const prompt = `Suggest one affordable substitute for ${food} for a ${profile.conditions.join('/')} patient in ${profile.division} Bangladesh in ${season} season. Reply only valid JSON: { "food": string, "amount_g": number, "notes": string }`
  const raw = await callLLMCascade(
    'You are Shetu Pushti. Return only valid JSON, no prose.',
    prompt
  )
  const match = raw.match(/\{[\s\S]*?\}/)
  if (!match) return { food: 'Dal (lentil)', amount_g: 100, notes: 'Affordable protein substitute' }
  return JSON.parse(match[0])
}

export interface LabReportAnalysis {
  extracted_values: Array<{ name: string; value: string; unit: string; status: 'normal' | 'abnormal' | 'critical' }>
  summary: string
  flags: Array<{ marker: string; concern: string; severity: 'low' | 'medium' | 'high' }>
  recommendations: string[]
}

const LAB_SYSTEM_PROMPT = `You are a clinical lab report interpreter for Bangladesh. Given a lab report image or PDF content, extract all numeric values and interpret them. Return ONLY valid JSON:
{
  "extracted_values": [{ "name": string, "value": string, "unit": string, "status": "normal"|"abnormal"|"critical" }],
  "summary": string (2-3 sentences plain English),
  "flags": [{ "marker": string, "concern": string, "severity": "low"|"medium"|"high" }],
  "recommendations": string[]
}
Focus on: haemoglobin, blood glucose, HbA1c, BP, creatinine, urea, TSH, platelets, WBC, RBC.`

export async function analyseLabReport(
  fileBase64: string,
  mimeType: string
): Promise<LabReportAnalysis> {
  const isPdf = mimeType === 'application/pdf'

  if (isPdf) {
    const userPrompt = `This is a base64-encoded PDF lab report. Extract all numeric diagnostic values (glucose, HbA1c, haemoglobin, BP, creatinine, TSH, etc.) and return the analysis JSON as specified. Base64 content begins with: ${fileBase64.substring(0, 200)}...`
    const raw = await callLLMCascade(LAB_SYSTEM_PROMPT, userPrompt)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Could not parse lab report')
    return JSON.parse(match[0]) as LabReportAnalysis
  }

  // Image: use OpenRouter with vision first, then Gemini vision
  let lastError: unknown = null

  if (OPENROUTER_KEY) {
    for (const model of ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku']) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            'X-Title': 'Shetu Lab',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: LAB_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyse this lab report image.' },
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
                ],
              },
            ],
          }),
        })
        if (!res.ok) throw new Error(`OpenRouter ${res.status}`)
        const data = await res.json()
        const text = data?.choices?.[0]?.message?.content ?? ''
        const match = text.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Empty parse')
        return JSON.parse(match[0]) as LabReportAnalysis
      } catch (err) {
        lastError = err
      }
    }
  }

  if (API_KEY) {
    try {
      const m = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: LAB_SYSTEM_PROMPT })
      const result = await m.generateContent([
        'Analyse this lab report image.',
        { inlineData: { data: fileBase64, mimeType: mimeType as 'image/png' | 'image/jpeg' } },
      ])
      const text = result.response.text()
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Parse failed')
      return JSON.parse(match[0]) as LabReportAnalysis
    } catch (err) {
      lastError = err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Lab analysis failed')
}
