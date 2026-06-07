"""BMDC doctor search — doctor_chambers primary, legacy clinicians fallback, seed last."""
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

_GYNECOLOGY_TERMS = {"gynaecology", "gynaecology & obstetrics", "ob-gyn", "gynecology", "obstetrics"}

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

_SEED_DOCTORS = [
    {
        "id": None, "bmdc_number": "A-12345", "full_name": "Dr. Rahima Akter",
        "qualification": "MBBS, FCPS (Medicine)", "specialty": "Internal Medicine",
        "specialty_type": "medicine",
        "district": "Dhaka", "upazila": None,
        "chamber_name": "Dhaka Medical College Hospital", "chamber_address": "Bakshibazar, Dhaka",
        "phone": "+88028626812", "phone_alt": None, "visiting_hours": "9am-2pm",
        "telemedicine_available": True, "telemedicine_platform": "Aamader Shastho",
        "consultation_fee": 500, "bio": None, "source": "seed",
        "facility_name": "Dhaka Medical College Hospital", "facility_address": "Bakshibazar, Dhaka",
        "available_hours": [],
    },
    {
        "id": None, "bmdc_number": "A-23456", "full_name": "Dr. Imran Hossain",
        "qualification": "MBBS, MD (Cardiology)", "specialty": "Cardiology",
        "specialty_type": "cardiology",
        "district": "Dhaka", "upazila": None,
        "chamber_name": "National Heart Foundation", "chamber_address": "Mirpur, Dhaka",
        "phone": "+8801700000000", "phone_alt": None, "visiting_hours": "4pm-8pm",
        "telemedicine_available": False, "telemedicine_platform": None,
        "consultation_fee": 800, "bio": None, "source": "seed",
        "facility_name": "National Heart Foundation", "facility_address": "Mirpur, Dhaka",
        "available_hours": [],
    },
    {
        "id": None, "bmdc_number": "A-34567", "full_name": "Dr. Nusrat Jahan",
        "qualification": "MBBS, BCS (Health)", "specialty": "General Practice",
        "specialty_type": "general",
        "district": "Chittagong", "upazila": None,
        "chamber_name": "Chittagong Medical College", "chamber_address": "Chittagong",
        "phone": "+8801800000000", "phone_alt": None, "visiting_hours": "8am-1pm",
        "telemedicine_available": True, "telemedicine_platform": None,
        "consultation_fee": 300, "bio": None, "source": "seed",
        "facility_name": "Chittagong Medical College", "facility_address": "Chittagong",
        "available_hours": [],
    },
]


def _normalise_specialty(specialty: str) -> str:
    key = (specialty or "").strip().lower()
    return SPECIALTIES_MAP.get(key, specialty or "Medicine")


def _chamber_to_card(r: dict) -> dict:
    """Normalise a doctor_chambers row into a DoctorCard-compatible dict."""
    return {
        "id": str(r["id"]) if r.get("id") else None,
        "bmdc_number": r.get("bmdc_number"),
        "full_name": r.get("full_name", "Unknown Doctor"),
        "qualification": r.get("qualification"),
        "specialty": r.get("specialty", r.get("specialty_type", "General")),
        "district": r.get("district"),
        "upazila": r.get("upazila"),
        "chamber_name": r.get("chamber_name"),
        "chamber_address": r.get("chamber_address"),
        "visiting_hours": r.get("visiting_hours"),
        "consultation_fee": r.get("consultation_fee"),
        "telemedicine_platform": r.get("telemedicine_platform"),
        "phone": r.get("phone"),
        "phone_alt": r.get("phone_alt"),
        "telemedicine_available": bool(r.get("telemedicine_available", False)),
        "bio": r.get("bio"),
        "source": "doctor_chambers",
        # Legacy compat fields
        "facility_name": r.get("chamber_name"),
        "facility_address": r.get("chamber_address"),
        "available_hours": [],
    }


async def get_patient_doctors(
    specialty: str = None,
    district: str = None,
    name: str = None,
    limit: int = 20,
) -> list[dict]:
    """Query doctor_chambers WHERE specialty_type != 'gynecology' AND is_active = TRUE."""
    try:
        client = get_admin_client()

        def _q():
            q = (client.table("doctor_chambers")
                 .select("*")
                 .neq("specialty_type", "gynecology")
                 .eq("is_active", True))
            if specialty and specialty.lower() not in ("all", "medicine", ""):
                q = q.ilike("specialty", f"%{specialty}%")
            if district:
                q = q.ilike("district", f"%{district}%")
            if name:
                q = q.ilike("full_name", f"%{name}%")
            return q.order("telemedicine_available", desc=True).limit(limit).execute()

        result = retry_network(_q)
        rows = result.data or []
        if rows:
            return [_chamber_to_card(r) for r in rows]
    except Exception as exc:
        logger.warning("doctor_chambers patient query failed: %s", exc)

    # Legacy clinicians table fallback
    try:
        client = get_admin_client()

        def _q2():
            sel = (
                "id, bmdc_number, specialty, bio, telemedicine_available, "
                "available_hours, profiles(full_name), "
                "facilities(facility_name, district, address, phone)"
            )
            q = client.table("clinicians").select(sel)
            if specialty and specialty.lower() not in ("all", ""):
                q = q.ilike("specialty", f"%{specialty}%")
            return q.limit(limit).execute()

        result = retry_network(_q2)
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
                "specialty": r.get("specialty") or specialty or "Medicine",
                "district": fac_district,
                "upazila": None,
                "chamber_name": fac.get("facility_name"),
                "chamber_address": fac.get("address"),
                "visiting_hours": None,
                "consultation_fee": None,
                "telemedicine_platform": None,
                "phone": fac.get("phone"),
                "phone_alt": None,
                "telemedicine_available": bool(r.get("telemedicine_available")),
                "bio": r.get("bio"),
                "source": "clinicians",
                "facility_name": fac.get("facility_name"),
                "facility_address": fac.get("address"),
                "available_hours": r.get("available_hours") or [],
            })
        doctors.sort(key=lambda d: (not d["telemedicine_available"], d.get("district") or ""))
        if doctors:
            return doctors[:limit]
    except Exception as exc:
        logger.warning("Clinicians fallback failed: %s", exc)

    # Seed fallback
    seeds = [d for d in _SEED_DOCTORS if d.get("specialty_type", "") not in _GYNECOLOGY_TERMS]
    if specialty and specialty.lower() not in ("all", ""):
        s = specialty.lower()
        filtered = [d for d in seeds if s in d["specialty"].lower()]
        seeds = filtered or seeds
    if district:
        d_lower = district.lower()
        filtered = [x for x in seeds if d_lower in (x.get("district") or "").lower()]
        seeds = filtered or seeds
    return seeds[:limit]


async def get_fallback_doctors(specialty: str, district: str, limit: int) -> list[dict]:
    """Legacy wrapper — now delegates to get_patient_doctors."""
    return await get_patient_doctors(specialty=specialty, district=district, limit=limit)


async def search_bmdc_doctors(
    specialty: str = "Medicine",
    district: str = None,
    name: str = None,
    limit: int = 20,
) -> tuple[list[dict], str]:
    """doctor_chambers primary → BMDC live scrape → seed. Returns (doctors, source)."""
    # 1. Try doctor_chambers first (our curated DB)
    try:
        patient_docs = await get_patient_doctors(specialty, district, name, limit)
        if patient_docs:
            return patient_docs, "doctor_chambers"
    except Exception as exc:
        logger.warning("doctor_chambers lookup failed: %s", exc)

    # 2. Try BMDC live scrape
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
                        "upazila": None,
                        "chamber_name": None,
                        "chamber_address": None,
                        "visiting_hours": None,
                        "consultation_fee": None,
                        "telemedicine_platform": None,
                        "phone": None,
                        "phone_alt": None,
                        "telemedicine_available": False,
                        "bio": None,
                        "source": "bmdc_live",
                        "facility_name": None,
                        "facility_address": None,
                        "available_hours": [],
                    })
            if doctors:
                return doctors, "bmdc_live"
            logger.warning("BMDC returned no parseable rows; using seed.")
    except Exception as exc:
        logger.warning("BMDC live search failed (%s); using seed.", exc)

    # 3. Seed fallback
    seeds = [d for d in _SEED_DOCTORS if d.get("specialty_type", "") not in _GYNECOLOGY_TERMS]
    return seeds[:limit], "seed"
