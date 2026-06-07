"""Vital flag detection rules for the general patient role."""
from typing import Optional

from pydantic import BaseModel


class FlagDetail(BaseModel):
    type: str
    severity: str  # 'mild' | 'moderate' | 'severe' | 'elevated'
    message: str
    value: Optional[float] = None
    normal_range: str = ""


def detect_flags(vitals: dict, health_profile: Optional[dict] = None) -> list[FlagDetail]:
    """Detect clinical flags from a vitals dict, adjusting for known conditions."""
    flags: list[FlagDetail] = []

    # ── Blood Pressure ──────────────────────────────────────────────────────
    sys = vitals.get("systolic_bp")
    dia = vitals.get("diastolic_bp")
    if sys and dia:
        if sys >= 180 or dia >= 120:
            flags.append(FlagDetail(
                type="hypertensive_crisis", severity="severe",
                message="Hypertensive crisis. Seek emergency care immediately.",
                value=sys, normal_range="<120/80 mmHg",
            ))
        elif sys >= 140 or dia >= 90:
            flags.append(FlagDetail(
                type="high_bp", severity="elevated",
                message="Blood pressure is high (Stage 2). Contact your doctor.",
                value=sys, normal_range="<130/80 mmHg",
            ))
        elif sys >= 130 or dia >= 80:
            flags.append(FlagDetail(
                type="elevated_bp", severity="mild",
                message="Blood pressure is slightly elevated (Stage 1). Monitor regularly.",
                value=sys, normal_range="<130/80 mmHg",
            ))
        elif sys < 90 or dia < 60:
            flags.append(FlagDetail(
                type="low_bp", severity="moderate",
                message="Blood pressure is low. Stay hydrated and rest.",
                value=sys, normal_range="90-120 / 60-80 mmHg",
            ))

    # ── Oxygen Saturation (SpO2) ──────────────────────────────────────────────
    spo2 = vitals.get("oxygen_saturation")
    if spo2:
        if spo2 < 90:
            flags.append(FlagDetail(
                type="critical_low_spo2", severity="severe",
                message="Critically low oxygen saturation. Seek emergency care immediately.",
                value=spo2, normal_range="95-100%",
            ))
        elif spo2 < 94:
            flags.append(FlagDetail(
                type="low_spo2", severity="moderate",
                message="Low oxygen saturation. Rest, avoid exertion, see a doctor if persistent.",
                value=spo2, normal_range="95-100%",
            ))
        elif spo2 < 96:
            flags.append(FlagDetail(
                type="borderline_spo2", severity="mild",
                message="Oxygen saturation slightly below optimal. Monitor closely.",
                value=spo2, normal_range="95-100%",
            ))

    # ── Heart Rate / Pulse ────────────────────────────────────────────────────
    pulse = vitals.get("pulse_bpm")
    if pulse:
        is_athlete = bool(health_profile and health_profile.get("activity_level") == "athlete")
        lower = 40 if is_athlete else 50
        if pulse > 120:
            flags.append(FlagDetail(
                type="tachycardia", severity="moderate",
                message="Pulse rate is high (tachycardia). Rest and consult a doctor.",
                value=pulse, normal_range="60-100 bpm",
            ))
        elif pulse > 100:
            flags.append(FlagDetail(
                type="elevated_pulse", severity="mild",
                message="Pulse rate is mildly elevated. Rest and monitor.",
                value=pulse, normal_range="60-100 bpm",
            ))
        elif pulse < lower:
            flags.append(FlagDetail(
                type="bradycardia", severity="moderate",
                message="Pulse rate is low (bradycardia). Consult your doctor.",
                value=pulse, normal_range="60-100 bpm",
            ))

    # ── Temperature ──────────────────────────────────────────────────────────
    temp = vitals.get("temperature_c")
    if temp:
        if temp >= 40.0:
            flags.append(FlagDetail(
                type="high_fever", severity="severe",
                message="Very high fever. Seek immediate medical attention.",
                value=temp, normal_range="36.1-37.2°C",
            ))
        elif temp >= 38.0:
            flags.append(FlagDetail(
                type="fever", severity="moderate",
                message="Fever detected. Rest, stay hydrated, take prescribed medication.",
                value=temp, normal_range="36.1-37.2°C",
            ))
        elif temp < 35.5:
            flags.append(FlagDetail(
                type="hypothermia", severity="moderate",
                message="Body temperature is low (hypothermia). Warm up and seek care.",
                value=temp, normal_range="36.1-37.2°C",
            ))

    # ── Weight change ──────────────────────────────────────────────────────────
    weight_change = vitals.get("weight_change_kg")
    if weight_change:
        if abs(weight_change) > 5:
            flags.append(FlagDetail(
                type="significant_weight_change", severity="mild",
                message=f"Weight changed by {weight_change:+.1f}kg recently. Consult if unintentional.",
                value=weight_change, normal_range="<2kg change per month",
            ))

    return flags


def worst_severity(flags: list[FlagDetail]) -> str:
    """Return the highest severity across flags ('' if none)."""
    order = {"mild": 1, "elevated": 2, "moderate": 2, "severe": 3}
    if not flags:
        return ""
    return max(flags, key=lambda f: order.get(f.severity, 0)).severity
