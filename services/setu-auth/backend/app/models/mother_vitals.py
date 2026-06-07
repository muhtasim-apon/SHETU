from typing import Optional
from pydantic import BaseModel


class MaternalVitalCreate(BaseModel):
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    weight_kg: Optional[float] = None
    pulse_bpm: Optional[int] = None
    temperature_c: Optional[float] = None
    urine_protein: Optional[str] = None
    urine_glucose_positive: Optional[bool] = None
    hemoglobin: Optional[float] = None
    blood_glucose_fasting: Optional[float] = None
    blood_glucose_1hr: Optional[float] = None
    blood_glucose_2hr: Optional[float] = None
    hep_b_surface_antigen: Optional[bool] = None
    hiv_positive: Optional[bool] = None
    vdrl_positive: Optional[bool] = None
    fetal_heart_rate: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    respiratory_rate: Optional[int] = None
    pregnancy_id: Optional[str] = None


class MaternalVitalResponse(BaseModel):
    id: str
    recorded_at: Optional[str]
    systolic_bp: Optional[int]
    diastolic_bp: Optional[int]
    weight_kg: Optional[float]
    pulse_bpm: Optional[int]
    temperature_c: Optional[float]
    urine_protein: Optional[str]
    hemoglobin: Optional[float]
    blood_glucose_fasting: Optional[float]
    fetal_heart_rate: Optional[int]
    oxygen_saturation: Optional[float]
    has_flags: bool = False
    flag_details: Optional[list] = None
    source: str = "manual"
