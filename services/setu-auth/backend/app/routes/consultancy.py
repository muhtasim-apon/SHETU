"""Doctor consultancy — BMDC search + telemedicine + emergency directory."""
from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.models.consultancy import ConsultancyResponse, DoctorCard
from app.services import bmdc_service

router = APIRouter(prefix="/api/v1/doctors", tags=["consultancy"])

DISCLAIMER = "Verify doctor credentials at bmdc.org.bd. BMDC data may not be real-time."


@router.get("/search", response_model=ConsultancyResponse)
async def search_doctors(specialty: str = Query("Medicine"), district: str = Query(None),
                         name: str = Query(None), limit: int = Query(20),
                         _user=Depends(get_current_user)):
    doctors, source = await bmdc_service.search_bmdc_doctors(specialty, district, name, limit)
    cards = [DoctorCard(**d) for d in doctors]
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
    doctors = await bmdc_service.get_fallback_doctors(specialty or "all", None, 50)
    tele = [DoctorCard(**d) for d in doctors if d.get("telemedicine_available")]
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
