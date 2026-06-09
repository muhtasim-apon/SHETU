"use client";

import { useEffect, useRef, useState } from "react";
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
  general_health: "bg-teal-50 text-teal-600",
  chronic_disease: "bg-red-50 text-red-600", nutrition: "bg-green-50 text-green-600",
  mental_health: "bg-purple-50 text-purple-600", exercise_wellness: "bg-blue-50 text-blue-600",
  emergency_signs: "bg-orange-50 text-orange-600", medicine_guide: "bg-amber-50 text-amber-700",
  lifestyle: "bg-pink-50 text-pink-600",
};

const STATIC_ARTICLES: Article[] = [
  { slug: "diabetes-management-bangladesh", title: "Managing Diabetes in Bangladesh: A Complete Guide", category: "chronic_disease", summary: "Evidence-based strategies for controlling blood sugar with affordable local foods, medication adherence, and lifestyle changes.", author_name: "Dr. Rasheda Khanam", read_time_mins: 8 },
  { slug: "hypertension-salt-reduction", title: "High Blood Pressure: Why Salt Matters and How to Cut It", category: "chronic_disease", summary: "How sodium affects blood pressure and practical tips using Bangladeshi cuisine to stay under 2,000 mg/day.", author_name: "Dr. Farhan Islam", read_time_mins: 6 },
  { slug: "anaemia-iron-rich-foods", title: "Fighting Anaemia with Iron-Rich Bangladeshi Foods", category: "nutrition", summary: "Spinach, lentils, hilsa fish, and molasses — how to boost haemoglobin naturally on a low budget.", author_name: "Dr. Sumaiya Ahmed", read_time_mins: 5 },
  { slug: "mental-health-stigma", title: "Breaking the Stigma: Mental Health in Bangladesh", category: "mental_health", summary: "Understanding depression and anxiety, how to seek help, and community resources available across divisions.", author_name: "Dr. Nusrat Jahan", read_time_mins: 7 },
  { slug: "exercise-for-chronic-disease", title: "Safe Exercise with Chronic Disease: Start Where You Are", category: "exercise_wellness", summary: "Walking, yoga, and swimming routines adapted for people with diabetes, hypertension, or heart disease.", author_name: "Physiotherapist Rina Begum", read_time_mins: 6 },
  { slug: "recognising-heart-attack-signs", title: "Recognising a Heart Attack: Don't Ignore These Signs", category: "emergency_signs", summary: "Chest pressure, left arm pain, jaw pain — know when to call 999. Includes what to do while waiting for help.", author_name: "Dr. Kamal Hossain", read_time_mins: 4 },
  { slug: "kidney-disease-prevention", title: "Protecting Your Kidneys: Prevention and Early Signs", category: "chronic_disease", summary: "How to preserve kidney function through hydration, blood sugar control, and reducing NSAID use.", author_name: "Dr. Arif Chowdhury", read_time_mins: 7 },
  { slug: "thyroid-disorders-women", title: "Thyroid Disorders in Women: Symptoms You Should Know", category: "general_health", summary: "Hypothyroidism and hyperthyroidism explained — fatigue, weight changes, hair loss, and when to get tested.", author_name: "Dr. Shahida Parvin", read_time_mins: 5 },
  { slug: "healthy-eating-ramadan", title: "Staying Healthy During Ramadan with Chronic Conditions", category: "nutrition", summary: "How to safely fast with diabetes or hypertension, what to eat at sehri and iftar, and when to break the fast.", author_name: "Nutritionist Fatema Khatun", read_time_mins: 6 },
  { slug: "stroke-warning-signs", title: "FAST: Recognising Stroke Symptoms Before It's Too Late", category: "emergency_signs", summary: "Face drooping, Arm weakness, Speech difficulty, Time to call 999. Every minute of delay costs brain cells.", author_name: "Dr. Mamun Rashid", read_time_mins: 3 },
  { slug: "sleep-disorders-bangladesh", title: "Why Bangladesh's Adults Are Sleep-Deprived and How to Fix It", category: "lifestyle", summary: "Sleep hygiene tips that work in a South Asian household, how poor sleep worsens diabetes and heart disease.", author_name: "Dr. Rubina Akhter", read_time_mins: 5 },
  { slug: "metformin-guide", title: "Metformin: What Every Bangladeshi Diabetic Patient Must Know", category: "medicine_guide", summary: "How to take metformin correctly, manage side effects, and what foods to avoid with this common medication.", author_name: "Pharmacist Mohiuddin Sarkar", read_time_mins: 5 },
  { slug: "general-health-checkup", title: "Essential Health Tests Every Adult Should Get Annually", category: "general_health", summary: "Blood glucose, HbA1c, lipid profile, creatinine, TSH — why you need these and where to get them affordably.", author_name: "Dr. Shirin Sultana", read_time_mins: 4 },
  { slug: "cholesterol-diet", title: "Lowering Cholesterol Through Diet: A Bangladeshi Perspective", category: "nutrition", summary: "Reducing saturated fats from mustard oil and ghee, increasing omega-3 from hilsa and sardines.", author_name: "Nutritionist Anika Islam", read_time_mins: 6 },
  { slug: "mental-wellness-daily-habits", title: "10 Daily Habits for Better Mental Wellness", category: "mental_health", summary: "Practical, free mental wellness strategies: gratitude journaling, social connection, nature time, and mindful prayer.", author_name: "Counselor Dilara Begum", read_time_mins: 5 },
];

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
