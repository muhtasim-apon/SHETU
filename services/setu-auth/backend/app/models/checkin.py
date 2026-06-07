"""Pydantic models for the daily wellness check-in."""
from typing import Optional

from pydantic import BaseModel


class CheckinCreate(BaseModel):
    overall_feeling: Optional[str] = None
    energy_level: Optional[int] = None
    pain_level: Optional[int] = None
    stress_level: Optional[int] = None
    mood_notes: Optional[str] = None
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None
    steps_today: Optional[int] = None
    exercise_minutes: Optional[int] = None
    water_intake_ml: Optional[int] = None
    had_headache: bool = False
    had_fever: bool = False
    had_nausea: bool = False
    had_chest_pain: bool = False
    had_dizziness: bool = False
    other_symptoms: Optional[list[str]] = []
    notes: Optional[str] = None


class CheckinResponse(CheckinCreate):
    id: str
    patient_id: str
    checkin_date: str
    goal_progress: Optional[dict] = None
    warning: Optional[str] = None
    created_at: Optional[str] = None
