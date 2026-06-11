"""WHO/CDC/NHS RSS fetcher + in-memory cache + Supabase sync."""
import logging
import re
import unicodedata
from datetime import datetime
from typing import Optional

import feedparser

from app.core.config import settings

logger = logging.getLogger(__name__)

SOURCES = {
    "WHO": {
        "url": settings.WHO_RSS_URL,
        "keywords": ["health", "disease", "chronic", "diabetes", "hypertension",
                     "cardiovascular", "obesity", "mental", "nutrition", "cancer"],
    },
    "CDC": {
        "url": settings.CDC_RSS_URL,
        "keywords": ["health", "chronic disease", "heart", "diabetes", "mental"],
    },
    "NHS": {
        "url": settings.NHS_RSS_URL,
        "keywords": ["health", "condition", "disease", "treatment", "prevention"],
    },
}

_article_cache: list[dict] = []
_cache_updated_at: Optional[datetime] = None


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")


def classify_article(title: str, summary: str) -> str:
    text = ((title or "") + " " + (summary or "")).lower()
    if any(w in text for w in ["diabetes", "blood sugar", "insulin", "glucose"]):
        return "chronic_disease"
    if any(w in text for w in ["heart", "cardiac", "blood pressure", "hypertension", "cholesterol"]):
        return "chronic_disease"
    if any(w in text for w in ["diet", "nutrition", "vitamin", "mineral", "supplement", "food", "eat"]):
        return "nutrition"
    if any(w in text for w in ["mental", "depression", "anxiety", "stress", "wellbeing", "mood"]):
        return "mental_health"
    if any(w in text for w in ["exercise", "fitness", "physical activity", "yoga", "walk", "sport"]):
        return "exercise_wellness"
    if any(w in text for w in ["emergency", "urgent", "warning", "danger", "symptom", "pain"]):
        return "emergency_signs"
    if any(w in text for w in ["medicine", "drug", "medication", "treatment", "therapy", "prescription"]):
        return "medicine_guide"
    if any(w in text for w in ["lifestyle", "habit", "routine", "smoke", "alcohol", "sleep"]):
        return "lifestyle"
    return "general_health"


def extract_tags(title: str, summary: str) -> list[str]:
    tag_keywords = ["diabetes", "hypertension", "heart disease", "obesity", "cancer",
                    "mental health", "nutrition", "exercise", "prevention", "chronic"]
    text = ((title or "") + " " + (summary or "")).lower()
    return [t for t in tag_keywords if t in text][:5]


def _clean_summary(raw: str) -> str:
    from bs4 import BeautifulSoup
    if not raw:
        return ""
    return BeautifulSoup(raw, "html.parser").get_text(" ", strip=True)


async def fetch_and_cache_articles():
    """Fetch all RSS feeds, filter by keywords, populate the in-memory cache."""
    import asyncio
    global _article_cache, _cache_updated_at
    all_articles = []
    loop = asyncio.get_event_loop()
    for source_name, cfg in SOURCES.items():
        try:
            # Run blocking feedparser.parse in a thread so the event loop stays free
            feed = await loop.run_in_executor(None, feedparser.parse, cfg["url"])
            if getattr(feed, "bozo", False) and not feed.entries:
                logger.warning("%s RSS feed returned no entries (bozo=%s): %s",
                               source_name, feed.bozo, getattr(feed, "bozo_exception", ""))
            matched = 0
            for entry in feed.entries:
                title = entry.get("title", "")
                summary = _clean_summary(entry.get("summary", ""))
                text = (title + " " + summary).lower()
                if any(kw in text for kw in cfg["keywords"]):
                    matched += 1
                    link = entry.get("link", "")
                    entry_id = entry.get("id", "")
                    # CDC's podcast feed links point to audio downloads; prefer the
                    # article page URL given in <id> when available.
                    source_url = entry_id if "download.asp" in link and entry_id.startswith("http") else link
                    all_articles.append({
                        "title": title,
                        "summary": summary[:500],
                        "source_url": source_url,
                        "published_at": entry.get("published", ""),
                        "author_name": source_name,
                        "author_role": "Public Health Authority",
                        "category": classify_article(title, summary),
                        "slug": slugify(title)[:100],
                        "read_time_mins": max(1, len(summary.split()) // 200),
                        "tags": extract_tags(title, summary),
                    })
            logger.info("%s RSS: %d entries fetched, %d matched keywords.",
                        source_name, len(feed.entries), matched)
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to fetch %s RSS: %s", source_name, e)

    seen = set()
    deduped = []
    for a in sorted(all_articles, key=lambda x: x.get("published_at", ""), reverse=True):
        if a["slug"] and a["slug"] not in seen:
            seen.add(a["slug"])
            deduped.append(a)

    _article_cache = deduped[:60]
    _cache_updated_at = datetime.now()
    logger.info("Cached %d health articles.", len(_article_cache))


def get_cached_articles() -> list[dict]:
    return list(_article_cache)


async def sync_articles_to_supabase():
    """Upsert cached articles into the health_articles table."""
    from app.core.supabase import get_admin_client
    client = get_admin_client()
    for article in _article_cache:
        try:
            client.table("health_articles").upsert({
                "slug": article["slug"],
                "title": article["title"],
                "content": article["summary"],
                "summary": article["summary"][:200],
                "category": article["category"],
                "author_name": article["author_name"],
                "author_role": article["author_role"],
                "tags": article.get("tags", []),
                "is_published": True,
                "read_time_mins": article.get("read_time_mins", 2),
            }, on_conflict="slug").execute()
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to sync article to Supabase: %s", e)
