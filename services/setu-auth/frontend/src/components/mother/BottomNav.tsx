'use client'

import { useRouter } from 'next/navigation'
import { Home, MessageCircle, Phone } from 'lucide-react'

type Tab = 'home' | 'chat' | 'vitals' | 'sos'

interface Props {
  activeTab: Tab
}

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; href: string }> = [
  { id: 'home', label: 'Home', icon: Home, href: '/dashboard/mother/pregnancy' },
  { id: 'chat', label: 'Maa', icon: MessageCircle, href: '/dashboard/mother/pregnancy/chat' },
  { id: 'sos', label: 'SOS', icon: Phone, href: '/dashboard/mother/pregnancy/sos' },
]

export default function BottomNav({ activeTab }: Props) {
  const router = useRouter()

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-40">
      <div className="max-w-md mx-auto grid grid-cols-3">
        {tabs.map(({ id, label, icon: Icon, href }) => {
          const active = activeTab === id
          const color = active
            ? id === 'sos' ? 'text-red-500' : 'text-[#0E7C66]'
            : 'text-gray-400'

          return (
            <button
              key={id}
              onClick={() => router.push(href)}
              className="flex flex-col items-center pt-2 pb-3 relative"
            >
              <Icon size={24} className={color} />
              <span className={`text-[10px] mt-0.5 ${color}`}>{label}</span>
              {active && (
                <span className={`absolute bottom-1 w-1 h-1 rounded-full ${id === 'sos' ? 'bg-red-500' : 'bg-[#0E7C66]'}`} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
