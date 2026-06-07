"""Pydantic models for the health blog."""
from typing import Optional

from pydantic import BaseModel


class ArticleCard(BaseModel):
    id: Optional[str] = None
    title: str
    title_bn: Optional[str] = None
    slug: str
    category: str
    summary: Optional[str] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    tags: Optional[list[str]] = None
    cover_image_url: Optional[str] = None
    read_time_mins: Optional[int] = None
    published_at: Optional[str] = None
    source_url: Optional[str] = None
    is_bookmarked: bool = False


class ArticleFull(ArticleCard):
    content: str = ""
    content_bn: Optional[str] = None
    summary_bn: Optional[str] = None
