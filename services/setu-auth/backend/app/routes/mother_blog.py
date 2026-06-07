from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_user
from app.core.deps import get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.mother_blog import (
    MATERNAL_CATEGORIES,
    MaternalArticleCard,
    MaternalArticleFull,
    classify_maternal_article,
)
from app.services import blog_fetcher

router = APIRouter(prefix="/api/v1/mother/blog", tags=["mother-blog"])

MATERNAL_FILTER = [
    "pregnancy", "prenatal", "antenatal", "maternal", "obstetric",
    "trimester", "fetal", "gestational", "eclampsia", "anaemia",
    "postpartum", "breastfeed", "newborn",
]


def _is_maternal(title: str, summary: str) -> bool:
    t = (title + " " + (summary or "")).lower()
    return any(k in t for k in MATERNAL_FILTER)


def _to_card(r: dict, bookmarked_ids: set, category: str = None) -> MaternalArticleCard:
    return MaternalArticleCard(
        id=str(r.get("id")) if r.get("id") else None,
        title=r.get("title", ""),
        title_bn=r.get("title_bn"),
        slug=r.get("slug", ""),
        category=category or classify_maternal_article(r.get("title", ""), r.get("summary", "")),
        summary=r.get("summary"),
        summary_bn=r.get("summary_bn"),
        author_name=r.get("author_name"),
        author_role=r.get("author_role"),
        tags=r.get("tags"),
        cover_image_url=r.get("cover_image_url"),
        read_time_mins=r.get("read_time_mins"),
        published_at=r.get("published_at"),
        source_url=r.get("source_url"),
        is_bookmarked=str(r.get("id")) in bookmarked_ids,
    )


def _get_bookmarked_ids(patient_id: str) -> set:
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("article_bookmarks")
            .select("article_id")
            .eq("patient_id", patient_id)
            .execute()
        )
        return {str(r["article_id"]) for r in (result.data or [])}
    except Exception:
        return set()


@router.get("/articles")
async def list_articles(
    category: str = Query(None),
    search: str = Query(None),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    patient: dict = Depends(get_patient),
):
    bookmarked_ids = _get_bookmarked_ids(patient["id"])
    articles_map: dict[str, dict] = {}

    # Supabase articles
    try:
        client = get_admin_client()
        q = (client.table("health_articles")
             .select("*")
             .eq("is_published", True))
        if search:
            q = q.ilike("title", f"%{search}%")
        result = retry_network(lambda: q.order("published_at", desc=True).limit(100).execute())
        for r in (result.data or []):
            if _is_maternal(r.get("title", ""), r.get("summary", "")):
                articles_map[r.get("slug", r.get("id", ""))] = r
    except Exception:
        pass

    # Cache articles
    for r in blog_fetcher._article_cache:
        slug = r.get("slug", "")
        if slug and _is_maternal(r.get("title", ""), r.get("summary", "")):
            if slug not in articles_map:
                articles_map[slug] = r

    cards = []
    for r in articles_map.values():
        cat = classify_maternal_article(r.get("title", ""), r.get("summary", ""))
        if category and cat != category:
            continue
        cards.append(_to_card(r, bookmarked_ids, cat))

    cards.sort(key=lambda c: c.published_at or "", reverse=True)
    total = len(cards)
    return {
        "articles": cards[offset: offset + limit],
        "total": total,
        "categories": MATERNAL_CATEGORIES,
    }


@router.get("/articles/{slug}")
async def get_article(slug: str, patient: dict = Depends(get_patient)):
    bookmarked_ids = _get_bookmarked_ids(patient["id"])

    # Try Supabase first
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("health_articles")
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if rows:
            r = rows[0]
            cat = classify_maternal_article(r.get("title", ""), r.get("summary", ""))
            return MaternalArticleFull(
                id=str(r.get("id")) if r.get("id") else None,
                title=r.get("title", ""),
                title_bn=r.get("title_bn"),
                slug=r.get("slug", slug),
                category=cat,
                summary=r.get("summary"),
                summary_bn=r.get("summary_bn"),
                author_name=r.get("author_name"),
                author_role=r.get("author_role"),
                tags=r.get("tags"),
                cover_image_url=r.get("cover_image_url"),
                read_time_mins=r.get("read_time_mins"),
                published_at=r.get("published_at"),
                source_url=r.get("source_url"),
                is_bookmarked=str(r.get("id")) in bookmarked_ids,
                content=r.get("content") or r.get("summary") or "",
                content_bn=r.get("content_bn"),
            )
    except Exception:
        pass

    # Try cache
    for r in blog_fetcher._article_cache:
        if r.get("slug") == slug:
            cat = classify_maternal_article(r.get("title", ""), r.get("summary", ""))
            return MaternalArticleFull(
                id=None,
                title=r.get("title", ""),
                title_bn=None,
                slug=slug,
                category=cat,
                summary=r.get("summary"),
                summary_bn=None,
                author_name=r.get("author_name"),
                author_role=None,
                tags=r.get("tags"),
                cover_image_url=None,
                read_time_mins=r.get("read_time_mins"),
                published_at=r.get("published_at"),
                source_url=r.get("source_url"),
                is_bookmarked=False,
                content=r.get("content") or r.get("summary") or "",
                content_bn=None,
            )

    raise HTTPException(status_code=404, detail="Article not found.")


@router.post("/articles/{article_id}/bookmark", status_code=status.HTTP_201_CREATED)
async def bookmark_article(article_id: str, patient: dict = Depends(get_patient)):
    try:
        client = get_admin_client()
        retry_network(
            lambda: client.table("article_bookmarks")
            .upsert({"patient_id": patient["id"], "article_id": article_id})
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Could not bookmark article.")
    return {"message": "Bookmarked"}


@router.delete("/articles/{article_id}/bookmark")
async def remove_bookmark(article_id: str, patient: dict = Depends(get_patient)):
    try:
        client = get_admin_client()
        retry_network(
            lambda: client.table("article_bookmarks")
            .delete()
            .eq("patient_id", patient["id"])
            .eq("article_id", article_id)
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Could not remove bookmark.")
    return {"message": "Bookmark removed"}


@router.get("/bookmarks")
async def get_bookmarks(patient: dict = Depends(get_patient)):
    bookmarked_ids = _get_bookmarked_ids(patient["id"])
    if not bookmarked_ids:
        return {"articles": []}

    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("article_bookmarks")
            .select("article_id, health_articles(*)")
            .eq("patient_id", patient["id"])
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch bookmarks.")

    cards = []
    for row in rows:
        r = row.get("health_articles") or {}
        if r and _is_maternal(r.get("title", ""), r.get("summary", "")):
            cards.append(_to_card(r, bookmarked_ids))
    return {"articles": cards}


@router.get("/featured")
async def featured(patient: dict = Depends(get_patient)):
    bookmarked_ids = _get_bookmarked_ids(patient["id"])
    target_cats = ["pregnancy_health", "maternal_diseases", "nutrition"]
    results = []

    try:
        client = get_admin_client()
        for cat in target_cats:
            q = client.table("health_articles").select("*").eq("is_published", True)
            result = retry_network(lambda: q.order("published_at", desc=True).limit(20).execute())
            for r in (result.data or []):
                if (_is_maternal(r.get("title", ""), r.get("summary", ""))
                        and classify_maternal_article(r.get("title", ""), r.get("summary", "")) == cat):
                    results.append(_to_card(r, bookmarked_ids, cat))
                    break
    except Exception:
        pass

    # Fill from cache if needed
    if len(results) < 3:
        for cat in target_cats:
            if any(a.category == cat for a in results):
                continue
            for r in blog_fetcher._article_cache:
                if (_is_maternal(r.get("title", ""), r.get("summary", ""))
                        and classify_maternal_article(r.get("title", ""), r.get("summary", "")) == cat):
                    results.append(_to_card(r, bookmarked_ids, cat))
                    break

    return {"articles": results[:3]}
