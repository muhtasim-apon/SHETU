'use client'

import { useRouter } from 'next/navigation'
import { Activity, FileText, Stethoscope, BookOpen, ArrowLeft } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const CARDS = [
  {
    title: 'Log Vitals',
    titleBn: 'ভাইটাল রেকর্ড',
    desc: 'BP · Weight · Glucose · FHR',
    icon: Activity,
    href: '/dashboard/mother/saathi/vitals',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    title: 'Health Report',
    titleBn: 'স্বাস্থ্য প্রতিবেদন',
    desc: 'AI pregnancy analysis & PDF',
    icon: FileText,
    href: '/dashboard/mother/saathi/report',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Find a Doctor',
    titleBn: 'ডাক্তার খুঁজুন',
    desc: 'Gynaecologists · Telemedicine',
    icon: Stethoscope,
    href: '/dashboard/mother/saathi/consultancy',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    title: 'Health Blog',
    titleBn: 'স্বাস্থ্য ব্লগ',
    desc: 'WHO · CDC · NHS guides',
    icon: BookOpen,
    href: '/dashboard/mother/saathi/blog',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
]

export default function SaathiPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-12 pb-8 px-5">
        <button
          onClick={() => router.push('/dashboard/mother/pregnancy')}
          className="flex items-center gap-1 text-white/70 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-[13px] text-[#F2A93B] font-semibold tracking-widest">SHETU SAATHI</p>
        <h1 className="text-[26px] font-bold text-white mt-1">আপনার স্বাস্থ্য সহকারী</h1>
        <p className="text-[14px] text-white/70 mt-0.5">Your Maternal Health Companion</p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 gap-4 px-4 mt-6">
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
              <p className="text-[11px] text-gray-500 mt-1">{card.desc}</p>
            </button>
          )
        })}
      </div>

      <BottomNav activeTab="home" />
    </div>
  )
}
