'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, FileText, Stethoscope, BookOpen, MessageCircle, ArrowLeft } from 'lucide-react'

import type { UserProfile } from '@/lib/api'

const CARDS = [
  {
    title: 'Log Vitals',
    titleBn: 'ভাইটাল রেকর্ড',
    desc: 'BP · Weight · Glucose · Fetal HR · ANC screening',
    icon: Activity,
    href: '/dashboard/mother/saathi/vitals',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    title: 'Health Report',
    titleBn: 'স্বাস্থ্য প্রতিবেদন',
    desc: 'AI pregnancy analysis & downloadable PDF',
    icon: FileText,
    href: '/dashboard/mother/saathi/report',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Find a Doctor',
    titleBn: 'ডাক্তার খুঁজুন',
    desc: 'Gynaecologists · Telemedicine · Emergency',
    icon: Stethoscope,
    href: '/dashboard/mother/saathi/consultancy',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    title: 'Health Blog',
    titleBn: 'স্বাস্থ্য ব্লগ',
    desc: 'WHO · CDC · NHS maternal guides',
    icon: BookOpen,
    href: '/dashboard/mother/saathi/blog',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
]

export default function HealthAssistantPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('shetu_token')
    if (!token) { router.replace('/auth/signin'); return }
    const raw = localStorage.getItem('shetu_user')
    if (raw) {
      try { setUser(JSON.parse(raw) as UserProfile) } catch { /* ignore */ }
    }
  }, [router])

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-12">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-12 pb-8 px-5">
        <button
          onClick={() => router.push('/dashboard/mother')}
          className="flex items-center gap-1 text-white/70 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Dashboard
        </button>
        <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU SAATHI</p>
        <h1 className="text-[26px] font-bold text-white mt-1">আপনার স্বাস্থ্য সহকারী</h1>
        <p className="text-[14px] text-white/70 mt-0.5">
          {user?.full_name ? `Welcome, ${user.full_name.split(' ')[0]}` : 'Your Maternal Health Companion'}
        </p>
      </div>

      {/* AI Chat — featured banner */}
      <div className="px-4 mt-6">
        <button
          onClick={() => router.push('/dashboard/mother/pregnancy/chat')}
          className="w-full flex items-center gap-4 bg-gradient-to-r from-[#0E7C66] to-[#13A37F] rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="bg-white/20 rounded-xl p-3">
            <MessageCircle size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-semibold text-white">Ask Maa — AI Assistant</p>
            <p className="text-[12px] text-white/80 mt-0.5">Pregnancy questions, symptoms & guidance</p>
          </div>
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 gap-4 px-4 mt-4">
        {CARDS.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.href}
              onClick={() => router.push(card.href)}
              className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className={`${card.bg} rounded-xl p-3 w-fit mb-3`}>
                <Icon size={22} className={card.color} />
              </div>
              <p className="text-[15px] font-semibold text-gray-800">{card.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{card.titleBn}</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">{card.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
