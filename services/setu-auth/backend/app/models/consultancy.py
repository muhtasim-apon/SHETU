"""Pydantic models for doctor consultancy."""
from typing import Optional

from pydantic import BaseModel


class DoctorCard(BaseModel):
    id: Optional[str] = None
    bmdc_number: Optional[str] = None
    full_name: str
    qualification: Optional[str] = None
    specialty: str
    district: Optional[str] = None
    upazila: Optional[str] = None
    # doctor_chambers fields
    chamber_name: Optional[str] = None
    chamber_address: Optional[str] = None
    visiting_hours: Optional[str] = None
    consultation_fee: Optional[int] = None
    telemedicine_platform: Optional[str] = None
    # legacy clinicians fields
    facility_name: Optional[str] = None
    facility_address: Optional[str] = None
    available_hours: Optional[list] = None
    phone: Optional[str] = None
    phone_alt: Optional[str] = None
    telemedicine_available: bool = False
    bio: Optional[str] = None
    source: str = "supabase"


class ConsultancyResponse(BaseModel):
    doctors: list[DoctorCard]
    emergency_contacts: dict
    useful_links: list[dict]
    total: int
    source: str
    disclaimer: str
