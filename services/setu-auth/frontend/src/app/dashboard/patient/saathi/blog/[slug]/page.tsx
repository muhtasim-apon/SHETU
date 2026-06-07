"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Bookmark, ExternalLink } from "lucide-react";
import { saathiGet, saathiPost, saathiDelete } from "@/lib/saathi";

interface Article {
  id?: string; title: string; slug: string; category: string; content: string;
  summary?: string; author_name?: string; author_role?: string; read_time_mins?: number;
  published_at?: string; source_url?: string; is_bookmarked?: boolean;
}

export default function ArticleReaderPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;
  const [a, setA] = useState<Article | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("shetu_token")) { router.replace("/auth/signin"); return; }
    saathiGet<Article>(`/api/v1/blog/articles/${slug}`).then(setA).catch((e) => setError((e as Error).message));
  }, [router, slug]);

  async function toggle() {
    if (!a?.id) return;
    try {
      if (a.is_bookmarked) await saathiDelete(`/api/v1/blog/articles/${a.id}/bookmark`);
      else await saathiPost(`/api/v1/blog/articles/${a.id}/bookmark`);
      setA({ ...a, is_bookmarked: !a.is_bookmarked });
    } catch { /* ignore */ }
  }

  if (error) return <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center text-sm text-red-600">{error}</div>;
  if (!a) return <div className="min-h-screen bg-[#F4FAF8] flex items-center justify-center text-sm text-gray-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#F4FAF8] pb-24">
      <header className="bg-[#0E7C66] text-white px-5 pt-6 pb-5">
        <div className="max-w-md mx-auto">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-white/70 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-[#E8F5F0] text-[#0E7C66] px-2 py-0.5 rounded-full">{a.category.replace(/_/g, " ")}</span>
          {a.author_name && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.author_name}</span>}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">{a.title}</h1>
        <p className="text-sm text-gray-400 mt-2">
          {a.author_role}{a.published_at ? ` · ${new Date(a.published_at).toLocaleDateString()}` : ""} · {a.read_time_mins ?? 2} min read
        </p>
        <hr className="my-4 border-gray-200" />
        <div className="prose prose-sm text-gray-700 leading-relaxed space-y-3">
          {(a.content || a.summary || "").split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {a.source_url && (
          <a href={a.source_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 mt-4 text-sm text-[#0E7C66]">
            Read full source <ExternalLink size={14} />
          </a>
        )}
      </main>

      <button onClick={toggle}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#0E7C66] text-white shadow-lg flex items-center justify-center">
        <Bookmark size={22} className={a.is_bookmarked ? "fill-white" : ""} />
      </button>
    </div>
  );
}
