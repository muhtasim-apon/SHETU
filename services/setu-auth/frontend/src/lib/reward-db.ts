'use client'

import { createClient } from './supabase'
import { getTotalPoints } from './pushti-db'

/**
 * Reward MVP state — wired to Supabase WITHOUT schema changes:
 *  - streak  → localStorage `shetu_streak` (maintained by NutritionModule on
 *              each completed daily plan), the existing source of truth.
 *  - balance → derived from the Supabase `reward_points` table (10 pts/completed
 *              day → 2.5 tk/day cashback simulation).
 *  - shield  → persisted per-user in Supabase Auth `user_metadata`, mirrored to
 *              localStorage for instant render.
 */

export const TK_PER_POINT = 0.25 // 10 pts/day → 2.5 tk/day
export const SHIELD_STREAK_THRESHOLD = 7

export interface StreakState {
  streak: number
  points: number
  lastDate: string
}

export interface ShieldState {
  shield: number // shields currently held (0 or 1 for MVP)
  shieldEarnedAtStreak: number // streak length at which last shield was granted
}

export interface RewardSnapshot {
  streak: StreakState
  balanceTk: number
  totalPoints: number
  shield: ShieldState
}

const SHIELD_KEY = 'shetu_rewards_shield'

export function readStreak(): StreakState {
  if (typeof localStorage === 'undefined') return { streak: 0, points: 0, lastDate: '' }
  try {
    const raw = localStorage.getItem('shetu_streak')
    if (raw) return JSON.parse(raw) as StreakState
  } catch { /* ignore */ }
  return { streak: 0, points: 0, lastDate: '' }
}

function readLocalShield(): ShieldState {
  if (typeof localStorage === 'undefined') return { shield: 0, shieldEarnedAtStreak: 0 }
  try {
    const raw = localStorage.getItem(SHIELD_KEY)
    if (raw) return JSON.parse(raw) as ShieldState
  } catch { /* ignore */ }
  return { shield: 0, shieldEarnedAtStreak: 0 }
}

function writeLocalShield(s: ShieldState) {
  try { localStorage.setItem(SHIELD_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

async function persistShieldToSupabase(s: ShieldState) {
  try {
    const sb = createClient()
    await sb.auth.updateUser({ data: { reward_shield: s.shield, reward_shield_at: s.shieldEarnedAtStreak } })
  } catch { /* best-effort — localStorage is the fallback */ }
}

/** Load shield from Supabase user_metadata, falling back to localStorage. */
async function loadShield(): Promise<ShieldState> {
  const local = readLocalShield()
  try {
    const sb = createClient()
    const { data } = await sb.auth.getUser()
    const meta = data.user?.user_metadata as Record<string, unknown> | undefined
    if (meta && typeof meta.reward_shield === 'number') {
      const s: ShieldState = {
        shield: meta.reward_shield as number,
        shieldEarnedAtStreak: (meta.reward_shield_at as number) ?? 0,
      }
      writeLocalShield(s)
      return s
    }
  } catch { /* ignore — use local */ }
  return local
}

/**
 * Build the full reward snapshot. Grants a streak-shield when the user crosses
 * the 7-day threshold (once per threshold crossing).
 */
export async function getRewardSnapshot(): Promise<RewardSnapshot> {
  const streak = readStreak()
  const totalPoints = await getTotalPoints().catch(() => streak.points)
  const balanceTk = Math.round(totalPoints * TK_PER_POINT * 100) / 100

  let shield = await loadShield()

  // Earn one shield each time the streak reaches a fresh multiple of the
  // threshold (7, 14, …) — capped at 1 held shield for the MVP.
  if (
    streak.streak >= SHIELD_STREAK_THRESHOLD &&
    streak.streak > shield.shieldEarnedAtStreak &&
    shield.shield < 1
  ) {
    shield = { shield: 1, shieldEarnedAtStreak: streak.streak }
    writeLocalShield(shield)
    void persistShieldToSupabase(shield)
  }

  return { streak, balanceTk, totalPoints, shield }
}

export async function consumeShield(): Promise<ShieldState> {
  const cur = readLocalShield()
  const next: ShieldState = { shield: Math.max(0, cur.shield - 1), shieldEarnedAtStreak: cur.shieldEarnedAtStreak }
  writeLocalShield(next)
  await persistShieldToSupabase(next)
  return next
}

// ── Nutrient passport ──────────────────────────────────────────────────────
export type NutrientKey = 'iron' | 'folate' | 'calcium' | 'protein'

const NUTRIENT_SOURCES: Record<NutrientKey, string[]> = {
  iron: ['spinach', 'liver', 'beef', 'lentil', 'dal', 'meat', 'egg', 'shak', 'palong', 'beet'],
  folate: ['spinach', 'lentil', 'dal', 'broccoli', 'orange', 'bean', 'shak', 'okra', 'asparagus'],
  calcium: ['milk', 'yogurt', 'doi', 'cheese', 'fish', 'ilish', 'small fish', 'sardine', 'sesame', 'til'],
  protein: ['egg', 'chicken', 'fish', 'meat', 'beef', 'lentil', 'dal', 'milk', 'paneer', 'bean'],
}

/** Returns which key nutrients were hit over the last 7 days from logged meals. */
export function getWeeklyNutrientPassport(): Record<NutrientKey, boolean> {
  const hits: Record<NutrientKey, boolean> = { iron: false, folate: false, calcium: false, protein: false }
  if (typeof localStorage === 'undefined') return hits

  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateKey = d.toISOString().split('T')[0]
    let eatenNames: string[] = []
    try {
      const checklist = JSON.parse(localStorage.getItem(`shetu_checklist_${dateKey}`) ?? '{}') as Record<string, boolean>
      const names = JSON.parse(localStorage.getItem(`shetu_names_${dateKey}`) ?? '{}') as Record<string, string>
      eatenNames = Object.entries(checklist)
        .filter(([, v]) => v)
        .map(([k]) => (names[k] ?? k).toLowerCase())
    } catch { /* ignore */ }

    for (const food of eatenNames) {
      ;(Object.keys(NUTRIENT_SOURCES) as NutrientKey[]).forEach((n) => {
        if (NUTRIENT_SOURCES[n].some((src) => food.includes(src))) hits[n] = true
      })
    }
  }
  return hits
}
