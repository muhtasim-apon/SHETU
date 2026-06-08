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
  options: { key: 'A' | 'B' | 'C' | 'D'; label: string; next: string | null }[]
  onlyIf?: (profile: RiskProfile) => boolean
}

export const QUESTION_TREE: Record<string, Question> = {
  q_fatigue: {
    id: 'q_fatigue',
    text: 'How would you describe your energy level over the past 2 weeks?',
    options: [
      { key: 'A', label: 'Normal — I feel fine', next: 'q_headache' },
      { key: 'B', label: 'Mildly tired — more than usual', next: 'q_headache' },
      { key: 'C', label: 'Very tired — hard to do daily tasks', next: 'q_headache' },
      { key: 'D', label: 'Extremely exhausted — can barely get up', next: 'q_headache' },
    ],
  },
  q_headache: {
    id: 'q_headache',
    text: 'How often do you have headaches?',
    options: [
      { key: 'A', label: 'Rarely or never', next: 'q_vision' },
      { key: 'B', label: 'Once or twice a week', next: 'q_vision' },
      { key: 'C', label: 'Almost every day', next: 'q_vision' },
      { key: 'D', label: 'Severe headaches with nausea or dizziness', next: 'q_vision' },
    ],
  },
  q_vision: {
    id: 'q_vision',
    text: 'Have you noticed any changes in your vision?',
    options: [
      { key: 'A', label: 'No changes in vision', next: 'q_urination' },
      { key: 'B', label: 'Occasional blurring or spots', next: 'q_urination' },
      { key: 'C', label: 'Frequent blurred vision', next: 'q_urination' },
      { key: 'D', label: 'Sudden loss of vision or flashes of light', next: 'q_urination' },
    ],
  },
  q_urination: {
    id: 'q_urination',
    text: 'How is your urination frequency?',
    options: [
      { key: 'A', label: 'Normal (4–6 times a day)', next: 'q_thirst' },
      { key: 'B', label: 'Slightly more frequent', next: 'q_thirst' },
      { key: 'C', label: 'Very frequent, even at night', next: 'q_thirst' },
      { key: 'D', label: 'Burning pain or blood in urine', next: 'q_thirst' },
    ],
  },
  q_thirst: {
    id: 'q_thirst',
    text: 'How is your thirst level?',
    options: [
      { key: 'A', label: 'Normal', next: 'q_swelling' },
      { key: 'B', label: 'Slightly more thirsty than usual', next: 'q_swelling' },
      { key: 'C', label: 'Constantly thirsty — drink a lot', next: 'q_swelling' },
      { key: 'D', label: 'Extremely thirsty — mouth always dry', next: 'q_swelling' },
    ],
  },
  q_swelling: {
    id: 'q_swelling',
    text: 'Do you notice swelling in your hands, feet, or face?',
    options: [
      { key: 'A', label: 'No swelling', next: 'q_fetal' },
      { key: 'B', label: 'Mild swelling in feet by evening', next: 'q_fetal' },
      { key: 'C', label: 'Noticeable swelling in face and hands', next: 'q_fetal' },
      { key: 'D', label: 'Severe swelling all over the body', next: 'q_fetal' },
    ],
  },
  q_fetal: {
    id: 'q_fetal',
    text: 'How is your baby\'s movement today compared to usual?',
    options: [
      { key: 'A', label: 'Moving normally — same as always', next: 'q_chest' },
      { key: 'B', label: 'Slightly less movement than usual', next: 'q_chest' },
      { key: 'C', label: 'Much less movement — worried', next: 'q_chest' },
      { key: 'D', label: 'No movement felt for more than 6 hours', next: 'q_chest' },
    ],
    onlyIf: (p) => p.pregnant,
  },
  q_chest: {
    id: 'q_chest',
    text: 'Do you have any chest pain or shortness of breath?',
    options: [
      { key: 'A', label: 'No chest pain or breathing issues', next: 'q_appetite' },
      { key: 'B', label: 'Mild shortness of breath on exertion', next: 'q_appetite' },
      { key: 'C', label: 'Chest tightness or pain at rest', next: 'q_appetite' },
      { key: 'D', label: 'Severe chest pain or cannot breathe properly', next: 'q_appetite' },
    ],
  },
  q_appetite: {
    id: 'q_appetite',
    text: 'How is your appetite recently?',
    options: [
      { key: 'A', label: 'Normal — eating as usual', next: null },
      { key: 'B', label: 'Reduced appetite — eating less', next: null },
      { key: 'C', label: 'Very poor appetite — skipping meals', next: null },
      { key: 'D', label: 'Nausea or vomiting with meals', next: null },
    ],
  },
}

export const QUESTION_ORDER = [
  'q_fatigue',
  'q_headache',
  'q_vision',
  'q_urination',
  'q_thirst',
  'q_swelling',
  'q_fetal',
  'q_chest',
  'q_appetite',
]

export function getFilteredQuestions(profile: RiskProfile): Question[] {
  return QUESTION_ORDER
    .map((id) => QUESTION_TREE[id])
    .filter((q) => !q.onlyIf || q.onlyIf(profile))
}
