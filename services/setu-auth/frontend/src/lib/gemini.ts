import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY

if (!API_KEY) {
  console.error('[Shetu] NEXT_PUBLIC_GEMINI_API_KEY is missing from .env.local')
}

const genAI = new GoogleGenerativeAI(API_KEY ?? '')

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

export async function sendMessageToMaa(
  history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>,
  userMessage: string,
  context: { weeks: number; trimester: string; edd: string }
): Promise<{ response: string; redFlagDetected: boolean; redFlagType?: string }> {

  if (!API_KEY) {
    throw new Error('Gemini API key not configured. Add NEXT_PUBLIC_GEMINI_API_KEY to .env.local')
  }

  const systemPrompt = `${MATERNAL_SYSTEM_PROMPT}
- Patient is ${context.weeks} weeks pregnant (trimester ${context.trimester}), due: ${context.edd}`

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    })

    const chat = model.startChat({ history })
    const result = await chat.sendMessage(userMessage)
    const responseText = result.response.text()

    const lower = responseText.toLowerCase()
    const matchedFlag = RED_FLAGS.find(flag => lower.includes(flag))

    return {
      response: responseText,
      redFlagDetected: !!matchedFlag,
      redFlagType: matchedFlag,
    }
  } catch (err) {
    console.error('[Shetu Gemini] API call failed:', err)
    throw err
  }
}