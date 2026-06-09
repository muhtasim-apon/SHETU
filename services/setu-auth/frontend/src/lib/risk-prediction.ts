import type { RiskBand } from './types'

export interface RiskProfile {
  gender: 'male' | 'female' | 'third-gender'
  pregnant: boolean
  age: number
  weight_kg: number
  height_cm: number
  bmi: number
  division: string
  conditions: string[]
}

export interface QAAnswer {
  questionId: string
  answer: string
  label: string
}

export interface RiskCondition {
  name: string
  probability: number
  band: RiskBand
  contributing_symptoms: string[]
  confidence: 'low' | 'medium' | 'high'
}

export interface RiskReport {
  conditions: RiskCondition[]
  overall_band: RiskBand
  next_action: string
  timeframe: string
  alert_chw: boolean
  specialist_needed: boolean
}

export interface Question {
  id: string
  text: string
  options: { key: 'A' | 'B' | 'C' | 'D'; label: string }[]
  onlyIf?: (profile: RiskProfile) => boolean
  priority?: number // lower = asked first; default 50
}

// ─── Base questions (everyone gets these) ─────────────────────────────────────
const BASE_QUESTIONS: Question[] = [
  {
    id: 'q_fatigue',
    priority: 10,
    text: 'How has your energy level been over the past 2 weeks?',
    options: [
      { key: 'A', label: 'Normal — I feel fine' },
      { key: 'B', label: 'Mildly tired — more than usual' },
      { key: 'C', label: 'Very tired — hard to do daily tasks' },
      { key: 'D', label: 'Extremely exhausted — can barely get up' },
    ],
  },
  {
    id: 'q_headache',
    priority: 20,
    text: 'How often do you have headaches?',
    options: [
      { key: 'A', label: 'Rarely or never' },
      { key: 'B', label: 'Once or twice a week' },
      { key: 'C', label: 'Almost every day' },
      { key: 'D', label: 'Severe headaches with nausea or dizziness' },
    ],
  },
  {
    id: 'q_chest',
    priority: 30,
    text: 'Do you have any chest pain or shortness of breath?',
    options: [
      { key: 'A', label: 'No chest pain or breathing issues' },
      { key: 'B', label: 'Mild shortness of breath on exertion' },
      { key: 'C', label: 'Chest tightness or pressure at rest' },
      { key: 'D', label: 'Severe chest pain — cannot breathe properly' },
    ],
  },
  {
    id: 'q_appetite',
    priority: 40,
    text: 'How is your appetite recently?',
    options: [
      { key: 'A', label: 'Normal — eating as usual' },
      { key: 'B', label: 'Reduced — eating less than before' },
      { key: 'C', label: 'Very poor — skipping meals regularly' },
      { key: 'D', label: 'Nausea or vomiting with meals' },
    ],
  },
  {
    id: 'q_sleep',
    priority: 45,
    text: 'How is your sleep quality?',
    options: [
      { key: 'A', label: 'Sleeping well — 7–8 hours' },
      { key: 'B', label: 'Occasionally disrupted' },
      { key: 'C', label: 'Poor sleep most nights — wake often' },
      { key: 'D', label: 'Barely sleep — severe insomnia' },
    ],
  },
]

// ─── Vision & Neurological ─────────────────────────────────────────────────────
const VISION_QUESTIONS: Question[] = [
  {
    id: 'q_vision',
    priority: 25,
    text: 'Have you noticed any changes in your vision?',
    options: [
      { key: 'A', label: 'No changes in vision' },
      { key: 'B', label: 'Occasional blurring or spots before eyes' },
      { key: 'C', label: 'Frequent blurred or double vision' },
      { key: 'D', label: 'Sudden loss of vision or flashes of light' },
    ],
  },
  {
    id: 'q_dizziness',
    priority: 28,
    text: 'Do you experience dizziness or loss of balance?',
    options: [
      { key: 'A', label: 'No dizziness' },
      { key: 'B', label: 'Occasional mild dizziness' },
      { key: 'C', label: 'Frequent dizziness, sometimes falls' },
      { key: 'D', label: 'Severe dizziness — cannot stand properly' },
    ],
    onlyIf: p => p.age >= 50 || p.conditions.includes('Hypertension') || p.conditions.includes('Diabetes'),
  },
]

// ─── Urination & Kidney ────────────────────────────────────────────────────────
const KIDNEY_QUESTIONS: Question[] = [
  {
    id: 'q_urination',
    priority: 35,
    text: 'How is your urination frequency?',
    options: [
      { key: 'A', label: 'Normal — 4–6 times a day' },
      { key: 'B', label: 'Slightly more frequent' },
      { key: 'C', label: 'Very frequent, even waking at night' },
      { key: 'D', label: 'Burning, pain, or blood in urine' },
    ],
    onlyIf: p => p.conditions.includes('Kidney Disease') || p.conditions.includes('Diabetes') || p.pregnant,
  },
  {
    id: 'q_swelling',
    priority: 38,
    text: 'Do you notice swelling in your feet, hands, or face?',
    options: [
      { key: 'A', label: 'No swelling' },
      { key: 'B', label: 'Mild swelling in feet by evening' },
      { key: 'C', label: 'Noticeable swelling in face and hands' },
      { key: 'D', label: 'Severe swelling all over the body' },
    ],
    onlyIf: p => p.conditions.includes('Hypertension') || p.conditions.includes('Kidney Disease') || p.conditions.includes('Heart Disease') || p.pregnant,
  },
]

// ─── Diabetes-specific ─────────────────────────────────────────────────────────
const DIABETES_QUESTIONS: Question[] = [
  {
    id: 'q_thirst',
    priority: 50,
    text: 'How is your thirst level?',
    options: [
      { key: 'A', label: 'Normal' },
      { key: 'B', label: 'Slightly more thirsty than usual' },
      { key: 'C', label: 'Constantly thirsty — drinking a lot' },
      { key: 'D', label: 'Extremely thirsty — mouth always dry' },
    ],
    onlyIf: p => p.conditions.includes('Diabetes') || p.conditions.includes('Gestational Diabetes'),
  },
  {
    id: 'q_numbness',
    priority: 55,
    text: 'Do you have tingling or numbness in your hands or feet?',
    options: [
      { key: 'A', label: 'No tingling or numbness' },
      { key: 'B', label: 'Occasional mild tingling' },
      { key: 'C', label: 'Frequent tingling — bothers me' },
      { key: 'D', label: 'Constant numbness or burning pain' },
    ],
    onlyIf: p => p.conditions.includes('Diabetes'),
  },
  {
    id: 'q_wound_healing',
    priority: 58,
    text: 'How quickly do cuts or wounds heal on your body?',
    options: [
      { key: 'A', label: 'Heals normally within a week' },
      { key: 'B', label: 'Takes a bit longer than usual' },
      { key: 'C', label: 'Slow healing — 2–3 weeks or more' },
      { key: 'D', label: 'Wounds don\'t heal well, sometimes get infected' },
    ],
    onlyIf: p => p.conditions.includes('Diabetes'),
  },
]

// ─── Hypertension-specific ─────────────────────────────────────────────────────
const HYPERTENSION_QUESTIONS: Question[] = [
  {
    id: 'q_palpitations',
    priority: 52,
    text: 'Do you feel your heart beating too fast or irregularly?',
    options: [
      { key: 'A', label: 'No palpitations' },
      { key: 'B', label: 'Occasional rapid heartbeat' },
      { key: 'C', label: 'Frequent irregular heartbeat' },
      { key: 'D', label: 'Severe palpitations — sometimes feel faint' },
    ],
    onlyIf: p => p.conditions.includes('Hypertension') || p.conditions.includes('Heart Disease'),
  },
  {
    id: 'q_nose_bleed',
    priority: 56,
    text: 'Do you experience frequent nosebleeds or bleeding gums?',
    options: [
      { key: 'A', label: 'Rarely or never' },
      { key: 'B', label: 'Once or twice in the past month' },
      { key: 'C', label: 'Several times per month' },
      { key: 'D', label: 'Very frequent — almost every week' },
    ],
    onlyIf: p => p.conditions.includes('Hypertension'),
  },
]

// ─── Anaemia-specific ──────────────────────────────────────────────────────────
const ANAEMIA_QUESTIONS: Question[] = [
  {
    id: 'q_pallor',
    priority: 53,
    text: 'Have people told you that you look pale, or do you notice pale nails/gums?',
    options: [
      { key: 'A', label: 'No — normal complexion' },
      { key: 'B', label: 'Slightly pale at times' },
      { key: 'C', label: 'Noticeably pale skin, nails, or gums' },
      { key: 'D', label: 'Very pale — lips and nails almost white' },
    ],
    onlyIf: p => p.conditions.includes('Anaemia') || p.pregnant || p.gender === 'female',
  },
  {
    id: 'q_breathless_activity',
    priority: 57,
    text: 'Do you feel breathless or your heart racing during light activity?',
    options: [
      { key: 'A', label: 'No — I can manage normal activity fine' },
      { key: 'B', label: 'Slightly breathless climbing stairs' },
      { key: 'C', label: 'Breathless walking short distances' },
      { key: 'D', label: 'Breathless even at rest' },
    ],
    onlyIf: p => p.conditions.includes('Anaemia') || p.pregnant,
  },
]

// ─── Pregnancy-specific ────────────────────────────────────────────────────────
const PREGNANCY_QUESTIONS: Question[] = [
  {
    id: 'q_fetal',
    priority: 15,
    text: "How is your baby's movement today compared to usual?",
    options: [
      { key: 'A', label: 'Moving normally — same as always' },
      { key: 'B', label: 'Slightly less movement than usual' },
      { key: 'C', label: 'Much less movement — I am worried' },
      { key: 'D', label: 'No movement felt for more than 6 hours' },
    ],
    onlyIf: p => p.pregnant,
  },
  {
    id: 'q_bleeding',
    priority: 18,
    text: 'Have you had any vaginal bleeding or unusual discharge?',
    options: [
      { key: 'A', label: 'No bleeding or unusual discharge' },
      { key: 'B', label: 'Light spotting once or twice' },
      { key: 'C', label: 'Persistent spotting or unusual discharge' },
      { key: 'D', label: 'Heavy bleeding (like a period or more)' },
    ],
    onlyIf: p => p.pregnant,
  },
  {
    id: 'q_abdominal_pain',
    priority: 22,
    text: 'Do you have abdominal pain or cramping?',
    options: [
      { key: 'A', label: 'No pain' },
      { key: 'B', label: 'Mild occasional cramping' },
      { key: 'C', label: 'Moderate pain that comes and goes' },
      { key: 'D', label: 'Severe pain — continuous or with bleeding' },
    ],
    onlyIf: p => p.pregnant,
  },
]

// ─── Thyroid-specific ──────────────────────────────────────────────────────────
const THYROID_QUESTIONS: Question[] = [
  {
    id: 'q_weight_change',
    priority: 60,
    text: 'Have you experienced unexplained weight changes recently?',
    options: [
      { key: 'A', label: 'Weight is stable' },
      { key: 'B', label: 'Gained 2–4 kg without diet changes' },
      { key: 'C', label: 'Lost 2–4 kg without trying' },
      { key: 'D', label: 'Significant weight change (5 kg or more)' },
    ],
    onlyIf: p => p.conditions.includes('Thyroid'),
  },
  {
    id: 'q_cold_heat',
    priority: 63,
    text: 'How do you tolerate temperature?',
    options: [
      { key: 'A', label: 'Normal — neither too hot nor cold' },
      { key: 'B', label: 'Feel cold more often than others' },
      { key: 'C', label: 'Feel excessively hot and sweaty' },
      { key: 'D', label: 'Extreme sensitivity to cold or heat' },
    ],
    onlyIf: p => p.conditions.includes('Thyroid'),
  },
]

// ─── Age-specific (elderly) ────────────────────────────────────────────────────
const ELDERLY_QUESTIONS: Question[] = [
  {
    id: 'q_fall_risk',
    priority: 65,
    text: 'Have you had any falls or near-falls in the past month?',
    options: [
      { key: 'A', label: 'No — I feel stable' },
      { key: 'B', label: 'Once or twice I lost my balance' },
      { key: 'C', label: 'I fell once in the past month' },
      { key: 'D', label: 'Multiple falls — I am afraid to move alone' },
    ],
    onlyIf: p => p.age >= 60,
  },
  {
    id: 'q_memory',
    priority: 68,
    text: 'Have you noticed any changes in your memory or concentration?',
    options: [
      { key: 'A', label: 'Memory is fine' },
      { key: 'B', label: 'Occasionally forget things (normal forgetfulness)' },
      { key: 'C', label: 'Frequently forget recent events or conversations' },
      { key: 'D', label: 'Significant memory loss — family is concerned' },
    ],
    onlyIf: p => p.age >= 55,
  },
]

// ─── Mental health ──────────────────────────────────────────────────────────────
const MENTAL_HEALTH_QUESTIONS: Question[] = [
  {
    id: 'q_mood',
    priority: 70,
    text: 'How would you describe your mood over the past 2 weeks?',
    options: [
      { key: 'A', label: 'Good — generally positive and happy' },
      { key: 'B', label: 'Slightly low or anxious at times' },
      { key: 'C', label: 'Persistently sad, anxious, or hopeless' },
      { key: 'D', label: 'Very distressed — having thoughts of self-harm' },
    ],
  },
]

// ─── All questions combined ────────────────────────────────────────────────────
const ALL_QUESTIONS: Question[] = [
  ...BASE_QUESTIONS,
  ...VISION_QUESTIONS,
  ...KIDNEY_QUESTIONS,
  ...DIABETES_QUESTIONS,
  ...HYPERTENSION_QUESTIONS,
  ...ANAEMIA_QUESTIONS,
  ...PREGNANCY_QUESTIONS,
  ...THYROID_QUESTIONS,
  ...ELDERLY_QUESTIONS,
  ...MENTAL_HEALTH_QUESTIONS,
]

export function getFilteredQuestions(profile: RiskProfile): Question[] {
  const visible = ALL_QUESTIONS.filter(q => !q.onlyIf || q.onlyIf(profile))
  // Sort by priority (ascending)
  visible.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
  // Cap at 12 questions maximum for UX (one-at-a-time means too many gets exhausting)
  return visible.slice(0, 12)
}
