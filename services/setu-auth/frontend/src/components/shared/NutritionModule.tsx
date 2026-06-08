'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, AlertCircle, Leaf, Star, Trophy, X, Flame, Droplets, Pill } from 'lucide-react'
import type { NutritionProfile, NutritionPlan, MealItem } from '@/lib/nutrition'
import { getCurrentSeason } from '@/lib/nutrition'
import { BD_FOODS } from '@/lib/foods'
import { sendNutritionPlan, sendNutritionReview, sendSubstituteRequest } from '@/lib/gemini'
import { saveMealPlanAndChecklist, setChecklistEaten, setChecklistSubstitute, addRewardPoints, getTotalPoints, logMeals } from '@/lib/pushti-db'
import type { ChecklistItem } from '@/lib/pushti-db'

const DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh']
const CONDITIONS = ['Diabetes', 'Hypertension', 'Anaemia', 'Gestational Diabetes', 'Thyroid', 'Heart Disease', 'Kidney Disease', 'None']
const PRICE_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  mid: 'bg-amber-100 text-amber-700 border-amber-200',
  premium: 'bg-purple-100 text-purple-700 border-purple-200',
}

type Tab = 'plan' | 'checklist' | 'rewards' | 'review'
type StreakData = { streak: number; points: number; lastDate: string }

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 justify-center py-6">
      <style>{`
        @keyframes bd2{0%,80%,100%{transform:scale(0);opacity:.3}40%{transform:scale(1);opacity:1}}
        .bd2{animation:bd2 1.4s infinite ease-in-out}
        .bd2:nth-child(1){animation-delay:-.32s}.bd2:nth-child(2){animation-delay:-.16s}
      `}</style>
      <div className="bd2 w-3 h-3 rounded-full bg-[#0E7C66]" />
      <div className="bd2 w-3 h-3 rounded-full bg-[#0E7C66]" />
      <div className="bd2 w-3 h-3 rounded-full bg-[#0E7C66]" />
    </div>
  )
}

function getInstantAvoid(conditions: string[]) {
  const condMap: Record<string, 'diabetes' | 'hypertension' | 'kidney' | 'gout'> = {
    'Diabetes': 'diabetes', 'Hypertension': 'hypertension', 'Kidney Disease': 'kidney',
  }
  const mapped = conditions.map((c) => condMap[c]).filter(Boolean) as ('diabetes' | 'hypertension' | 'kidney' | 'gout')[]
  if (!mapped.length) return []
  return BD_FOODS.filter((f) => f.avoid_for.some((a) => mapped.includes(a))).map((f) => ({
    name: f.name_en,
    reason: `Not recommended for ${conditions.filter((c) => condMap[c] && f.avoid_for.includes(condMap[c])).join(', ')}`,
  }))
}

function HealthCard({ profile, points, streak }: { profile: Partial<NutritionProfile>; points: number; streak: number }) {
  const level = points < 50 ? 'Bronze' : points < 150 ? 'Silver' : points < 400 ? 'Gold' : 'Platinum'
  const levelColor = { Bronze: '#cd7f32', Silver: '#a8a9ad', Gold: '#ffd700', Platinum: '#e5e4e2' }[level] ?? '#0E7C66'
  const bmi = profile.weight_kg && profile.height_cm
    ? (profile.weight_kg / Math.pow(profile.height_cm / 100, 2)).toFixed(1)
    : '—'
  const track = profile.pregnant ? 'Pregnancy' : profile.conditions?.includes('Diabetes') ? 'Diabetes' :
    profile.conditions?.includes('Anaemia') ? 'Anaemia' : profile.conditions?.includes('Hypertension') ? 'Hypertension' : 'General'

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-md" style={{ background: 'linear-gradient(135deg, #0A2E2A 0%, #0E7C66 60%, #13A37F 100%)' }}>
      {/* Decorative circles */}
      <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-10 bg-white" />
      <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full opacity-10 bg-white" />

      <div className="relative p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] text-white/60 tracking-widest font-semibold">SHETU PUSHTI</p>
            <p className="text-[18px] font-bold text-white mt-0.5">{profile.gender === 'female' ? 'Ms.' : 'Mr.'} {track} Member</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-white/60">LEVEL</p>
            <p className="text-[16px] font-bold" style={{ color: levelColor }}>{level}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 bg-white/10 rounded-xl p-3">
          <div className="text-center">
            <p className="text-[10px] text-white/60">Points</p>
            <p className="text-[18px] font-bold text-white">{points}</p>
          </div>
          <div className="text-center border-x border-white/20">
            <p className="text-[10px] text-white/60">Streak</p>
            <p className="text-[18px] font-bold text-white">{streak}d</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-white/60">BMI</p>
            <p className="text-[18px] font-bold text-white">{bmi}</p>
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <div>
            <p className="text-white/50">Track</p>
            <p className="text-white font-medium">{track}</p>
          </div>
          <div className="text-right">
            <p className="text-white/50">Division</p>
            <p className="text-white font-medium">{profile.division ?? '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-white/50">Season</p>
            <p className="text-white font-medium capitalize">{getCurrentSeason()}</p>
          </div>
        </div>

        {/* Points bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-white/50">
            <span>{level}</span>
            <span>{level === 'Platinum' ? '400+ pts' : level === 'Gold' ? `${points}/400` : level === 'Silver' ? `${points}/150` : `${points}/50`}</span>
          </div>
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${level === 'Bronze' ? (points / 50) * 100 : level === 'Silver' ? ((points - 50) / 100) * 100 : level === 'Gold' ? ((points - 150) / 250) * 100 : 100}%`,
                backgroundColor: levelColor,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NutritionModule({ dashboardType }: { dashboardType: 'mother' | 'patient' }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('plan')
  const [profile, setProfile] = useState<Partial<NutritionProfile>>({ gender: 'female', pregnant: false, conditions: [] })
  const [hasProfile, setHasProfile] = useState(false)
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [instantAvoid, setInstantAvoid] = useState<{ name: string; reason: string }[]>([])

  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({})
  const [substitutes, setSubstitutes] = useState<Record<string, { food: string; amount_g: number; notes: string }>>({})
  const [dbItems, setDbItems] = useState<ChecklistItem[]>([])
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const [streak, setStreak] = useState<StreakData>({ streak: 0, points: 0, lastDate: '' })
  const [dbPoints, setDbPoints] = useState(0)
  const [showComingSoon, setShowComingSoon] = useState(false)

  const [review, setReview] = useState<string | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  const todayKey = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const stored = sessionStorage.getItem('shetu_profile')
    if (stored) {
      try { setProfile(JSON.parse(stored)) } catch { /* ignore */ }
    }
    const saved = localStorage.getItem(`shetu_checklist_${todayKey}`)
    if (saved) { try { setChecklist(JSON.parse(saved)) } catch { /* ignore */ } }
    const savedStreak = localStorage.getItem('shetu_streak')
    if (savedStreak) { try { setStreak(JSON.parse(savedStreak)) } catch { /* ignore */ } }
    getTotalPoints().then(setDbPoints)
  }, [todayKey])

  const bmi = profile.weight_kg && profile.height_cm
    ? profile.weight_kg / Math.pow(profile.height_cm / 100, 2)
    : null

  const toggleCondition = (c: string) => {
    setProfile((prev) => {
      const current = prev.conditions ?? []
      if (c === 'None') return { ...prev, conditions: ['None'] }
      const without = current.filter((x) => x !== 'None')
      return { ...prev, conditions: without.includes(c) ? without.filter((x) => x !== c) : [...without, c] }
    })
  }

  const generatePlan = async () => {
    const fp: NutritionProfile = {
      gender: profile.gender ?? 'female',
      pregnant: profile.pregnant ?? false,
      age: profile.age ?? 25,
      weight_kg: profile.weight_kg ?? 60,
      height_cm: profile.height_cm ?? 160,
      bmi: bmi ?? 23,
      division: profile.division ?? 'Dhaka',
      conditions: profile.conditions ?? [],
    }
    sessionStorage.setItem('shetu_profile', JSON.stringify(fp))
    setInstantAvoid(getInstantAvoid(fp.conditions))
    setHasProfile(true)
    setLoading(true)
    setError(null)
    try {
      const result = await sendNutritionPlan(fp)
      setPlan(result)
      const { items } = await saveMealPlanAndChecklist(result, fp)
      setDbItems(items)
      // Hydrate checked state from DB (source of truth) merged with local cache.
      if (items.length > 0) {
        const order = [
          ...result.meal_plan.breakfast.map((f) => ({ ...f, meal: 'Breakfast' })),
          ...result.meal_plan.lunch.map((f) => ({ ...f, meal: 'Lunch' })),
          ...result.meal_plan.snack.map((f) => ({ ...f, meal: 'Snack' })),
          ...result.meal_plan.dinner.map((f) => ({ ...f, meal: 'Dinner' })),
        ]
        const hydrated: Record<string, boolean> = {}
        order.forEach((it, idx) => {
          const match = items.find((d) => d.meal_type === it.meal.toLowerCase() && d.food_name === it.food)
          if (match?.is_eaten) hydrated[`${it.meal}_${idx}`] = true
        })
        if (Object.keys(hydrated).length > 0) {
          const merged = { ...hydrated, ...checklist }
          localStorage.setItem(`shetu_checklist_${todayKey}`, JSON.stringify(merged))
          setChecklist(merged)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  const allItems = plan
    ? [
        ...plan.meal_plan.breakfast.map((f) => ({ ...f, meal: 'Breakfast' })),
        ...plan.meal_plan.lunch.map((f) => ({ ...f, meal: 'Lunch' })),
        ...plan.meal_plan.snack.map((f) => ({ ...f, meal: 'Snack' })),
        ...plan.meal_plan.dinner.map((f) => ({ ...f, meal: 'Dinner' })),
      ]
    : []

  const checkedCount = Object.values(checklist).filter(Boolean).length
  const adherence = allItems.length > 0 ? Math.round((checkedCount / allItems.length) * 100) : 0

  const dbItemId = (meal: string, food: string): string | null =>
    dbItems.find((d) => d.meal_type === meal.toLowerCase() && d.food_name === food)?.id ?? null

  const saveChecklist = (updated: Record<string, boolean>) => {
    localStorage.setItem(`shetu_checklist_${todayKey}`, JSON.stringify(updated))
    setChecklist(updated)
  }

  const updateStreak = async (adh: number) => {
    const today = todayKey
    const s = { ...streak }
    if (s.lastDate === today) return
    let earned = 0
    if (adh >= 70) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yKey = yesterday.toISOString().split('T')[0]
      s.streak = s.lastDate === yKey ? s.streak + 1 : 1
      earned = adh >= 90 ? 20 : 10
      s.points += earned
    } else {
      s.streak = 0
    }
    s.lastDate = today
    localStorage.setItem('shetu_streak', JSON.stringify(s))
    setStreak(s)
    if (earned > 0) {
      await addRewardPoints(earned)
      setDbPoints((p) => p + earned)
    }
  }

  const toggleCheck = (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] }
    saveChecklist(updated)
    const checked = Object.values(updated).filter(Boolean).length
    const adh = allItems.length > 0 ? Math.round((checked / allItems.length) * 100) : 0
    if (adh >= 70) updateStreak(adh)

    const parts = key.split('_')
    const meal = parts[0]
    const idx = parseInt(parts[1], 10)
    const item = allItems[idx]
    if (item) {
      const id = dbItemId(meal, item.food)
      if (id) setChecklistEaten(id, !!updated[key]).catch(() => {})
      if (updated[key]) logMeals([item.food], meal.toLowerCase()).catch(() => {})
    }
  }

  const handleLongPressStart = (key: string, item: MealItem & { meal: string }) => {
    const timer = setTimeout(async () => {
      setUnavailable((prev) => ({ ...prev, [key]: true }))
      const fp: NutritionProfile = {
        gender: profile.gender ?? 'female', pregnant: profile.pregnant ?? false,
        age: profile.age ?? 25, weight_kg: profile.weight_kg ?? 60,
        height_cm: profile.height_cm ?? 160, bmi: bmi ?? 23,
        division: profile.division ?? 'Dhaka', conditions: profile.conditions ?? [],
      }
      try {
        const sub = await sendSubstituteRequest(item.food, fp)
        setSubstitutes((prev) => ({ ...prev, [key]: sub }))
        const id = dbItemId(item.meal, item.food)
        if (id) setChecklistSubstitute(id, sub).catch(() => {})
      } catch { /* ignore */ }
    }, 600)
    setLongPressTimer(timer)
  }

  const handleLongPressEnd = () => { if (longPressTimer) clearTimeout(longPressTimer) }

  const getReview = useCallback(async () => {
    setReviewLoading(true)
    const ate = allItems.filter((_, i) => checklist[`${_.meal}_${i}`]).map((f) => f.food)
    const missed = allItems.filter((_, i) => !checklist[`${_.meal}_${i}`]).map((f) => f.food)
    const fp: NutritionProfile = {
      gender: profile.gender ?? 'female', pregnant: profile.pregnant ?? false,
      age: profile.age ?? 25, weight_kg: profile.weight_kg ?? 60,
      height_cm: profile.height_cm ?? 160, bmi: bmi ?? 23,
      division: profile.division ?? 'Dhaka', conditions: profile.conditions ?? [],
    }
    try {
      const text = await sendNutritionReview(ate, missed, fp)
      setReview(text)
    } catch { /* ignore */ }
    setReviewLoading(false)
  }, [allItems, checklist, profile, bmi])

  const allAvoidFoods = plan
    ? [...(plan.avoid_foods ?? []), ...instantAvoid.filter((ia) => !plan.avoid_foods.some((af) => af.name === ia.name))]
    : instantAvoid

  if (!hasProfile) {
    return (
      <div className="min-h-screen bg-[#F4FAF8]">
        <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-12 pb-8 px-5">
          <button onClick={() => router.push(`/dashboard/${dashboardType}`)} className="flex items-center gap-1 text-white/70 text-sm mb-4">
            <ArrowLeft size={16} /> Dashboard
          </button>
          <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU PUSHTI</p>
          <h1 className="text-[26px] font-bold text-white mt-1">Nutrition Planner</h1>
          <p className="text-[14px] text-white/70 mt-0.5">Geography-aware meal plans for Bangladesh</p>
        </div>

        <main className="max-w-md mx-auto px-4 py-6 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-gray-700">Your Profile</h2>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Gender</label>
              <select
                value={profile.gender}
                onChange={(e) => setProfile((p) => ({ ...p, gender: e.target.value as NutritionProfile['gender'], pregnant: false }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66] focus:ring-1 focus:ring-[#0E7C66]"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="third-gender">Third-gender</option>
              </select>
            </div>

            {profile.gender === 'female' && (
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Are you pregnant?</label>
                <div className="flex gap-3">
                  {['Yes', 'No'].map((v) => (
                    <button key={v} onClick={() => setProfile((p) => ({ ...p, pregnant: v === 'Yes' }))}
                      className={`flex-1 py-2 rounded-xl text-sm border font-medium transition-all ${
                        (v === 'Yes') === profile.pregnant ? 'bg-[#0E7C66] border-[#0E7C66] text-white' : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Age', key: 'age', min: 1, max: 120 },
                { label: 'Weight (kg)', key: 'weight_kg', min: 10, max: 300 },
                { label: 'Height (cm)', key: 'height_cm', min: 50, max: 250 },
              ].map(({ label, key, min, max }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type="number" min={min} max={max}
                    value={(profile as Record<string, unknown>)[key] as number ?? ''}
                    onChange={(e) => setProfile((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66]"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Division</label>
              <select value={profile.division ?? ''}
                onChange={(e) => setProfile((p) => ({ ...p, division: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#0E7C66] focus:ring-1 focus:ring-[#0E7C66]"
              >
                <option value="">Select division</option>
                {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-gray-500">Known Conditions</label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((c) => {
                  const selected = profile.conditions?.includes(c)
                  return (
                    <button key={c} onClick={() => toggleCondition(c)}
                      className={`px-3 py-1.5 rounded-full text-xs border font-medium transition-all ${
                        selected ? 'bg-[#0E7C66] border-[#0E7C66] text-white' : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}>{c}</button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Preview avoid list */}
          {(profile.conditions ?? []).filter((c) => c !== 'None').length > 0 && (() => {
            const list = getInstantAvoid(profile.conditions ?? [])
            return list.length > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-red-700 mb-2">Foods to avoid for your conditions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.slice(0, 8).map((f) => (
                    <span key={f.name} className="px-2 py-0.5 bg-red-100 border border-red-200 rounded-full text-xs text-red-700">{f.name}</span>
                  ))}
                </div>
              </div>
            ) : null
          })()}

          <button onClick={generatePlan}
            disabled={!profile.division || !profile.age || !profile.weight_kg || !profile.height_cm}
            className="w-full py-3.5 rounded-2xl bg-[#0E7C66] text-white font-semibold text-sm disabled:opacity-40 hover:bg-[#0c6b57] transition-colors shadow-sm"
          >
            Generate My Meal Plan →
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] flex flex-col">
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-10 pb-5 px-5">
        <div className="flex items-center justify-between mb-1">
          <button onClick={() => router.push(`/dashboard/${dashboardType}`)} className="flex items-center gap-1 text-white/70 text-sm">
            <ArrowLeft size={16} /> Dashboard
          </button>
          <button onClick={() => setHasProfile(false)} className="text-xs text-white/50 hover:text-white/80">Edit Profile</button>
        </div>
        <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU PUSHTI</p>
        <h1 className="text-[22px] font-bold text-white mt-0.5">Nutrition Planner</h1>
        <p className="text-[13px] text-white/70 capitalize">{getCurrentSeason()} season · {profile.division}</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 overflow-x-auto">
        {(['plan', 'checklist', 'rewards', 'review'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[13px] font-semibold capitalize whitespace-nowrap transition-colors min-w-[70px] ${
              tab === t ? 'text-[#0E7C66] border-b-2 border-[#0E7C66]' : 'text-gray-400 hover:text-gray-600'
            }`}>{t}</button>
        ))}
      </div>

      <main className="flex-1 max-w-md mx-auto w-full px-4 py-5 space-y-4 overflow-y-auto pb-10">

        {/* ── PLAN TAB ── */}
        {tab === 'plan' && (
          <>
            {loading && (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <p className="text-gray-500 text-sm mb-2">Creating your personalised meal plan...</p>
                <LoadingDots />
              </div>
            )}
            {error && !loading && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-red-600 text-sm font-semibold"><AlertCircle size={16} /> Failed to load plan</div>
                <p className="text-xs text-red-600/80">{error}</p>
                <button onClick={generatePlan} className="text-xs text-[#0E7C66] font-medium">Retry</button>
              </div>
            )}

            {plan && !loading && (
              <>
                {/* Calorie target */}
                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-1.5 text-gray-600 font-medium"><Flame size={14} className="text-orange-500" /> Daily Target</span>
                    <span className="font-bold text-gray-800">{plan.daily_calories_target} kcal</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0E7C66] rounded-full" style={{ width: `${Math.min(adherence, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Track: <span className="font-medium text-gray-600 capitalize">{plan.track_id}</span></span>
                    <span>Today: <span className="font-medium text-[#0E7C66]">{adherence}%</span> adherence</span>
                  </div>
                </div>

                {/* Meal cards */}
                {(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((meal) => (
                  <div key={meal} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                    <h3 className="font-bold capitalize text-gray-700 text-[15px]">{meal}</h3>
                    {plan.meal_plan[meal].map((item, i) => {
                      const dbFood = BD_FOODS.find((f) => f.name_en.toLowerCase().includes(item.food.toLowerCase().split(' ')[0]))
                      const tier = dbFood?.price_tier ?? 'low'
                      const isAvoided = allAvoidFoods.some((af) => item.food.toLowerCase().includes(af.name.toLowerCase()))
                      const avoidEntry = isAvoided ? allAvoidFoods.find((af) => item.food.toLowerCase().includes(af.name.toLowerCase())) : null
                      return (
                        <div key={i} className={`space-y-1 ${isAvoided ? 'opacity-60' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-gray-800 font-medium">{item.food}</span>
                                {isAvoided && <span className="px-1.5 py-0.5 bg-red-100 border border-red-200 text-red-600 text-[10px] rounded-full font-semibold">AVOID</span>}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{item.amount_g}g — {item.notes}</p>
                              {isAvoided && avoidEntry && (
                                <p className="text-[10px] text-red-500 mt-0.5">⚠ {avoidEntry.reason}</p>
                              )}
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 font-medium ${PRICE_COLORS[tier]}`}>{tier}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* Avoid section */}
                {allAvoidFoods.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                    <h3 className="font-bold text-red-700 flex items-center gap-2 text-sm"><AlertCircle size={15} /> Avoid These Foods</h3>
                    <div className="space-y-2">
                      {allAvoidFoods.map((f) => (
                        <div key={f.name} className="flex items-start gap-3">
                          <span className="px-2.5 py-1 bg-red-100 border border-red-200 rounded-full text-xs text-red-700 font-medium shrink-0">{f.name}</span>
                          <span className="text-xs text-red-600/80 pt-0.5">{f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weekly variety */}
                {plan.weekly_variety.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                    <h3 className="font-bold text-gray-700 text-sm">Weekly Variety</h3>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {plan.weekly_variety.map((d) => (
                        <div key={d.day} className="flex-shrink-0 text-center bg-teal-50 border border-teal-100 rounded-xl p-2.5 w-[84px]">
                          <p className="text-[10px] text-gray-400 font-semibold">{d.day}</p>
                          <p className="text-xs text-gray-700 font-medium leading-tight mt-0.5">{d.highlight_food}</p>
                          <p className="text-[10px] text-[#0E7C66] mt-1 leading-tight">{d.benefit}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hydration + supplements */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-1"><Droplets size={16} className="text-blue-500" /><span className="text-xs text-gray-500">Hydration</span></div>
                    <p className="font-bold text-[#0E7C66]">{plan.hydration_ml} ml/day</p>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-1"><Pill size={16} className="text-purple-500" /><span className="text-xs text-gray-500">Supplements</span></div>
                    <p className="font-bold text-gray-700">{plan.supplements.length} recommended</p>
                  </div>
                </div>

                {plan.supplements.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-600">Supplement Schedule</h4>
                    {plan.supplements.map((s) => (
                      <div key={s.name} className="flex justify-between items-center text-sm">
                        <div><span className="font-medium text-gray-700">{s.name}</span><span className="text-gray-400 ml-2 text-xs">{s.dose}</span></div>
                        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{s.timing}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── CHECKLIST TAB ── */}
        {tab === 'checklist' && (
          <>
            {!plan ? (
              <div className="text-center py-12 text-gray-400 text-sm">Generate your meal plan first in the Plan tab.</div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 font-medium">Today&apos;s Adherence</span>
                    <span className={`font-bold ${adherence >= 90 ? 'text-green-600' : adherence >= 70 ? 'text-[#0E7C66]' : 'text-gray-700'}`}>{adherence}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${adherence >= 90 ? 'bg-green-500' : 'bg-[#0E7C66]'}`} style={{ width: `${adherence}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{checkedCount} of {allItems.length} meals eaten · Hold item to mark unavailable</p>
                </div>

                {(['Breakfast', 'Lunch', 'Snack', 'Dinner'] as const).map((meal) => {
                  const items = plan.meal_plan[meal.toLowerCase() as keyof typeof plan.meal_plan]
                  if (!items.length) return null
                  const offsets = { Breakfast: 0, Lunch: plan.meal_plan.breakfast.length, Snack: plan.meal_plan.breakfast.length + plan.meal_plan.lunch.length, Dinner: plan.meal_plan.breakfast.length + plan.meal_plan.lunch.length + plan.meal_plan.snack.length }
                  return (
                    <div key={meal} className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
                      <h3 className="font-bold text-gray-700 text-sm">{meal}</h3>
                      {items.map((item, i) => {
                        const idx = offsets[meal] + i
                        const key = `${meal}_${idx}`
                        const checked = !!checklist[key]
                        const isUnavail = !!unavailable[key]
                        const sub = substitutes[key]
                        const isAvoided = allAvoidFoods.some((af) => item.food.toLowerCase().includes(af.name.toLowerCase()))
                        return (
                          <div key={key} className="space-y-1">
                            <div
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer select-none transition-all ${checked ? 'bg-teal-50 border border-teal-100' : isUnavail ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100 hover:border-gray-200'}`}
                              onClick={() => !isUnavail && toggleCheck(key)}
                              onMouseDown={() => handleLongPressStart(key, { ...item, meal })}
                              onMouseUp={handleLongPressEnd}
                              onTouchStart={() => handleLongPressStart(key, { ...item, meal })}
                              onTouchEnd={handleLongPressEnd}
                            >
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-[#0E7C66] border-[#0E7C66]' : isUnavail ? 'border-amber-400' : 'border-gray-300'}`}>
                                {checked && <CheckCircle size={12} className="text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.food}</p>
                                <p className="text-xs text-gray-400">{item.amount_g}g</p>
                              </div>
                              {isAvoided && <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full border border-red-200 font-semibold shrink-0">AVOID</span>}
                              {isUnavail && <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full font-semibold shrink-0">Unavailable</span>}
                            </div>
                            {sub && (
                              <div className="ml-8 bg-teal-50 border border-teal-200 rounded-xl p-2.5 flex items-center gap-2">
                                <CheckCircle size={13} className="text-[#0E7C66] shrink-0" />
                                <div>
                                  <p className="text-xs text-gray-700 font-medium">Sub: {sub.food} ({sub.amount_g}g)</p>
                                  <p className="text-xs text-gray-400">{sub.notes}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}

        {/* ── REWARDS TAB ── */}
        {tab === 'rewards' && (
          <>
            <HealthCard profile={profile} points={streak.points + dbPoints} streak={streak.streak} />

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
              <div className="flex justify-between text-sm text-gray-500">
                <span>≥70% adherence/day</span><span className="font-semibold text-[#0E7C66]">+10 pts</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>≥90% adherence/day</span><span className="font-semibold text-[#0E7C66]">+20 pts</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Points from Supabase</span><span className="font-semibold text-purple-600">{dbPoints} pts</span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-600">Milestone Badges</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { days: 3, icon: <Leaf size={22} />, label: '3-Day Leaf', earned: streak.streak >= 3, color: 'text-green-500', bg: 'bg-green-50 border-green-200' },
                  { days: 7, icon: <Star size={22} />, label: '7-Day Star', earned: streak.streak >= 7, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
                  { days: 30, icon: <Trophy size={22} />, label: '30-Day Trophy', earned: streak.streak >= 30, color: 'text-purple-500', bg: 'bg-purple-50 border-purple-200' },
                ].map(({ days, icon, label, earned, color, bg }) => (
                  <div key={days} className={`rounded-2xl p-4 border text-center space-y-2 ${bg} ${earned ? '' : 'opacity-30 grayscale'}`}>
                    <div className={`flex justify-center ${color}`}>{icon}</div>
                    <p className="text-xs text-gray-600 font-medium leading-tight">{label}</p>
                    {earned && <p className="text-[10px] text-[#0E7C66] font-bold">Earned!</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-600">Redeem Points</h3>
              {[
                { title: 'Redeem via bKash', desc: 'Transfer points to bKash — coming soon', gradient: 'from-pink-500 to-rose-500' },
                { title: 'Health Card Credit', desc: 'Apply points to Shetu health card', gradient: 'from-teal-500 to-[#0E7C66]' },
              ].map((card) => (
                <button key={card.title} onClick={() => setShowComingSoon(true)}
                  className="w-full text-left rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className={`bg-gradient-to-r ${card.gradient} p-4 flex items-center justify-between`}>
                    <div>
                      <p className="font-semibold text-white text-sm">{card.title}</p>
                      <p className="text-xs text-white/70 mt-0.5">{card.desc}</p>
                    </div>
                    <span className="text-white/60 text-xl font-light">→</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── REVIEW TAB ── */}
        {tab === 'review' && (
          <>
            {!plan ? (
              <div className="text-center py-12 text-gray-400 text-sm">Generate your meal plan first in the Plan tab.</div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Today&apos;s adherence</span>
                    <span className="font-bold text-[#0E7C66]">{adherence}%</span>
                  </div>
                  <p className="text-xs text-gray-400">{checkedCount} of {allItems.length} meals completed</p>
                </div>

                <button onClick={getReview} disabled={reviewLoading}
                  className="w-full py-3.5 rounded-2xl bg-[#0E7C66] text-white font-semibold text-sm disabled:opacity-50 hover:bg-[#0c6b57] transition-colors shadow-sm"
                >
                  {reviewLoading ? 'Analysing...' : "Get Today's AI Review"}
                </button>

                {reviewLoading && <LoadingDots />}

                {review && !reviewLoading && (
                  <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
                    <h3 className="font-bold text-gray-700 text-sm">Today&apos;s AI Review</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{review}</p>
                  </div>
                )}

                {/* Avoid foods summary */}
                {allAvoidFoods.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                    <h3 className="font-semibold text-red-700 text-sm flex items-center gap-2"><AlertCircle size={14} />Foods to Avoid (AI Analysis)</h3>
                    <div className="space-y-1.5">
                      {allAvoidFoods.map((f) => (
                        <div key={f.name} className="flex items-start gap-2 text-xs">
                          <span className="font-semibold text-red-700 shrink-0">{f.name}:</span>
                          <span className="text-red-600/80">{f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tomorrow's adjusted plan */}
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                  <h3 className="font-bold text-gray-700 text-sm">Tomorrow&apos;s Focus</h3>
                  {allItems.filter((_, i) => !checklist[`${_.meal}_${i}`]).length === 0 ? (
                    <p className="text-sm text-green-600 font-medium">🎉 You completed everything today! Keep it up tomorrow.</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400">Prioritise these missed items tomorrow:</p>
                      {allItems.filter((_, i) => !checklist[`${_.meal}_${i}`]).slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0E7C66] shrink-0" />
                          <span>{item.food} <span className="text-gray-400">({item.amount_g}g · {item.meal})</span></span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {showComingSoon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Coming Soon</h3>
              <button onClick={() => setShowComingSoon(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
            </div>
            <p className="text-sm text-gray-500">bKash and health card redemption is under development. Your points are being tracked and will be redeemable soon!</p>
            <button onClick={() => setShowComingSoon(false)} className="w-full py-2.5 rounded-xl bg-[#0E7C66] text-white text-sm font-semibold">Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
