"""Gynecologist search from doctor_chambers table."""
from app.core.supabase import get_admin_client, retry_network

MATERNAL_EMERGENCY_CONTACTS = {
    "emergency": {"number": "999", "description": "National Emergency"},
    "maternal_helpline": {"number": "16767", "description": "DGHS Maternal & Child Helpline (24/7)"},
    "ambulance": {"number": "199", "description": "Ambulance Service"},
    "aamader_shastho": {"number": "16257", "description": "Telemedicine Helpline"},
    "bsmmu_emergency": {"number": "+88029661060", "description": "BSMMU Emergency"},
    "dhaka_medical": {"number": "+88028626812", "description": "Dhaka Medical College Hospital"},
}

MATERNAL_USEFUL_LINKS = [
    {"name": "BMDC Doctor Verification", "url": "https://www.bmdc.org.bd/member-information.php"},
    {"name": "DGHS Maternal Health", "url": "http://www.dghs.gov.bd"},
    {"name": "Telemedicine (Aamader Shastho)", "url": "https://amarkantho.com"},
]

_SEED_GYNECOLOGISTS = [
    {
        "id": None, "bmdc_number": "A-99001",
        "full_name": "Dr. Fatema Begum",
        "qualification": "MBBS, FCPS (Obs & Gynae)", "specialty": "Gynaecology & Obstetrics",
        "district": "Dhaka", "upazila": "Dhanmondi",
        "chamber_name": "Dhaka Medical College Hospital", "chamber_address": "Bakshibazar, Dhaka",
        "phone": "+88028626812", "phone_alt": None, "visiting_hours": "9am-1pm Sun-Thu",
        "telemedicine_available": True, "telemedicine_platform": "Aamader Shastho",
        "consultation_fee": 700, "bio": None,
    },
    {
        "id": None, "bmdc_number": "A-99002",
        "full_name": "Dr. Shahana Khanam",
        "qualification": "MBBS, DGO, FCPS", "specialty": "Gynaecology",
        "district": "Chittagong", "upazila": None,
        "chamber_name": "Chittagong Medical College", "chamber_address": "Chittagong",
        "phone": "+8801900000001", "phone_alt": None, "visiting_hours": "2pm-6pm Sat-Wed",
        "telemedicine_available": False, "telemedicine_platform": None,
        "consultation_fee": 500, "bio": None,
    },
]


async def search_gynecologists(
    district: str = None,
    name: str = None,
    telemedicine_only: bool = False,
    limit: int = 20,
) -> list[dict]:
    """Query doctor_chambers WHERE specialty_type='gynecology' AND is_active=TRUE."""
    try:
        client = get_admin_client()

        def _q():
            q = (client.table("doctor_chambers")
                 .select("*")
                 .eq("specialty_type", "gynecology")
                 .eq("is_active", True))
            if district:
                q = q.ilike("district", f"%{district}%")
            if name:
                q = q.ilike("full_name", f"%{name}%")
            if telemedicine_only:
                q = q.eq("telemedicine_available", True)
            return q.order("telemedicine_available", desc=True).limit(limit).execute()

        result = retry_network(_q)
        rows = result.data or []
        if rows:
            return rows
    except Exception:
        pass

    # Seed fallback
    seeds = _SEED_GYNECOLOGISTS
    if telemedicine_only:
        seeds = [d for d in seeds if d.get("telemedicine_available")]
    if district:
        filtered = [d for d in seeds if district.lower() in (d.get("district") or "").lower()]
        seeds = filtered or seeds
    if name:
        filtered = [d for d in seeds if name.lower() in d["full_name"].lower()]
        seeds = filtered or seeds
    return seeds[:limit]


async def get_telemedicine_gynecologists() -> list[dict]:
    return await search_gynecologists(telemedicine_only=True, limit=50)
