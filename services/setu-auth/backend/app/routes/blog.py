"""Health blog — articles, bookmarks, featured."""
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.blog import ArticleCard, ArticleFull
from app.services import blog_fetcher

router = APIRouter(prefix="/api/v1/blog", tags=["blog"])

CATEGORIES = [
    "general_health", "chronic_disease", "nutrition", "mental_health",
    "exercise_wellness", "emergency_signs", "medicine_guide", "lifestyle",
]


def _bookmarked_ids(client, patient_id: str) -> set:
    try:
        res = retry_network(
            lambda: client.table("article_bookmarks").select("article_id")
            .eq("patient_id", patient_id).execute()
        )
        return {r["article_id"] for r in (res.data or [])}
    except Exception:  # noqa: BLE001
        return set()


def _card_from_db(row: dict, bookmarked_ids: set) -> ArticleCard:
    return ArticleCard(
        id=row.get("id"),
        title=row.get("title") or "",
        title_bn=row.get("title_bn"),
        slug=row.get("slug") or "",
        category=row.get("category") or "general_health",
        summary=row.get("summary"),
        author_name=row.get("author_name"),
        author_role=row.get("author_role"),
        tags=row.get("tags") or [],
        cover_image_url=row.get("cover_image_url"),
        read_time_mins=row.get("read_time_mins"),
        published_at=str(row.get("published_at")) if row.get("published_at") else None,
        is_bookmarked=row.get("id") in bookmarked_ids,
    )


def _card_from_cache(a: dict) -> ArticleCard:
    return ArticleCard(
        id=None,
        title=a.get("title") or "",
        slug=a.get("slug") or "",
        category=a.get("category") or "general_health",
        summary=a.get("summary"),
        author_name=a.get("author_name"),
        author_role=a.get("author_role"),
        tags=a.get("tags") or [],
        read_time_mins=a.get("read_time_mins"),
        published_at=a.get("published_at"),
        source_url=a.get("source_url"),
        is_bookmarked=False,
    )


@router.get("/articles")
async def list_articles(category: str = Query(None), search: str = Query(None),
                        limit: int = Query(12), offset: int = Query(0),
                        patient=Depends(get_patient)):
    client = get_admin_client()
    bookmarked = _bookmarked_ids(client, patient["id"])

    db_cards = []
    total = 0
    try:
        query = client.table("health_articles").select("*", count="exact").eq("is_published", True)
        if category:
            query = query.eq("category", category)
        if search:
            query = query.ilike("title", f"%{search}%")
        res = retry_network(
            lambda: query.order("published_at", desc=True).range(offset, offset + limit - 1).execute()
        )
        db_cards = [_card_from_db(r, bookmarked) for r in (res.data or [])]
        total = res.count or len(db_cards)
    except Exception:  # noqa: BLE001
        db_cards = []

    # Merge non-synced cache articles (dedupe by slug).
    seen = {c.slug for c in db_cards}
    cache_cards = []
    for a in blog_fetcher.get_cached_articles():
        if a["slug"] in seen:
            continue
        if category and a.get("category") != category:
            continue
        if search and search.lower() not in (a.get("title", "").lower()):
            continue
        cache_cards.append(_card_from_cache(a))
        seen.add(a["slug"])

    merged = db_cards + cache_cards
    if not db_cards:
        # Apply pagination over cache-only result.
        total = len(merged)
        merged = merged[offset:offset + limit]

    return {"articles": merged, "total": total, "categories": CATEGORIES}


@router.get("/featured")
async def featured(patient=Depends(get_patient)):
    client = get_admin_client()
    bookmarked = _bookmarked_ids(client, patient["id"])
    cards = []
    seen_cat = set()
    try:
        res = retry_network(
            lambda: client.table("health_articles").select("*").eq("is_published", True)
            .order("published_at", desc=True).limit(20).execute()
        )
        for r in res.data or []:
            cat = r.get("category")
            if cat in seen_cat:
                continue
            seen_cat.add(cat)
            cards.append(_card_from_db(r, bookmarked))
            if len(cards) >= 5:
                break
    except Exception:  # noqa: BLE001
        pass

    if len(cards) < 3:
        for a in blog_fetcher.get_cached_articles():
            cat = a.get("category")
            if cat in seen_cat:
                continue
            seen_cat.add(cat)
            cards.append(_card_from_cache(a))
            if len(cards) >= 5:
                break

    return {"articles": cards[:5]}


@router.get("/bookmarks")
async def bookmarks(patient=Depends(get_patient)):
    client = get_admin_client()
    try:
        res = retry_network(
            lambda: client.table("article_bookmarks")
            .select("article_id, health_articles(*)").eq("patient_id", patient["id"]).execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to load bookmarks: {exc}")
    cards = []
    for r in res.data or []:
        art = r.get("health_articles")
        if art:
            card = _card_from_db(art, {art.get("id")})
            card.is_bookmarked = True
            cards.append(card)
    return {"articles": cards, "count": len(cards)}


@router.get("/articles/{slug}")
async def article_detail(slug: str, patient=Depends(get_patient)):
    client = get_admin_client()
    bookmarked = _bookmarked_ids(client, patient["id"])
    try:
        res = retry_network(
            lambda: client.table("health_articles").select("*").eq("slug", slug).limit(1).execute()
        )
        if res.data:
            row = res.data[0]
            return ArticleFull(
                **_card_from_db(row, bookmarked).model_dump(),
                content=row.get("content") or row.get("summary") or "",
                content_bn=row.get("content_bn"),
                summary_bn=row.get("summary_bn"),
            )
    except Exception:  # noqa: BLE001
        pass

    for a in blog_fetcher.get_cached_articles():
        if a["slug"] == slug:
            base = _card_from_cache(a)
            return ArticleFull(**base.model_dump(), content=a.get("summary") or "")

    raise HTTPException(status_code=404, detail="Article not found.")


@router.post("/articles/{article_id}/bookmark", status_code=status.HTTP_201_CREATED)
async def add_bookmark(article_id: str, patient=Depends(get_patient)):
    client = get_admin_client()
    try:
        retry_network(
            lambda: client.table("article_bookmarks").upsert(
                {"patient_id": patient["id"], "article_id": article_id},
                on_conflict="patient_id,article_id",
            ).execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to bookmark: {exc}")
    return {"message": "Bookmarked", "bookmarked": True}


@router.delete("/articles/{article_id}/bookmark")
async def remove_bookmark(article_id: str, patient=Depends(get_patient)):
    client = get_admin_client()
    retry_network(
        lambda: client.table("article_bookmarks").delete()
        .eq("patient_id", patient["id"]).eq("article_id", article_id).execute()
    )
    return {"message": "Bookmark removed", "bookmarked": False}
