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
    facility_name: Optional[str] = None
    facility_address: Optional[str] = None
    phone: Optional[str] = None
    telemedicine_available: bool = False
    available_hours: Optional[list] = None
    bio: Optional[str] = None
    source: str = "supabase"


class ConsultancyResponse(BaseModel):
    doctors: list[DoctorCard]
    emergency_contacts: dict
    useful_links: list[dict]
    total: int
    source: str
    disclaimer: str
