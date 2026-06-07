from typing import Optional
from pydantic import BaseModel


class GynecologistCard(BaseModel):
    id: Optional[str]
    bmdc_number: Optional[str]
    full_name: str
    qualification: Optional[str]
    specialty: str
    district: Optional[str]
    upazila: Optional[str]
    chamber_name: Optional[str]
    chamber_address: Optional[str]
    phone: Optional[str]
    phone_alt: Optional[str]
    visiting_hours: Optional[str]
    telemedicine_available: bool = False
    telemedicine_platform: Optional[str]
    consultation_fee: Optional[int]
    bio: Optional[str]


class GynecologistResponse(BaseModel):
    doctors: list[GynecologistCard]
    emergency_contacts: dict
    useful_links: list
    total: int
    disclaimer: str
