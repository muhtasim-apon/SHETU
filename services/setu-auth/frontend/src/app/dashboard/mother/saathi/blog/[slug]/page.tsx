'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Heart, Clock, User } from 'lucide-react'
import BottomNav from '@/components/mother/BottomNav'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('shetu_token') : ''
  return { Authorization: `Bearer ${token}` }
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
const CAT_LABELS: Record<string, string> = {
  pregnancy_health: 'Pregnancy Health',
  maternal_diseases: 'Maternal Diseases',
  nutrition: 'Nutrition',
  mental_health: 'Mental Health',
  postpartum: 'Postpartum',
  newborn_care: 'Newborn Care',
  exercise_wellness: 'Exercise',
  emergency_signs: 'Emergency Signs',
}

export default function ArticlePage() {
  const router = useRouter()
  const params = useParams()
  const slug = params?.slug as string
  const [article, setArticle] = useState<any>(null)
  const [related, setRelated] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookmarked, setBookmarked] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/mother/blog/articles/${slug}`, { headers: authHeaders() })
        if (!res.ok) throw new Error('Article not found')
        const data = await res.json()
        setArticle(data)
        setBookmarked(data.is_bookmarked)
        // Fetch related articles
        try {
          const params = new URLSearchParams({ limit: '3' })
          if (data.category) params.set('category', data.category)
          const relRes = await fetch(`${API_BASE}/api/v1/mother/blog/articles?${params}`, { headers: authHeaders() })
          const relData = await relRes.json()
          setRelated((relData.articles || []).filter((a: any) => a.slug !== slug).slice(0, 2))
        } catch {}
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  async function toggleBookmark() {
    if (!article?.id) return
    const method = bookmarked ? 'DELETE' : 'POST'
    try {
      await fetch(`${API_BASE}/api/v1/mother/blog/articles/${article.id}/bookmark`, {
        method, headers: authHeaders(),
      })
      setBookmarked(!bookmarked)
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center">
        <div className="animate-spin border-2 border-t-teal-600 rounded-full w-8 h-8" />
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto flex flex-col items-center justify-center p-6">
        <p className="text-gray-500 mb-4">Article not found.</p>
        <button onClick={() => router.push('/dashboard/mother/saathi/blog')}
          className="text-teal-600 underline text-sm">Back to Blog</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] max-w-md mx-auto pb-28">
      {/* Header */}
      <div className="bg-white px-5 pt-10 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => router.push('/dashboard/mother/saathi/blog')}
            className="flex items-center gap-1 text-gray-500 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          {article.author_name && (
            <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {article.author_name}
            </span>
          )}
        </div>

        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[article.category] || 'bg-gray-100 text-gray-600'}`}>
          {CAT_LABELS[article.category] || article.category}
        </span>

        <h1 className="text-[20px] font-bold text-gray-900 mt-2 leading-tight">{article.title}</h1>

        <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-400">
          {article.author_name && (
            <span className="flex items-center gap-1"><User size={12} /> {article.author_name}</span>
          )}
          {article.published_at && (
            <span>{article.published_at?.slice(0, 10)}</span>
          )}
          {article.read_time_mins && (
            <span className="flex items-center gap-1"><Clock size={12} /> {article.read_time_mins} min</span>
          )}
        </div>
        <div className="h-px bg-teal-100 mt-3" />
      </div>

      <div className="px-5 pt-4">
        <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap">
          {article.content}
        </div>

        {article.source_url && (
          <a href={article.source_url} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-teal-600 underline mt-4 block">
            Read original source →
          </a>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-6">
            <p className="text-[13px] font-semibold text-gray-700 mb-2">Related Articles</p>
            <div className="grid grid-cols-2 gap-3">
              {related.map((a: any, i: number) => (
                <div key={a.id || i}
                  onClick={() => router.push(`/dashboard/mother/saathi/blog/${a.slug}`)}
                  className="bg-white rounded-xl shadow-sm p-3 cursor-pointer">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CAT_COLORS[a.category] || 'bg-gray-100 text-gray-500'}`}>
                    {CAT_LABELS[a.category] || a.category}
                  </span>
                  <p className="text-[12px] font-semibold text-gray-800 mt-1 line-clamp-3">{a.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating bookmark */}
      <button onClick={toggleBookmark}
        className="fixed bottom-24 right-6 bg-white shadow-lg rounded-full p-3 border border-gray-100">
        <Heart size={20} className={bookmarked ? 'fill-teal-600 text-teal-600' : 'text-gray-400'} />
      </button>

      <BottomNav activeTab="home" />
    </div>
  )
}
