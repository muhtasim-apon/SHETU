"""Pydantic models for report generation."""
from typing import Optional

from pydantic import BaseModel


class ReportRequest(BaseModel):
    period_type: str = "monthly"  # 'weekly' | 'monthly' | 'custom'
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    language: str = "en"


class ReportSummary(BaseModel):
    id: str
    period_type: str
    period_start: str
    period_end: str
    overall_risk_band: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_summary_bn: Optional[str] = None
    ai_recommendations: Optional[list[str]] = None
    ai_alerts: Optional[list[str]] = None
    vitals_count: int = 0
    flagged_vitals_count: int = 0
    checkins_count: int = 0
    avg_energy_level: Optional[float] = None
    avg_sleep_hours: Optional[float] = None
    generated_by_model: Optional[str] = None
    created_at: Optional[str] = None
    pdf_available: bool = False
