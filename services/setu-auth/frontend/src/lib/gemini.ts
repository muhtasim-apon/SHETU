import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!)

export const MATERNAL_SYSTEM_PROMPT = `You are Shetu Maa, a warm and trusted maternal health companion for pregnant women in Bangladesh. You are like a caring relative who also has deep knowledge of maternal health, the WHO antenatal care guidelines, and Bangladesh DGHS protocols.

Guidelines:
- Respond warmly in the same language the user writes in (Bangla or English)
- For Bangla input, respond in Bangla; for English input, respond in English
- Always be supportive, calm, and non-alarmist
- For ANY of these danger signs, immediately tell the user to call 999 and use the SOS button: severe headache, blurred vision, heavy bleeding, severe abdominal pain, no fetal movement for 12+ hours, high fever, swollen face/hands/feet with headache, difficulty breathing
- Never diagnose. Always say "consult your doctor" for medical questions
- Keep responses concise (under 150 words) for easy reading on mobile
- Reference weeks/trimester when relevant
- Remind about ANC visits, iron supplements, nutrition when appropriate`

const RED_FLAGS = [
  '999', 'emergency', 'immediately', 'call doctor now',
  'heavy bleeding', 'severe headache', 'no movement',
]

export async function sendMessageToMaa(
  messages: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>,
  userMessage: string,
  pregnancyContext: { weeks: number; trimester: string; edd: string }
): Promise<{ response: string; redFlagDetected: boolean; redFlagType?: string }> {
  const contextualPrompt = `${MATERNAL_SYSTEM_PROMPT}
- You know the user's pregnancy week: ${pregnancyContext.weeks} weeks, trimester: ${pregnancyContext.trimester}, due date: ${pregnancyContext.edd}`

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: contextualPrompt,
  })

  const chat = model.startChat({ history: messages })
  const result = await chat.sendMessage(userMessage)
  const responseText = result.response.text()

  const lower = responseText.toLowerCase()
  const matchedFlag = RED_FLAGS.find(flag => lower.includes(flag))
  const redFlagDetected = !!matchedFlag

  return {
    response: responseText,
    redFlagDetected,
    redFlagType: matchedFlag,
  }
}
