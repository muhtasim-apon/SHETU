import Image from 'next/image'
import { User, CalendarDays, ShieldCheck, Activity } from 'lucide-react'

interface HealthCardProps {
  name: string
  issueDate: string
  healthPoints: number
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function HealthCard({ name, issueDate, healthPoints }: HealthCardProps) {
  const issued = new Date(issueDate)
  const valid = Number.isNaN(issued.getTime()) ? null : new Date(issued)
  if (valid) valid.setFullYear(valid.getFullYear() + 1)

  const issuedLabel = Number.isNaN(issued.getTime()) ? '—' : formatDate(issued)
  const validLabel = valid ? formatDate(valid) : '—'

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-md bg-white border border-teal-50">
      <div className="relative p-5 pb-12">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0E7C66]/10 flex items-center justify-center text-[#0E7C66] text-2xl font-bold leading-none">
              +
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-wide" style={{ color: '#F2A33D' }}>
              HEALTH CARD
            </h2>
          </div>
          <Image
            src="/images/logo.png"
            alt="Shetu logo"
            width={56}
            height={56}
            className="h-12 w-12 sm:h-14 sm:w-14 object-contain shrink-0"
          />
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <User size={15} className="text-[#0E7C66] shrink-0" />
            <span className="font-semibold text-[#0E7C66]">Name:</span>
            <span className="text-gray-700">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-[#0E7C66] shrink-0" />
            <span className="font-semibold text-[#0E7C66]">Issue Date:</span>
            <span className="text-gray-700">{issuedLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-[#0E7C66] shrink-0" />
            <span className="font-semibold text-[#0E7C66]">Validity:</span>
            <span className="text-gray-700">{validLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-[#0E7C66] shrink-0" />
            <span className="font-semibold text-[#0E7C66]">Health Points:</span>
            <span className="text-gray-700">{healthPoints}</span>
          </div>
        </div>
      </div>

      {/* Teal wave footer */}
      <svg
        className="absolute bottom-0 left-0 w-full h-12 sm:h-14"
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0,30 C80,60 160,0 240,20 C300,35 350,10 400,25 L400,60 L0,60 Z" fill="#0E7C66" opacity="0.25" />
        <path d="M0,40 C90,15 180,55 260,30 C320,12 360,40 400,35 L400,60 L0,60 Z" fill="#0E7C66" />
      </svg>
    </div>
  )
}
