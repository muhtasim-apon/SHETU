"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Bookmark, Search } from "lucide-react";
import { saathiGet, saathiPost, saathiDelete } from "@/lib/saathi";

interface Article {
  id?: string; title: string; slug: string; category: string; summary?: string;
  author_name?: string; read_time_mins?: number; published_at?: string;
  is_bookmarked?: boolean; tags?: string[];
}

const CATS: [string, string][] = [
  ["", "All"], ["general_health", "General Health"], ["chronic_disease", "Chronic Disease"],
  ["nutrition", "Nutrition"], ["mental_health", "Mental Health"], ["exercise_wellness", "Exercise"],
  ["emergency_signs", "Emergency"], ["medicine_guide", "Medicines"], ["lifestyle", "Lifestyle"],
];

const CAT_COLORS: Record<string, string> = {
  chronic_disease: "bg-red-50 text-red-600", nutrition: "bg-green-50 text-green-600",
  mental_health: "bg-purple-50 text-purple-600", exercise_wellness: "bg-blue-50 text-blue-600",
  emergency_signs: "bg-orange-50 text-orange-600",
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

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const off = reset ? 0 : offset;
    try {
      const q = `category=${cat}&search=${encodeURIComponent(search)}&limit=12&offset=${off}`;
      const d = await saathiGet<{ articles: Article[]; total: number }>(`/api/v1/blog/articles?${q}`);
      setArticles(reset ? d.articles : [...articles, ...d.articles]);
      setTotal(d.total);
      setOffset(off + 12);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [cat, search, offset, articles]);

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    saathiGet<{ articles: Article[] }>("/api/v1/blog/featured").then((d) => setFeatured(d.articles)).catch(() => {});
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [cat]);

  async function toggleBookmark(a: Article) {
    if (!a.id) return;
    try {
      if (a.is_bookmarked) await saathiDelete(`/api/v1/blog/articles/${a.id}/bookmark`);
      else await saathiPost(`/api/v1/blog/articles/${a.id}/bookmark`);
      setArticles((prev) => prev.map((x) => x.slug === a.slug ? { ...x, is_bookmarked: !x.is_bookmarked } : x));
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
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input placeholder="Search articles" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(true)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATS.map(([v, l]) => (
            <button key={v} onClick={() => setCat(v)}
              className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full ${cat === v ? "bg-[#0E7C66] text-white" : "bg-white text-gray-600"}`}>{l}</button>
          ))}
        </div>

        {featured.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">Featured</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {featured.map((a) => (
                <button key={a.slug} onClick={() => router.push(`/dashboard/patient/saathi/blog/${a.slug}`)}
                  className="shrink-0 w-52 bg-white rounded-2xl shadow-sm overflow-hidden text-left">
                  <div className="h-20 bg-gradient-to-br from-[#0E7C66] to-[#08231F]" />
                  <div className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] ?? "bg-gray-100 text-gray-600"}`}>{a.category.replace(/_/g, " ")}</span>
                    <p className="text-sm font-medium text-gray-800 mt-1 line-clamp-2">{a.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{a.author_name} · {a.read_time_mins ?? 2}m</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {articles.map((a) => (
            <div key={a.slug} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between">
                <button onClick={() => router.push(`/dashboard/patient/saathi/blog/${a.slug}`)} className="text-left flex-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] ?? "bg-gray-100 text-gray-600"}`}>{a.category.replace(/_/g, " ")}</span>
                  <p className="font-medium text-gray-800 mt-1">{a.title}</p>
                  {a.summary && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.summary}</p>}
                  <p className="text-xs text-gray-400 mt-1">{a.author_name} · {a.read_time_mins ?? 2} min read</p>
                </button>
                <button onClick={() => toggleBookmark(a)} className="ml-2 shrink-0">
                  <Bookmark size={18} className={a.is_bookmarked ? "fill-[#0E7C66] text-[#0E7C66]" : "text-gray-300"} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {loading && <p className="text-sm text-gray-400 text-center">Loading...</p>}
        {!loading && articles.length === 0 && <p className="text-sm text-gray-400 text-center">No articles found.</p>}
        {articles.length < total && !loading && (
          <button onClick={() => load(false)} className="w-full bg-white border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600">Load More</button>
        )}
      </main>
    </div>
  );
}
