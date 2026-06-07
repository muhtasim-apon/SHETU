from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.models.mother_consultancy import GynecologistCard, GynecologistResponse
from app.services.mother_doctors_service import (
    MATERNAL_EMERGENCY_CONTACTS,
    MATERNAL_USEFUL_LINKS,
    search_gynecologists,
    get_telemedicine_gynecologists,
)

router = APIRouter(prefix="/api/v1/mother/doctors", tags=["mother-doctors"])

DISCLAIMER = "Always verify on bmdc.org.bd. Data is curated, not live BMDC."


def _to_card(d: dict) -> GynecologistCard:
    return GynecologistCard(
        id=str(d.get("id")) if d.get("id") else None,
        bmdc_number=d.get("bmdc_number"),
        full_name=d.get("full_name", "Unknown"),
        qualification=d.get("qualification"),
        specialty=d.get("specialty", "Gynaecology"),
        district=d.get("district"),
        upazila=d.get("upazila"),
        chamber_name=d.get("chamber_name"),
        chamber_address=d.get("chamber_address"),
        phone=d.get("phone"),
        phone_alt=d.get("phone_alt"),
        visiting_hours=d.get("visiting_hours"),
        telemedicine_available=bool(d.get("telemedicine_available", False)),
        telemedicine_platform=d.get("telemedicine_platform"),
        consultation_fee=d.get("consultation_fee"),
        bio=d.get("bio"),
    )


@router.get("/search", response_model=GynecologistResponse)
async def search(
    district: str = Query(None),
    name: str = Query(None),
    telemedicine_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    _user=Depends(get_current_user),
):
    doctors = await search_gynecologists(district=district, name=name,
                                         telemedicine_only=telemedicine_only, limit=limit)
    cards = [_to_card(d) for d in doctors]
    return GynecologistResponse(
        doctors=cards,
        emergency_contacts=MATERNAL_EMERGENCY_CONTACTS,
        useful_links=MATERNAL_USEFUL_LINKS,
        total=len(cards),
        disclaimer=DISCLAIMER,
    )


@router.get("/telemedicine")
async def telemedicine(_user=Depends(get_current_user)):
    doctors = await get_telemedicine_gynecologists()
    cards = [_to_card(d) for d in doctors]
    return {"doctors": cards, "count": len(cards)}


@router.get("/emergency")
async def emergency(_user=Depends(get_current_user)):
    return {
        "emergency_contacts": MATERNAL_EMERGENCY_CONTACTS,
        "useful_links": MATERNAL_USEFUL_LINKS,
        "tips": [
            "Call 999 for life-threatening emergency",
            "Call 16767 for maternal health advice (DGHS, 24/7)",
            "For danger signs (bleeding, severe headache, no fetal movement) call 999",
            "Use SOS button in Shetu app to alert emergency contacts",
        ],
    }
