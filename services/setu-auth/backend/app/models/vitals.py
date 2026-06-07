"""Pydantic models for health profile + vitals."""
from typing import Optional

from pydantic import BaseModel


class ProfileCreate(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    blood_group: Optional[str] = None
    activity_level: Optional[str] = None
    is_smoker: bool = False
    is_diabetic: bool = False
    is_hypertensive: bool = False
    has_heart_disease: bool = False
    has_kidney_disease: bool = False
    other_conditions: Optional[list[str]] = []
    known_allergies: Optional[list[str]] = []
    current_medications: Optional[list[str]] = []
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    daily_step_target: int = 8000
    daily_water_ml: int = 2000
    sleep_target_hours: float = 7.5


class ProfileUpdate(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    blood_group: Optional[str] = None
    activity_level: Optional[str] = None
    is_smoker: Optional[bool] = None
    is_diabetic: Optional[bool] = None
    is_hypertensive: Optional[bool] = None
    has_heart_disease: Optional[bool] = None
    has_kidney_disease: Optional[bool] = None
    other_conditions: Optional[list[str]] = None
    known_allergies: Optional[list[str]] = None
    current_medications: Optional[list[str]] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    daily_step_target: Optional[int] = None
    daily_water_ml: Optional[int] = None
    sleep_target_hours: Optional[float] = None


class ProfileResponse(ProfileCreate):
    id: str
    patient_id: str
    bmi: Optional[float] = None
    profile_complete: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class VitalCreate(BaseModel):
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    pulse_bpm: Optional[int] = None
    temperature_c: Optional[float] = None
    respiratory_rate: Optional[int] = None
    weight_kg: Optional[float] = None
    notes: Optional[str] = None


class VitalResponse(BaseModel):
    id: str
    recorded_at: Optional[str] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    pulse_bpm: Optional[int] = None
    temperature_c: Optional[float] = None
    respiratory_rate: Optional[int] = None
    weight_kg: Optional[float] = None
    has_flags: bool = False
    flag_details: Optional[list] = None
    source: str = "manual"
