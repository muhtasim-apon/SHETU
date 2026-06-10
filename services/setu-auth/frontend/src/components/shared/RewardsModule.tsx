'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Flame, Shield, Wallet, Award, Clock } from 'lucide-react'
import {
  getRewardSnapshot,
  getWeeklyNutrientPassport,
  type RewardSnapshot,
  type NutrientKey,
} from '@/lib/reward-db'

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

  useEffect(() => {
    if (!localStorage.getItem('shetu_token')) { router.replace('/auth/signin'); return }
    getRewardSnapshot().then(setSnap).catch(() => setSnap(null))
    setPassport(getWeeklyNutrientPassport())
  }, [router])

  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const streak = snap?.streak.streak ?? 0
  const today = new Date().toISOString().split('T')[0]
  const completedToday = snap?.streak.lastDate === today
  const hasShield = (snap?.shield.shield ?? 0) > 0

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

        {/* bKash cashback balance */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center">
              <Wallet size={24} className="text-pink-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">Reward Balance</p>
              <p className="text-xs text-gray-500">bKash micro-cashback (simulated)</p>
            </div>
            <p className="text-2xl font-bold text-pink-600">৳{snap?.balanceTk?.toFixed(2) ?? '0.00'}</p>
          </div>
          <button
            disabled
            title="bKash redemption coming soon"
            className="mt-4 w-full rounded-xl bg-gray-100 text-gray-400 py-2.5 text-sm font-medium cursor-not-allowed"
          >
            Redeem to bKash (coming soon)
          </button>
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
