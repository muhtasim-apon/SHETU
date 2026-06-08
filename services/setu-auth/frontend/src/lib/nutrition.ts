export interface NutritionProfile {
  gender: 'male' | 'female' | 'third-gender'
  pregnant: boolean
  age: number
  weight_kg: number
  height_cm: number
  bmi: number
  division: string
  conditions: string[]
}

export interface MealItem {
  food: string
  amount_g: number
  notes: string
}

export interface AvoidFood {
  name: string
  reason: string
}

export interface WeeklyDay {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
  highlight_food: string
  benefit: string
}

export interface Supplement {
  name: string
  dose: string
  timing: string
}

export interface NutritionPlan {
  daily_calories_target: number
  avoid_foods: AvoidFood[]
  meal_plan: {
    breakfast: MealItem[]
    lunch: MealItem[]
    snack: MealItem[]
    dinner: MealItem[]
  }
  weekly_variety: WeeklyDay[]
  hydration_ml: number
  supplements: Supplement[]
  track_id: 'pregnancy' | 'anaemia' | 'diabetes' | 'hypertension' | 'child' | 'adolescent' | 'general'
}

export type Season = 'winter' | 'summer' | 'monsoon'

export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1
  if (month >= 12 || month <= 2) return 'winter'
  if (month >= 3 && month <= 5) return 'summer'
  if (month === 11) return 'winter'
  return 'monsoon'
}
