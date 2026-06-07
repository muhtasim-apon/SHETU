from typing import Optional
from pydantic import BaseModel

MATERNAL_CATEGORIES = [
    "pregnancy_health", "maternal_diseases", "nutrition",
    "mental_health", "postpartum", "newborn_care", "exercise_wellness", "emergency_signs"
]

MATERNAL_KEYWORDS = [
    "pregnancy", "prenatal", "antenatal", "maternal", "obstetric",
    "trimester", "fetal", "foetal", "gestational", "pre-eclampsia", "eclampsia",
    "anaemia", "anemia", "postpartum", "breastfeed", "newborn", "labour", "delivery", "birth"
]


class MaternalArticleCard(BaseModel):
    id: Optional[str]
    title: str
    title_bn: Optional[str]
    slug: str
    category: str
    summary: Optional[str]
    summary_bn: Optional[str]
    author_name: Optional[str]
    author_role: Optional[str]
    tags: Optional[list[str]]
    cover_image_url: Optional[str]
    read_time_mins: Optional[int]
    published_at: Optional[str]
    source_url: Optional[str]
    is_bookmarked: bool = False


class MaternalArticleFull(MaternalArticleCard):
    content: str
    content_bn: Optional[str]


def classify_maternal_article(title: str, summary: str) -> str:
    t = (title + " " + (summary or "")).lower()
    if any(k in t for k in ["pre-eclampsia", "eclampsia", "hypertension", "gestational diabetes",
                              "anaemia", "anemia", "hepatitis", "syphilis", "hiv"]):
        return "maternal_diseases"
    if any(k in t for k in ["nutrition", "diet", "iron", "folic", "calcium", "vitamin", "supplement"]):
        return "nutrition"
    if any(k in t for k in ["depression", "anxiety", "mental", "stress", "emotional", "mood"]):
        return "mental_health"
    if any(k in t for k in ["postpartum", "postnatal", "after delivery", "breastfeed", "recovery"]):
        return "postpartum"
    if any(k in t for k in ["newborn", "infant", "neonatal", "baby care", "cord", "vaccination"]):
        return "newborn_care"
    if any(k in t for k in ["exercise", "yoga", "walking", "fitness", "kegel", "stretching"]):
        return "exercise_wellness"
    if any(k in t for k in ["danger sign", "emergency", "bleeding", "warning",
                              "severe headache", "convulsion", "no fetal movement"]):
        return "emergency_signs"
    return "pregnancy_health"
