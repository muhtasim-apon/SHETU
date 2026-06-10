'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Phone, AlertTriangle } from 'lucide-react'
import {
  useMother,
  formatEDD,
  getTrimesterLabel,
  getTrimesterEmoji,
  getTrimesterWeekRange,
  getProgressPercent,
} from '@/lib/mother-utils'
import BottomNav from '@/components/mother/BottomNav'

export default function PregnancyDashboard() {
  const router = useRouter()
  const { profile, patient, pregnancy, loading } = useMother()

  useEffect(() => {
    if (loading) return
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    if (!patient) { router.replace('/dashboard/mother/onboarding'); return }
    if (!pregnancy) { router.replace('/dashboard/mother/onboarding'); return }
  }, [loading, patient, pregnancy, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center">
        <div className="animate-spin border-2 border-t-[#0E7C66] rounded-full w-8 h-8" />
      </div>
    )
  }

  if (!pregnancy || !patient) return null

  const weeks = pregnancy.gestational_age_weeks ?? 0
  const progress = getProgressPercent(weeks)
  const trimesterLabel = getTrimesterLabel(pregnancy.trimester)
  const trimesterEmoji = getTrimesterEmoji(pregnancy.trimester)
  const weekRange = getTrimesterWeekRange(pregnancy.trimester)
  const eddFormatted = formatEDD(pregnancy.edd)
  const weeksLeft = Math.max(0, 40 - weeks)

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-12 pb-6 px-5">
        <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU MAA</p>
        <h1 className="text-[28px] font-bold text-white mt-1">আপনার গর্ভাবস্থা</h1>
        <p className="text-[14px] text-white/70 mt-0.5">
          Your Pregnancy · Week {weeks} of 40
        </p>
      </div>

      {/* Pregnancy Card */}
      <div className="mx-4 -mt-2 bg-white rounded-2xl shadow-lg p-4">
        <div className="flex justify-between items-start">
          <div>
            <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {trimesterEmoji} {trimesterLabel}
            </span>
            <p className="text-xs text-gray-500 mt-1">{weekRange}</p>
            <p className="text-[13px] text-gray-700 font-medium mt-0.5">Due: {eddFormatted}</p>
          </div>
          <div className="text-right">
            <p className="text-[48px] font-bold text-[#0E7C66] leading-none">{weeks}</p>
            <p className="text-xs text-gray-500">weeks</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full bg-[#0E7C66] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 text-right mt-1">{weeksLeft} weeks to go</p>
      </div>

      {/* Action Grid */}
      <div className="mx-4 mt-4">
        <button
          onClick={() => router.push('/dashboard/mother/pregnancy/chat')}
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="w-10 h-10 rounded-full bg-[#0E7C66] flex items-center justify-center mb-3">
            <MessageCircle size={20} className="text-white" />
          </div>
          <p className="font-semibold text-[15px] text-gray-800">Chat with Maa</p>
          <p className="text-xs text-gray-500 mt-0.5">Your AI care companion</p>
        </button>
      </div>

      {/* Emergency SOS Card */}
      <button
        onClick={() => router.push('/dashboard/mother/pregnancy/sos')}
        className="w-full mx-4 mt-3 bg-white rounded-2xl border border-red-100 p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
        style={{ width: 'calc(100% - 2rem)' }}
      >
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
          <Phone size={20} className="text-red-400" />
        </div>
        <div className="flex-1 text-left">
          <p className="font-semibold text-[15px] text-gray-800">Emergency SOS</p>
          <p className="text-xs text-gray-500 mt-0.5">Set contacts · Quick emergency call · SOS history</p>
        </div>
        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Danger Signs Card */}
      <div className="mx-4 mt-3 mb-24 bg-red-50 rounded-2xl border border-red-100 p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-red-600 text-[14px]">Know the Danger Signs</p>
          <p className="text-[13px] text-red-500 mt-1">
            Severe headache · Blurred vision · Bleeding · Severe abdominal pain · No fetal movement
          </p>
          <p className="text-[13px] text-red-600 font-bold mt-1">
            Call 999 or use SOS immediately.
          </p>
        </div>
      </div>

      <BottomNav activeTab="home" />
    </div>
  )
}
