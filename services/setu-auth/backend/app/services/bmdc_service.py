"""BMDC doctor search with Supabase fallback + emergency directory."""
import logging

import httpx
from bs4 import BeautifulSoup

from app.core.supabase import get_admin_client, retry_network

logger = logging.getLogger(__name__)

BMDC_URL = "https://www.bmdc.org.bd/member-information.php"

SPECIALTIES_MAP = {
    "general": "General Practice",
    "medicine": "Internal Medicine",
    "cardiology": "Cardiology",
    "diabetes": "Endocrinology",
    "ortho": "Orthopaedics",
    "neuro": "Neurology",
    "gastro": "Gastroenterology",
    "derma": "Dermatology",
    "psychiatry": "Psychiatry",
    "ent": "ENT",
    "ophthalmology": "Ophthalmology",
}

SPECIALTIES_BN = {
    "general": "সাধারণ চিকিৎসা",
    "medicine": "ইন্টারনাল মেডিসিন",
    "cardiology": "হৃদরোগ",
    "diabetes": "ডায়াবেটিস ও এন্ডোক্রাইন",
    "ortho": "অর্থোপেডিক্স",
    "neuro": "নিউরোলজি",
    "gastro": "গ্যাস্ট্রোএন্টারোলজি",
    "derma": "চর্মরোগ",
    "psychiatry": "মানসিক স্বাস্থ্য",
    "ent": "নাক-কান-গলা",
    "ophthalmology": "চক্ষু",
}

EMERGENCY_CONTACTS = {
    "emergency": {"number": "999", "description": "National Emergency"},
    "health_helpline": {"number": "16767", "description": "DGHS Health Helpline (24/7)"},
    "ambulance": {"number": "199", "description": "Ambulance Service"},
    "aamader_shastho": {"number": "16257", "description": "Telemedicine Helpline"},
    "bsmmu": {"number": "+88029661060", "description": "BSMMU Emergency"},
    "dhaka_medical": {"number": "+88028626812", "description": "Dhaka Medical College Hospital"},
    "mental_health": {"number": "16789", "description": "Mental Health Helpline (Kaan Pete Roi)"},
}

USEFUL_LINKS = [
    {"name": "BMDC Doctor Search", "url": "https://www.bmdc.org.bd/member-information.php"},
    {"name": "DGHS Health Services", "url": "http://www.dghs.gov.bd"},
    {"name": "Telemedicine (Aamader Shastho)", "url": "https://amarkantho.com"},
    {"name": "National Heart Foundation", "url": "https://www.nhf.org.bd"},
    {"name": "Diabetic Association of Bangladesh", "url": "https://www.badas.org.bd"},
]

# Seed directory used when both BMDC and Supabase return nothing.
_SEED_DOCTORS = [
    {"bmdc_number": "A-12345", "full_name": "Dr. Rahima Akter",
     "qualification": "MBBS, FCPS (Medicine)", "specialty": "Internal Medicine",
     "district": "Dhaka", "facility_name": "Dhaka Medical College Hospital",
     "facility_address": "Bakshibazar, Dhaka", "phone": "+88028626812",
     "telemedicine_available": True, "available_hours": [], "bio": None,
     "source": "seed", "id": None},
    {"bmdc_number": "A-23456", "full_name": "Dr. Imran Hossain",
     "qualification": "MBBS, MD (Cardiology)", "specialty": "Cardiology",
     "district": "Dhaka", "facility_name": "National Heart Foundation",
     "facility_address": "Mirpur, Dhaka", "phone": "+8801700000000",
     "telemedicine_available": False, "available_hours": [], "bio": None,
     "source": "seed", "id": None},
    {"bmdc_number": "A-34567", "full_name": "Dr. Nusrat Jahan",
     "qualification": "MBBS, BCS (Health)", "specialty": "General Practice",
     "district": "Chittagong", "facility_name": "Chittagong Medical College",
     "facility_address": "Chittagong", "phone": "+8801800000000",
     "telemedicine_available": True, "available_hours": [], "bio": None,
     "source": "seed", "id": None},
]


def _normalise_specialty(specialty: str) -> str:
    key = (specialty or "").strip().lower()
    return SPECIALTIES_MAP.get(key, specialty or "Medicine")


async def get_fallback_doctors(specialty: str, district: str, limit: int) -> list[dict]:
    """Query Supabase clinicians joined with profiles + facilities."""
    try:
        client = get_admin_client()

        def _q():
            sel = (
                "id, bmdc_number, specialty, bio, telemedicine_available, "
                "available_hours, profiles(full_name), "
                "facilities(facility_name, district, address, phone)"
            )
            query = client.table("clinicians").select(sel)
            if specialty and specialty.lower() != "all":
                query = query.ilike("specialty", f"%{specialty}%")
            return query.limit(limit).execute()

        result = retry_network(_q)
        rows = result.data or []
        doctors = []
        for r in rows:
            prof = r.get("profiles") or {}
            fac = r.get("facilities") or {}
            fac_district = fac.get("district")
            if district and fac_district and district.lower() not in (fac_district or "").lower():
                continue
            doctors.append({
                "id": r.get("id"),
                "bmdc_number": r.get("bmdc_number"),
                "full_name": prof.get("full_name") or "Unknown Doctor",
                "qualification": None,
                "specialty": r.get("specialty") or specialty,
                "district": fac_district,
                "facility_name": fac.get("facility_name"),
                "facility_address": fac.get("address"),
                "phone": fac.get("phone"),
                "telemedicine_available": bool(r.get("telemedicine_available")),
                "available_hours": r.get("available_hours") or [],
                "bio": r.get("bio"),
                "source": "supabase",
            })
        # Sort: telemedicine first.
        doctors.sort(key=lambda d: (not d["telemedicine_available"], d.get("district") or ""))
        if doctors:
            return doctors[:limit]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Supabase clinician fallback failed: %s", exc)

    # Final seed fallback, filtered loosely by specialty/district.
    seeds = _SEED_DOCTORS
    if specialty and specialty.lower() != "all":
        s = specialty.lower()
        filtered = [d for d in seeds if s in d["specialty"].lower()]
        seeds = filtered or seeds
    if district:
        d = district.lower()
        filtered = [x for x in seeds if d in (x["district"] or "").lower()]
        seeds = filtered or seeds
    return seeds[:limit]


async def search_bmdc_doctors(
    specialty: str = "Medicine",
    district: str = None,
    name: str = None,
    limit: int = 20,
) -> tuple[list[dict], str]:
    """Try BMDC live scrape; fall back to Supabase/seed. Returns (doctors, source)."""
    spec_full = _normalise_specialty(specialty)
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.post(
                BMDC_URL,
                data={"specialty": spec_full, "district": district or "", "name": name or ""},
            )
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            table = soup.find("table")
            doctors = []
            if table:
                rows = table.find_all("tr")[1:]
                for row in rows[:limit]:
                    cols = [c.get_text(strip=True) for c in row.find_all("td")]
                    if len(cols) < 2:
                        continue
                    doctors.append({
                        "id": None,
                        "bmdc_number": cols[0] if len(cols) > 0 else None,
                        "full_name": cols[1] if len(cols) > 1 else "Unknown",
                        "qualification": cols[2] if len(cols) > 2 else None,
                        "specialty": spec_full,
                        "district": district,
                        "facility_name": None,
                        "facility_address": None,
                        "phone": None,
                        "telemedicine_available": False,
                        "available_hours": [],
                        "bio": None,
                        "source": "bmdc_live",
                    })
            if doctors:
                return doctors, "bmdc_live"
            logger.warning("BMDC returned no parseable rows; using fallback.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("BMDC live search failed (%s); using fallback.", exc)

    fallback = await get_fallback_doctors(spec_full, district, limit)
    return fallback, "local_fallback"
