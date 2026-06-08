import { createClient } from './supabase'
import { ensurePatientId } from './patient-row'
import type { NutritionPlan, NutritionProfile } from './nutrition'

export interface ChecklistItem {
  id: string
  meal_type: string
  food_name: string
  amount_g: number | null
  notes: string | null
  is_eaten: boolean
  is_available: boolean
  substitute_food: string | null
  substitute_amount_g: number | null
  substitute_notes: string | null
}

function mapCondition(conditions: string[], pregnant: boolean): string {
  if (pregnant) return 'pregnancy'
  if (conditions?.some((c) => c.toLowerCase().includes('diabetes'))) return 'diabetes'
  if (conditions?.includes('Anaemia')) return 'anaemia'
  return 'anaemia'
}

function isoWeek(d = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

async function getNutritionProfileId(
  patientId: string,
  profile: NutritionProfile,
  plan?: NutritionPlan,
): Promise<string | null> {
  const sb = createClient()

  const row: Record<string, unknown> = {
    patient_id: patientId,
    condition: mapCondition(profile.conditions, profile.pregnant),
    division: profile.division,
    gender: profile.gender,
    age: profile.age,
    weight_kg: profile.weight_kg,
    height_cm: profile.height_cm,
    known_conditions: profile.conditions ?? [],
  }
  if (plan) {
    row.calorie_target = plan.daily_calories_target
    row.hydration_ml = plan.hydration_ml
    row.track_id = plan.track_id
    row.supplements = plan.supplements
    row.avoid_foods = plan.avoid_foods
    row.generated_by_model = 'pushti-v1'
  }

  const { data: existing } = await sb
    .from('nutrition_profiles')
    .select('id')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await sb.from('nutrition_profiles').update(row).eq('id', existing.id)
    if (error) console.error('[Pushti] nutrition_profile update failed:', error.message)
    return existing.id
  }

  const { data: created, error } = await sb
    .from('nutrition_profiles')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error('[Pushti] nutrition_profile insert failed:', error.message)
    return null
  }
  return created?.id ?? null
}

/**
 * Persists the plan and seeds today's checklist rows. Returns the meal_plan id
 * and the checklist items (with their DB ids) so the UI can toggle them.
 * Note: meal_plans grants are SELECT,INSERT only — never UPDATE.
 */
export async function saveMealPlanAndChecklist(
  plan: NutritionPlan,
  profile: NutritionProfile,
): Promise<{ mealPlanId: string | null; items: ChecklistItem[] }> {
  const patientId = await ensurePatientId()
  if (!patientId) return { mealPlanId: null, items: [] }

  const nutritionProfileId = await getNutritionProfileId(patientId, profile, plan)
  if (!nutritionProfileId) return { mealPlanId: null, items: [] }

  const sb = createClient()
  const week = isoWeek()

  let mealPlanId: string | null = null
  const { data: existingPlan } = await sb
    .from('meal_plans')
    .select('id')
    .eq('patient_id', patientId)
    .eq('plan_week', week)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingPlan?.id) {
    mealPlanId = existingPlan.id
  } else {
    const { data: created, error } = await sb
      .from('meal_plans')
      .insert({
        nutrition_profile_id: nutritionProfileId,
        patient_id: patientId,
        plan_week: week,
        plan_data: plan,
        generated_by_model: 'pushti-v1',
      })
      .select('id')
      .single()
    if (error) {
      console.error('[Pushti] meal_plan insert failed:', error.message)
      return { mealPlanId: null, items: [] }
    }
    mealPlanId = created?.id ?? null
  }

  if (!mealPlanId) return { mealPlanId: null, items: [] }

  const items = await seedChecklist(patientId, mealPlanId, plan)
  return { mealPlanId, items }
}

async function seedChecklist(
  patientId: string,
  mealPlanId: string,
  plan: NutritionPlan,
): Promise<ChecklistItem[]> {
  const sb = createClient()
  const date = todayISO()

  // Already seeded for today? Return existing.
  const { data: existing } = await sb
    .from('meal_checklist_items')
    .select('id, meal_type, food_name, amount_g, notes, is_eaten, is_available, substitute_food, substitute_amount_g, substitute_notes')
    .eq('patient_id', patientId)
    .eq('meal_plan_id', mealPlanId)
    .eq('checklist_date', date)

  if (existing && existing.length > 0) return existing as ChecklistItem[]

  const rows: Record<string, unknown>[] = []
  ;(['breakfast', 'lunch', 'snack', 'dinner'] as const).forEach((meal) => {
    for (const item of plan.meal_plan[meal]) {
      rows.push({
        patient_id: patientId,
        meal_plan_id: mealPlanId,
        checklist_date: date,
        meal_type: meal,
        food_name: item.food,
        amount_g: item.amount_g,
        notes: item.notes,
      })
    }
  })

  if (rows.length === 0) return []

  const { data: inserted, error } = await sb
    .from('meal_checklist_items')
    .upsert(rows, { onConflict: 'patient_id,meal_plan_id,checklist_date,meal_type,food_name' })
    .select('id, meal_type, food_name, amount_g, notes, is_eaten, is_available, substitute_food, substitute_amount_g, substitute_notes')

  if (error) {
    console.error('[Pushti] checklist seed failed:', error.message)
    return []
  }
  return (inserted ?? []) as ChecklistItem[]
}

export async function setChecklistEaten(itemId: string, eaten: boolean): Promise<void> {
  const sb = createClient()
  const { error } = await sb
    .from('meal_checklist_items')
    .update({ is_eaten: eaten, eaten_at: eaten ? new Date().toISOString() : null })
    .eq('id', itemId)
  if (error) console.error('[Pushti] checklist toggle failed:', error.message)
}

export async function setChecklistSubstitute(
  itemId: string,
  sub: { food: string; amount_g: number; notes: string },
): Promise<void> {
  const sb = createClient()
  const { error } = await sb
    .from('meal_checklist_items')
    .update({
      is_available: false,
      substitute_requested: true,
      substitute_food: sub.food,
      substitute_amount_g: sub.amount_g,
      substitute_notes: sub.notes,
      substitute_generated_by_model: 'pushti-v1',
    })
    .eq('id', itemId)
  if (error) console.error('[Pushti] checklist substitute failed:', error.message)
}

export async function logMeals(items: string[], mealType: string): Promise<void> {
  const patientId = await ensurePatientId()
  if (!patientId) return

  const valid = ['breakfast', 'lunch', 'dinner', 'snack']
  const mt = valid.includes(mealType.toLowerCase()) ? mealType.toLowerCase() : 'snack'

  const sb = createClient()
  const { error } = await sb.from('meal_logs').insert({
    patient_id: patientId,
    meal_type: mt,
    food_items: items.map((name) => ({ name, quantity: 1, unit: 'serving' })),
  })
  if (error) console.error('[Pushti] meal_log insert failed:', error.message)
}

export async function addRewardPoints(points: number, adherencePct?: number): Promise<void> {
  if (points <= 0) return
  const patientId = await ensurePatientId()
  if (!patientId) return

  const sb = createClient()
  const { error } = await sb.from('reward_points').insert({
    patient_id: patientId,
    points,
    action_type: 'meal_log',
    adherence_pct: adherencePct ?? null,
  })
  // reward_points only grants SELECT to authenticated — insert may be denied.
  // That's expected; streak/points still persist in localStorage.
  if (error) console.warn('[Pushti] reward_points insert (expected if no grant):', error.message)
}

export async function getTotalPoints(): Promise<number> {
  const patientId = await ensurePatientId()
  if (!patientId) return 0

  const sb = createClient()
  const { data, error } = await sb
    .from('reward_points')
    .select('points')
    .eq('patient_id', patientId)

  if (error) {
    console.error('[Pushti] reward_points read failed:', error.message)
    return 0
  }
  return (data ?? []).reduce((sum: number, r: { points: number }) => sum + (r.points ?? 0), 0)
}
