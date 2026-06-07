from typing import Optional
from pydantic import BaseModel


class PregnancyReportRequest(BaseModel):
    period_type: str  # weekly|monthly|custom
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    language: str = 'en'


class PregnancyReportSummary(BaseModel):
    id: str
    period_type: str
    period_start: str
    period_end: str
    overall_risk_band: Optional[str]
    ai_summary: Optional[str]
    ai_summary_bn: Optional[str]
    ai_recommendations: Optional[list[str]]
    ai_alerts: Optional[list[str]]
    vitals_count: int = 0
    flagged_vitals_count: int = 0
    gestational_age_weeks: Optional[int]
    trimester: Optional[str]
    generated_by_model: Optional[str]
    created_at: Optional[str]
    pdf_available: bool = False
