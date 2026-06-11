"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Bookmark, Search } from "lucide-react";
import { saathiGet, saathiPost, saathiDelete } from "@/lib/saathi";
import { STATIC_ARTICLES } from "@/lib/static-articles";

interface Article {
  id?: string; title: string; slug: string; category: string; summary?: string;
  author_name?: string; read_time_mins?: number; published_at?: string;
  is_bookmarked?: boolean; tags?: string[]; source_url?: string;
}

const CATS: [string, string][] = [
  ["", "All"], ["general_health", "General Health"], ["chronic_disease", "Chronic Disease"],
  ["nutrition", "Nutrition"], ["mental_health", "Mental Health"], ["exercise_wellness", "Exercise"],
  ["emergency_signs", "Emergency"], ["medicine_guide", "Medicines"], ["lifestyle", "Lifestyle"],
];

const CAT_COLORS: Record<string, string> = {
  general_health: "bg-teal-50 text-teal-600",
  chronic_disease: "bg-red-50 text-red-600", nutrition: "bg-green-50 text-green-600",
  mental_health: "bg-purple-50 text-purple-600", exercise_wellness: "bg-blue-50 text-blue-600",
  emergency_signs: "bg-orange-50 text-orange-600", medicine_guide: "bg-amber-50 text-amber-700",
  lifestyle: "bg-pink-50 text-pink-600",
};

export default function BlogPage() {
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [featured, setFeatured] = useState<Article[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  async function load(reset: boolean, catArg = cat, searchArg = search, offsetArg = 0) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const q = `category=${catArg}&search=${encodeURIComponent(searchArg)}&limit=12&offset=${offsetArg}`;
      const d = await saathiGet<{ articles: Article[]; total: number }>(`/api/v1/blog/articles?${q}`);
      const fetched = d.articles ?? [];
      if (fetched.length === 0 && offsetArg === 0) {
        // Backend returned nothing — show filtered static fallback
        const filtered = STATIC_ARTICLES.filter(a =>
          (!catArg || a.category === catArg) &&
          (!searchArg || a.title.toLowerCase().includes(searchArg.toLowerCase()) || (a.summary ?? '').toLowerCase().includes(searchArg.toLowerCase()))
        );
        setArticles(filtered);
        setTotal(filtered.length);
      } else {
        setArticles(reset ? fetched : prev => [...prev, ...fetched]);
        setTotal(d.total ?? fetched.length);
        setOffset(offsetArg + 12);
      }
    } catch {
      // On error, show static fallback
      const filtered = STATIC_ARTICLES.filter(a =>
        (!catArg || a.category === catArg) &&
        (!searchArg || a.title.toLowerCase().includes(searchArg.toLowerCase()))
      );
      setArticles(filtered);
      setTotal(filtered.length);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    saathiGet<{ articles: Article[] }>("/api/v1/blog/featured")
      .then(d => setFeatured(d.articles ?? []))
      .catch(() => setFeatured(STATIC_ARTICLES.slice(0, 3)));
    load(true, "", "", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleCat(newCat: string) {
    setCat(newCat);
    setOffset(0);
    load(true, newCat, search, 0);
  }

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setOffset(0); load(true, cat, q, 0); }, 350);
  }

  async function toggleBookmark(a: Article) {
    if (!a.id) return;
    try {
      if (a.is_bookmarked) await saathiDelete(`/api/v1/blog/articles/${a.id}/bookmark`);
      else await saathiPost(`/api/v1/blog/articles/${a.id}/bookmark`);
      setArticles(prev => prev.map(x => x.slug === a.slug ? { ...x, is_bookmarked: !x.is_bookmarked } : x));
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-12">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.push("/dashboard/patient/saathi")} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-bold mt-2">Health Blog</h1>
          <p className="text-sm text-white/60 mt-0.5">Evidence-based guides for your health</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input placeholder="Search articles" value={search} onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATS.map(([v, l]) => (
            <button key={v} onClick={() => handleCat(v)}
              className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full flex-shrink-0 transition-colors ${cat === v ? "bg-[#0E7C66] text-white" : "bg-white text-gray-600 border border-gray-200"}`}>{l}</button>
          ))}
        </div>

        {featured.length > 0 && !cat && !search && (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">Featured</p>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {featured.map(a => (
                <button key={a.slug} onClick={() => router.push(`/dashboard/patient/saathi/blog/${a.slug}`)}
                  className="shrink-0 w-52 bg-white rounded-2xl shadow-sm overflow-hidden text-left">
                  <div className="h-20 bg-gradient-to-br from-[#0E7C66] to-[#08231F]" />
                  <div className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] ?? "bg-gray-100 text-gray-600"}`}>
                      {a.category.replace(/_/g, " ")}
                    </span>
                    <p className="text-sm font-medium text-gray-800 mt-1 line-clamp-2">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{a.author_name} · {a.read_time_mins ?? 2}m</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {articles.map(a => (
            <div key={a.slug} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between">
                <button onClick={() => router.push(`/dashboard/patient/saathi/blog/${a.slug}`)} className="text-left flex-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] ?? "bg-gray-100 text-gray-600"}`}>
                    {a.category.replace(/_/g, " ")}
                  </span>
                  <p className="font-medium text-gray-800 mt-1.5">{a.title}</p>
                  {a.summary && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.summary}</p>}
                  <p className="text-xs text-gray-400 mt-1">{a.author_name} · {a.read_time_mins ?? 2} min read</p>
                </button>
                {a.id && (
                  <button onClick={() => toggleBookmark(a)} className="ml-2 shrink-0 mt-1">
                    <Bookmark size={18} className={a.is_bookmarked ? "fill-[#0E7C66] text-[#0E7C66]" : "text-gray-300"} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {loading && <div className="flex justify-center py-6"><div className="animate-spin border-2 border-t-teal-600 rounded-full w-8 h-8" /></div>}
        {!loading && articles.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No articles found.</p>}
        {!loading && articles.length > 0 && articles.length < total && (
          <button onClick={() => load(false, cat, search, offset)} className="w-full bg-white border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600">
            Load More
          </button>
        )}
      </main>
    </div>
  );
}
