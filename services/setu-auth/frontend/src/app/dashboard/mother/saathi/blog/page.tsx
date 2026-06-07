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
      const data = await res.json()
      setArticles(data.articles || [])
    } catch {
      setArticles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/mother/blog/featured`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setFeatured(d.articles || [])).catch(() => {})
    fetchArticles('', '')
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
