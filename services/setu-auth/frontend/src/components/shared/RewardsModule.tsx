'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Flame, Shield, Award, Clock } from 'lucide-react'
import {
  getRewardSnapshot,
  getWeeklyNutrientPassport,
  type RewardSnapshot,
  type NutrientKey,
} from '@/lib/reward-db'
import HealthCard from '@/components/shared/HealthCard'
import type { UserProfile } from '@/lib/api'

const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  iron: 'Iron',
  folate: 'Folate',
  calcium: 'Calcium',
  protein: 'Protein',
}
const NUTRIENT_EMOJI: Record<NutrientKey, string> = {
  iron: '🩸',
  folate: '🥬',
  calcium: '🦴',
  protein: '🍳',
}

function msUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now.getTime()
}

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}h ${m}m ${s}s`
}

export default function RewardsModule({ dashboardType }: { dashboardType: 'mother' | 'patient' }) {
  const router = useRouter()
  const [snap, setSnap] = useState<RewardSnapshot | null>(null)
  const [passport, setPassport] = useState<Record<NutrientKey, boolean> | null>(null)
  const [countdown, setCountdown] = useState(msUntilMidnight())
  const [user, setUser] = useState<UserProfile | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('shetu_token')) { router.replace('/auth/signin'); return }
    getRewardSnapshot().then(setSnap).catch(() => setSnap(null))
    setPassport(getWeeklyNutrientPassport())
    const raw = localStorage.getItem('shetu_user')
    if (raw) {
      try { setUser(JSON.parse(raw) as UserProfile) } catch { /* ignore */ }
    }
  }, [router])

  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const streak = snap?.streak.streak ?? 0
  const today = new Date().toISOString().split('T')[0]
  const completedToday = snap?.streak.lastDate === today
  const hasShield = (snap?.shield.shield ?? 0) > 0

  const totalPoints = snap?.totalPoints ?? 0
  const rewardLevel = totalPoints < 50 ? 'Bronze' : totalPoints < 150 ? 'Silver' : totalPoints < 400 ? 'Gold' : 'Platinum'
  const nextLevelAt = totalPoints < 50 ? 50 : totalPoints < 150 ? 150 : totalPoints < 400 ? 400 : null
  const levelProgress = nextLevelAt ? Math.min(100, Math.round((totalPoints / nextLevelAt) * 100)) : 100

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push(`/dashboard/${dashboardType}`)} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Rewards</h1>
          <p className="text-sm text-white/70">Keep your daily plan streak alive</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        {/* Streak — loss-aversion framing */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center">
              <Flame size={28} className="text-orange-500" />
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-800">{streak}<span className="text-base font-medium text-gray-400"> days</span></p>
              <p className="text-xs text-gray-500">Current streak</p>
            </div>
          </div>

          {streak > 0 && !completedToday && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <div className="flex items-center gap-2 text-red-600 font-semibold text-sm">
                <Clock size={16} />
                Your {streak}-day streak burns at midnight
              </div>
              <p className="text-xs text-red-400 mt-1 tabular-nums">Time left: {fmtCountdown(countdown)}</p>
              {hasShield && (
                <p className="text-[11px] text-emerald-600 mt-1">🛡️ Your streak shield will protect you if you miss today.</p>
              )}
            </div>
          )}
          {completedToday && (
            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700 font-medium">
              ✓ Today&apos;s plan complete — streak safe!
            </div>
          )}
          {streak === 0 && (
            <p className="mt-4 text-xs text-gray-400">Complete today&apos;s nutrition plan to start a streak.</p>
          )}
        </div>

        {/* Streak shield */}
        <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${hasShield ? 'bg-emerald-50' : 'bg-gray-100'}`}>
            <Shield size={24} className={hasShield ? 'text-emerald-500' : 'text-gray-300'} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800">Streak Shield</p>
            <p className="text-xs text-gray-500">
              {hasShield
                ? 'Earned! Protects one missed day.'
                : `Reach a ${7}-day streak to earn a shield.`}
            </p>
          </div>
          <span className={`text-2xl font-bold ${hasShield ? 'text-emerald-500' : 'text-gray-300'}`}>{snap?.shield.shield ?? 0}</span>
        </div>

        {/* Health Card — reward points */}
        <HealthCard
          name={user?.full_name ?? 'Shetu User'}
          issueDate={user?.created_at ?? new Date().toISOString()}
          healthPoints={totalPoints}
        />

        {/* Reward level progress */}
        <div className="rounded-2xl overflow-hidden shadow-md p-5 space-y-3" style={{ background: 'linear-gradient(135deg, #0A2E2A 0%, #0E7C66 60%, #13A37F 100%)' }}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] text-white/60 tracking-widest font-semibold">REWARD LEVEL</p>
              <p className="text-[18px] font-bold text-white mt-0.5">{rewardLevel} Member</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 bg-white/10 rounded-xl p-3">
            <div className="text-center">
              <p className="text-[10px] text-white/60">Points</p>
              <p className="text-[18px] font-bold text-white">{totalPoints}</p>
            </div>
            <div className="text-center border-x border-white/20">
              <p className="text-[10px] text-white/60">Streak</p>
              <p className="text-[18px] font-bold text-white">{streak}d</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-white/60">Shield</p>
              <p className="text-[18px] font-bold text-white">{snap?.shield.shield ?? 0}</p>
            </div>
          </div>

          {/* Progress to next level */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-white/50">
              <span>{rewardLevel}</span>
              <span>{nextLevelAt ? `${totalPoints}/${nextLevelAt}` : 'Max level'}</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-white/80" style={{ width: `${levelProgress}%` }} />
            </div>
          </div>
        </div>

        {/* How points are earned */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          <h2 className="font-semibold text-gray-800 mb-1">How you earn points</h2>
          <div className="flex justify-between text-sm text-gray-500">
            <span>≥70% daily plan adherence</span><span className="font-semibold text-[#0E7C66]">+10 pts</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500">
            <span>≥90% daily plan adherence</span><span className="font-semibold text-[#0E7C66]">+20 pts</span>
          </div>
          <div className="flex justify-between text-sm text-gray-500 pt-1 border-t border-gray-100">
            <span>Total points earned</span><span className="font-bold text-[#0E7C66]">{totalPoints} pts</span>
          </div>
        </div>

        {/* Nutrient passport */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award size={18} className="text-[#0E7C66]" />
            <h2 className="font-semibold text-gray-800">Nutrient Passport</h2>
            <span className="text-[11px] text-gray-400">this week</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(Object.keys(NUTRIENT_LABELS) as NutrientKey[]).map((k) => {
              const hit = passport?.[k] ?? false
              return (
                <div key={k} className={`rounded-xl border px-2 py-3 text-center ${hit ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                  <div className={`text-2xl ${hit ? '' : 'opacity-30 grayscale'}`}>{NUTRIENT_EMOJI[k]}</div>
                  <p className="text-[11px] mt-1 text-gray-600">{NUTRIENT_LABELS[k]}</p>
                  <p className={`text-[10px] font-semibold ${hit ? 'text-emerald-600' : 'text-gray-300'}`}>{hit ? '✓ Stamped' : '—'}</p>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
