"""Doctor consultancy — doctor_chambers primary + emergency directory."""
from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.models.consultancy import ConsultancyResponse, DoctorCard
from app.services import bmdc_service

router = APIRouter(prefix="/api/v1/doctors", tags=["consultancy"])

DISCLAIMER = "Verify doctor credentials at bmdc.org.bd. BMDC data may not be real-time."


def _to_card(d: dict) -> DoctorCard:
    return DoctorCard(
        id=str(d["id"]) if d.get("id") else None,
        bmdc_number=d.get("bmdc_number"),
        full_name=d.get("full_name", "Unknown Doctor"),
        qualification=d.get("qualification"),
        specialty=d.get("specialty", "General"),
        district=d.get("district"),
        upazila=d.get("upazila"),
        chamber_name=d.get("chamber_name"),
        chamber_address=d.get("chamber_address"),
        visiting_hours=d.get("visiting_hours"),
        consultation_fee=d.get("consultation_fee"),
        telemedicine_platform=d.get("telemedicine_platform"),
        facility_name=d.get("facility_name"),
        facility_address=d.get("facility_address"),
        available_hours=d.get("available_hours") or [],
        phone=d.get("phone"),
        phone_alt=d.get("phone_alt"),
        telemedicine_available=bool(d.get("telemedicine_available", False)),
        bio=d.get("bio"),
        source=d.get("source", "supabase"),
    )


@router.get("/search", response_model=ConsultancyResponse)
async def search_doctors(
    specialty: str = Query("Medicine"),
    district: str = Query(None),
    name: str = Query(None),
    limit: int = Query(20),
    _user=Depends(get_current_user),
):
    doctors, source = await bmdc_service.search_bmdc_doctors(specialty, district, name, limit)
    cards = [_to_card(d) for d in doctors]
    return ConsultancyResponse(
        doctors=cards,
        emergency_contacts=bmdc_service.EMERGENCY_CONTACTS,
        useful_links=bmdc_service.USEFUL_LINKS,
        total=len(cards),
        source=source,
        disclaimer=DISCLAIMER,
    )


@router.get("/specialties")
async def specialties(_user=Depends(get_current_user)):
    out = []
    for key, label_en in bmdc_service.SPECIALTIES_MAP.items():
        out.append({
            "key": key,
            "label_en": label_en,
            "label_bn": bmdc_service.SPECIALTIES_BN.get(key, label_en),
        })
    return {"specialties": out}


@router.get("/telemedicine")
async def telemedicine(specialty: str = Query(""), _user=Depends(get_current_user)):
    doctors = await bmdc_service.get_patient_doctors(
        specialty=specialty or None, limit=50
    )
    tele = [_to_card(d) for d in doctors if d.get("telemedicine_available")]
    return {"doctors": tele, "count": len(tele)}


@router.get("/emergency")
async def emergency(_user=Depends(get_current_user)):
    return {
        "emergency_contacts": bmdc_service.EMERGENCY_CONTACTS,
        "useful_links": bmdc_service.USEFUL_LINKS,
        "tips": [
            "Call 999 for any life-threatening emergency",
            "Call 16767 for general health queries (DGHS helpline, available 24/7)",
            "Call 16257 for telemedicine consultation",
            "For mental health support call 16789 (Kaan Pete Roi)",
        ],
    }
