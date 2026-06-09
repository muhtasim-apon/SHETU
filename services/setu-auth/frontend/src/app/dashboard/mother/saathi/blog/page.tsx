'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Search } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('shetu_token') : ''
  return { Authorization: `Bearer ${token}` }
}

const CATEGORY_LABELS: Record<string, string> = {
  pregnancy_health: 'Pregnancy Health',
  maternal_diseases: 'Maternal Diseases',
  nutrition: 'Nutrition',
  mental_health: 'Mental Health',
  postpartum: 'Postpartum',
  newborn_care: 'Newborn Care',
  exercise_wellness: 'Exercise',
  emergency_signs: 'Emergency Signs',
}

const CAT_COLORS: Record<string, string> = {
  pregnancy_health: 'bg-teal-100 text-teal-700',
  maternal_diseases: 'bg-red-100 text-red-700',
  nutrition: 'bg-green-100 text-green-700',
  mental_health: 'bg-purple-100 text-purple-700',
  postpartum: 'bg-pink-100 text-pink-700',
  newborn_care: 'bg-blue-100 text-blue-700',
  exercise_wellness: 'bg-amber-100 text-amber-700',
  emergency_signs: 'bg-orange-100 text-orange-700',
}

const STATIC_PREGNANCY_ARTICLES = [
  { id: 's1', slug: 'antenatal-care-visits', title: 'Why 8 ANC Visits Can Save Your Life and Your Baby\'s', category: 'pregnancy_health', summary: 'WHO recommends 8 antenatal visits. Each visit catches problems early — preeclampsia, anaemia, gestational diabetes — when they\'re still treatable.', author_name: 'Dr. Sultana Begum', read_time_mins: 6 },
  { id: 's2', slug: 'preeclampsia-warning-signs', title: 'Preeclampsia: The Silent Danger Every Pregnant Woman Must Know', category: 'maternal_diseases', summary: 'Severe headache, swollen face and hands, vision changes, and upper-right abdominal pain — these are emergency signs. Go to hospital immediately.', author_name: 'Dr. Nasreen Akhter', read_time_mins: 5 },
  { id: 's3', slug: 'iron-folic-acid-pregnancy', title: 'Iron and Folic Acid Supplements During Pregnancy: A Complete Guide', category: 'nutrition', summary: 'Why every pregnant woman in Bangladesh needs iron and folic acid, when to take them, and what to avoid for better absorption.', author_name: 'Nutritionist Parvin Islam', read_time_mins: 5 },
  { id: 's4', slug: 'pregnancy-nutrition-bangladeshi', title: 'Eating Well During Pregnancy on a Bangladeshi Budget', category: 'nutrition', summary: 'Dal, eggs, green leafy vegetables, hilsa fish — how affordable local foods meet your nutritional needs during each trimester.', author_name: 'Dr. Runa Laila', read_time_mins: 7 },
  { id: 's5', slug: 'fetal-movement-counting', title: 'Kick Counting: How to Know Your Baby is Doing Well', category: 'pregnancy_health', summary: 'From 28 weeks, count fetal movements every day. Less than 10 movements in 2 hours? Call your doctor immediately.', author_name: 'Midwife Rashida Khatun', read_time_mins: 4 },
  { id: 's6', slug: 'gestational-diabetes', title: 'Gestational Diabetes: Managing Blood Sugar Safely While Pregnant', category: 'maternal_diseases', summary: 'What GDM means, how it\'s diagnosed at 24–28 weeks, and how to keep blood sugar controlled through diet and sometimes medication.', author_name: 'Dr. Fatema Johora', read_time_mins: 6 },
  { id: 's7', slug: 'birth-preparedness', title: 'Birth Preparedness: Planning for a Safe Delivery', category: 'pregnancy_health', summary: 'Choosing a facility, saving money for delivery, identifying a blood donor, planning transport — the 5 steps every family must take by 36 weeks.', author_name: 'UNFPA Bangladesh', read_time_mins: 5 },
  { id: 's8', slug: 'postpartum-depression', title: 'Postpartum Depression is Real — and Treatable', category: 'postpartum', summary: 'Feeling sad, hopeless, or unable to bond with your baby after birth? You are not alone. Help is available through Shetu Saathi.', author_name: 'Dr. Nusrat Jahan', read_time_mins: 5 },
  { id: 's9', slug: 'breastfeeding-benefits', title: 'Exclusive Breastfeeding for 6 Months: Benefits and How-To', category: 'newborn_care', summary: 'Breast milk is the perfect food for your baby. How to latch correctly, maintain supply, and manage common challenges.', author_name: 'Lactation Consultant Rina Begum', read_time_mins: 6 },
  { id: 's10', slug: 'pregnancy-safe-exercise', title: 'Safe Exercises During Each Trimester of Pregnancy', category: 'exercise_wellness', summary: 'Walking, swimming, and prenatal yoga are safe and beneficial. What to avoid and how to listen to your body.', author_name: 'Physiotherapist Dilara Hossain', read_time_mins: 5 },
  { id: 's11', slug: 'danger-signs-pregnancy', title: '7 Danger Signs in Pregnancy That Need Emergency Care NOW', category: 'emergency_signs', summary: 'Heavy bleeding, severe headache, blurred vision, fits, no fetal movement, high fever, and swollen face — any one means go to hospital NOW and call 999.', author_name: 'Dr. Khaleda Rashid', read_time_mins: 3 },
  { id: 's12', slug: 'newborn-care-first-week', title: 'Your Newborn\'s First Week: What\'s Normal and What\'s Not', category: 'newborn_care', summary: 'Skin colour, breathing patterns, weight loss, jaundice, umbilical cord care — a complete guide for new mothers.', author_name: 'Paediatrician Dr. Aminul Islam', read_time_mins: 7 },
  { id: 's13', slug: 'pregnancy-mental-health', title: 'Anxiety During Pregnancy: You Can Feel Better', category: 'mental_health', summary: 'It\'s normal to worry, but severe anxiety needs support. Breathing techniques, social support, and when to seek professional help.', author_name: 'Counselor Shahana Begum', read_time_mins: 5 },
  { id: 's14', slug: 'anaemia-in-pregnancy', title: 'Anaemia in Pregnancy: Causes, Risks, and Treatment', category: 'maternal_diseases', summary: 'Low haemoglobin increases risk of preterm birth and maternal death. How to diagnose, treat, and prevent anaemia during pregnancy.', author_name: 'Dr. Rokeya Sultana', read_time_mins: 6 },
  { id: 's15', slug: 'postpartum-recovery', title: 'Recovering After Birth: What Your Body Needs in the First 40 Days', category: 'postpartum', summary: 'Rest, nutrition, wound care, and warning signs — how to heal safely after both vaginal and caesarean delivery.', author_name: 'Midwife Farida Begum', read_time_mins: 6 },
]

export default function BlogPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<any[]>([])
  const [featured, setFeatured] = useState<any[]>([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchArticles(cat: string, q: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (cat) params.set('category', cat)
      if (q) params.set('search', q)
      const res = await fetch(`${API_BASE}/api/v1/mother/blog/articles?${params}`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const fetched = data.articles || []
      if (fetched.length > 0) {
        setArticles(fetched)
      } else {
        throw new Error('empty')
      }
    } catch {
      // Fallback to static articles filtered by category/search
      const filtered = STATIC_PREGNANCY_ARTICLES.filter(a =>
        (!cat || a.category === cat) &&
        (!q || a.title.toLowerCase().includes(q.toLowerCase()) || (a.summary ?? '').toLowerCase().includes(q.toLowerCase()))
      )
      setArticles(filtered)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mother/blog/featured`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setFeatured(d.articles?.length ? d.articles : STATIC_PREGNANCY_ARTICLES.slice(0, 3))).catch(() => {
        setFeatured(STATIC_PREGNANCY_ARTICLES.slice(0, 3))
      })
    fetchArticles('', '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(q: string) {
    setSearch(q)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => fetchArticles(category, q), 300)
  }

  function handleCategory(cat: string) {
    const next = cat === category ? '' : cat
    setCategory(next)
    fetchArticles(next, search)
  }

  async function toggleBookmark(e: React.MouseEvent, article: any) {
    e.stopPropagation()
    const method = article.is_bookmarked ? 'DELETE' : 'POST'
    try {
      await fetch(`${API_BASE}/api/v1/mother/blog/articles/${article.id}/bookmark`, {
        method,
        headers: authHeaders(),
      })
      setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_bookmarked: !a.is_bookmarked } : a))
    } catch {}
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A2E2A] to-[#0E7C66] pt-10 pb-5 px-5">
        <button onClick={() => router.push('/dashboard/mother/saathi')}
          className="flex items-center gap-1 text-white/70 text-sm mb-2">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-[22px] font-bold text-white">Pregnancy & Maternal Health</h1>
        <p className="text-[13px] text-white/70">WHO · CDC · NHS guides</p>
      </div>

      <div className="px-4 pt-4">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
            placeholder="Search articles..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button onClick={() => handleCategory('')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${category === '' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-gray-200 text-gray-600'}`}>
            All
          </button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => handleCategory(key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${category === key ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-gray-200 text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Featured */}
        {featured.length > 0 && !category && !search && (
          <div className="mb-4">
            <p className="text-[13px] font-semibold text-gray-700 mb-2">Featured</p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {featured.map((a: any, i: number) => (
                <div key={a.id || i} onClick={() => router.push(`/dashboard/mother/saathi/blog/${a.slug}`)}
                  className="flex-shrink-0 w-44 bg-gradient-to-br from-teal-700 to-teal-900 rounded-2xl p-3 cursor-pointer">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] || 'bg-white/20 text-white'} mb-2 inline-block`}>
                    {CATEGORY_LABELS[a.category] || a.category}
                  </span>
                  <p className="text-[13px] font-semibold text-white line-clamp-2">{a.title}</p>
                  {a.author_name && (
                    <p className="text-[11px] text-white/60 mt-1">{a.author_name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Articles list */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin border-2 border-t-teal-600 rounded-full w-8 h-8" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10">No articles found.</div>
        ) : (
          <div className="space-y-3">
            {articles.map((a: any, i: number) => (
              <div key={a.id || i}
                onClick={() => router.push(`/dashboard/mother/saathi/blog/${a.slug}`)}
                className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {a.author_name && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mr-1">
                        {a.author_name}
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] || 'bg-gray-100 text-gray-500'}`}>
                      {CATEGORY_LABELS[a.category] || a.category}
                    </span>
                    <p className="text-[14px] font-semibold text-gray-800 mt-1.5 line-clamp-2">{a.title}</p>
                    {a.summary && (
                      <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{a.summary}</p>
                    )}
                    {a.read_time_mins && (
                      <p className="text-[11px] text-gray-400 mt-1">{a.read_time_mins} min read</p>
                    )}
                  </div>
                  <button onClick={(e) => toggleBookmark(e, a)} className="flex-shrink-0 mt-1">
                    <Heart size={18} className={a.is_bookmarked ? 'fill-teal-600 text-teal-600' : 'text-gray-300'} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav activeTab="home" />
    </div>
  )
}
