"""AI-powered health report generation + PDF."""
import os
from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import get_health_profile, get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.report import ReportRequest, ReportSummary
from app.services import gemini_service, pdf_service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _resolve_period(body: ReportRequest):
    today = date.today()
    if body.period_type == "weekly":
        return today - timedelta(days=7), today
    if body.period_type == "monthly":
        return today - timedelta(days=30), today
    if body.period_type == "custom":
        if not body.period_start or not body.period_end:
            raise HTTPException(status_code=422, detail="Custom period requires start and end dates.")
        start = datetime.fromisoformat(body.period_start[:10]).date()
        end = datetime.fromisoformat(body.period_end[:10]).date()
        if (end - start).days > 90:
            raise HTTPException(status_code=422, detail="Custom range cannot exceed 90 days.")
        if end < start:
            raise HTTPException(status_code=422, detail="period_end must be after period_start.")
        return start, end
    raise HTTPException(status_code=422, detail="Invalid period_type.")


def _avg(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def _min(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    return min(vals) if vals else None


def _max(rows, key):
    vals = [r[key] for r in rows if r.get(key) is not None]
    return max(vals) if vals else None


def _aggregate_vitals(rows):
    weights = [r["weight_kg"] for r in sorted(rows, key=lambda x: x.get("recorded_at") or "")
               if r.get("weight_kg") is not None]
    weight_change = round(weights[-1] - weights[0], 1) if len(weights) >= 2 else None
    flag_counter = Counter()
    flagged = 0
    for r in rows:
        if r.get("has_flags"):
            flagged += 1
            for f in (r.get("flag_details") or []):
                flag_counter[f.get("type", "unknown")] += 1
    return {
        "vitals_count": len(rows),
        "avg_systolic_bp": _avg(rows, "systolic_bp"),
        "avg_diastolic_bp": _avg(rows, "diastolic_bp"),
        "min_systolic_bp": _min(rows, "systolic_bp"),
        "max_systolic_bp": _max(rows, "systolic_bp"),
        "min_diastolic_bp": _min(rows, "diastolic_bp"),
        "max_diastolic_bp": _max(rows, "diastolic_bp"),
        "avg_pulse_bpm": _avg(rows, "pulse_bpm"),
        "min_pulse_bpm": _min(rows, "pulse_bpm"),
        "max_pulse_bpm": _max(rows, "pulse_bpm"),
        "avg_temperature_c": _avg(rows, "temperature_c"),
        "avg_weight_kg": _avg(rows, "weight_kg"),
        "weight_change_kg": weight_change,
        "avg_spo2": _avg(rows, "oxygen_saturation"),
        "flagged_vitals_count": flagged,
        "flags_breakdown": dict(flag_counter),
    }


def _aggregate_checkins(rows):
    def avg(key):
        return _avg(rows, key)

    def total(key):
        return sum(r[key] for r in rows if r.get(key) is not None)

    return {
        "checkins_count": len(rows),
        "avg_energy_level": avg("energy_level"),
        "avg_pain_level": avg("pain_level"),
        "avg_sleep_hours": avg("sleep_hours"),
        "total_exercise_minutes": total("exercise_minutes"),
        "total_steps": total("steps_today"),
        "symptom_days": {
            "headache": sum(1 for r in rows if r.get("had_headache")),
            "fever": sum(1 for r in rows if r.get("had_fever")),
            "nausea": sum(1 for r in rows if r.get("had_nausea")),
            "chest_pain": sum(1 for r in rows if r.get("had_chest_pain")),
        },
    }


def _patient_context(patient, profile, full_name):
    chronic = []
    if profile:
        if profile.get("is_diabetic"):
            chronic.append("Diabetes")
        if profile.get("is_hypertensive"):
            chronic.append("Hypertension")
        if profile.get("has_heart_disease"):
            chronic.append("Heart Disease")
        if profile.get("has_kidney_disease"):
            chronic.append("Kidney Disease")
        chronic.extend(profile.get("other_conditions") or [])
    return {
        "full_name": full_name,
        "blood_group": (profile or {}).get("blood_group"),
        "bmi": (profile or {}).get("bmi"),
        "activity_level": (profile or {}).get("activity_level"),
        "chronic_conditions": chronic,
        "is_smoker": bool((profile or {}).get("is_smoker")),
    }


def _shape_summary(row: dict, pdf_available: bool, extra: dict | None = None) -> ReportSummary:
    merged = {**(extra or {}), **row}  # row wins over extra for DB-stored fields
    return ReportSummary(
        id=row["id"],
        period_type=row.get("period_type"),
        period_start=str(row.get("period_start")),
        period_end=str(row.get("period_end")),
        overall_risk_band=row.get("overall_risk_band"),
        ai_summary=row.get("ai_summary"),
        ai_summary_bn=row.get("ai_summary_bn"),
        ai_recommendations=row.get("ai_recommendations"),
        ai_alerts=row.get("ai_alerts"),
        vitals_count=merged.get("vitals_count") or 0,
        flagged_vitals_count=merged.get("flagged_vitals_count") or 0,
        checkins_count=merged.get("checkins_count") or 0,
        avg_energy_level=merged.get("avg_energy_level"),
        avg_sleep_hours=merged.get("avg_sleep_hours"),
        generated_by_model=row.get("generated_by_model"),
        created_at=str(row.get("created_at")) if row.get("created_at") else None,
        pdf_available=pdf_available,
    )


def _pdf_path(patient_code, start, end):
    os.makedirs(settings.REPORT_STORAGE_PATH, exist_ok=True)
    fname = f"{patient_code or 'patient'}_{start}_{end}.pdf"
    return os.path.join(settings.REPORT_STORAGE_PATH, fname)


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_report(body: ReportRequest, patient=Depends(get_patient),
                          profile=Depends(get_health_profile)):
    client = get_admin_client()
    start, end = _resolve_period(body)
    days = max(1, (end - start).days)

    start_iso = start.isoformat()
    end_iso = (end + timedelta(days=1)).isoformat()

    vitals_rows = (retry_network(
        lambda: client.table("vitals").select("*").eq("patient_id", patient["id"])
        .gte("recorded_at", start_iso).lt("recorded_at", end_iso).execute()
    ).data) or []
    checkin_rows = (retry_network(
        lambda: client.table("daily_health_checkins").select("*").eq("patient_id", patient["id"])
        .gte("checkin_date", start.isoformat()).lte("checkin_date", end.isoformat()).execute()
    ).data) or []
    goal_rows = (retry_network(
        lambda: client.table("health_goals").select("*").eq("patient_id", patient["id"])
        .eq("is_active", True).execute()
    ).data) or []

    v_agg = _aggregate_vitals(vitals_rows)
    v_agg["days"] = days
    c_agg = _aggregate_checkins(checkin_rows)

    goals_data = [{
        "goal_label": g.get("goal_label"),
        "goal_type": g.get("goal_type"),
        "target_value": g.get("target_value"),
        "target_unit": g.get("target_unit"),
        "current_value": g.get("current_value"),
        "progress_percent": round((g["current_value"] / g["target_value"]) * 100, 1)
        if g.get("current_value") and g.get("target_value") else 0.0,
        "is_achieved": g.get("is_achieved"),
    } for g in goal_rows]

    # Patient full name.
    full_name = None
    try:
        prof = retry_network(
            lambda: client.table("profiles").select("full_name")
            .eq("id", patient["_profile_id"]).limit(1).execute()
        )
        if prof.data:
            full_name = prof.data[0].get("full_name")
    except Exception:  # noqa: BLE001
        pass

    ctx = _patient_context(patient, profile, full_name)
    ai = await gemini_service.analyze_patient_health(v_agg, c_agg, goals_data, ctx, body.language)

    # Persist to vitals_summary_reports.
    # Only insert the core columns — extra aggregates are returned in-memory only.
    db_payload: dict = {
        "patient_id": patient["id"],
        "period_type": body.period_type,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "overall_risk_band": ai.get("overall_risk_band"),
        "ai_summary": ai.get("ai_summary"),
        "ai_summary_bn": ai.get("ai_summary_bn"),
        "ai_recommendations": ai.get("ai_recommendations") or [],
        "ai_alerts": ai.get("ai_alerts") or [],
        "generated_by_model": ai.get("generated_by_model"),
        "generation_latency_ms": ai.get("generation_latency_ms"),
    }
    try:
        res = retry_network(
            lambda: client.table("vitals_summary_reports").insert(db_payload).execute()
        )
        report_row = res.data[0]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to save report: {exc}")

    # Build PDF.
    pdf_available = False
    report_data = {**v_agg, **c_agg, **ai,
                   "period_start": start.isoformat(), "period_end": end.isoformat(),
                   "goals": goals_data}
    patient_data = {**ctx, "patient_code": patient.get("patient_code")}
    try:
        path = _pdf_path(patient.get("patient_code"), start.isoformat(), end.isoformat())
        await pdf_service.generate_patient_report_pdf(report_data, patient_data, path)
        pdf_available = os.path.exists(path)
    except Exception:  # noqa: BLE001
        pdf_available = False

    extra_agg = {
        "vitals_count": v_agg.get("vitals_count", 0),
        "flagged_vitals_count": v_agg.get("flagged_vitals_count", 0),
        "checkins_count": c_agg.get("checkins_count", 0),
        "avg_energy_level": c_agg.get("avg_energy_level"),
        "avg_sleep_hours": c_agg.get("avg_sleep_hours"),
    }
    summary = _shape_summary(report_row, pdf_available, extra=extra_agg)
    out = summary.model_dump()
    out["avg_pain_level"] = c_agg.get("avg_pain_level")
    out["total_exercise_minutes"] = c_agg.get("total_exercise_minutes")
    out["total_steps"] = c_agg.get("total_steps")
    out["flags_breakdown"] = v_agg.get("flags_breakdown")
    out["symptom_days"] = c_agg.get("symptom_days")
    if ai.get("ai_unavailable"):
        out["message"] = "AI temporarily unavailable"
    return out


@router.get("/history")
async def reports_history(limit: int = Query(5), patient=Depends(get_patient)):
    client = get_admin_client()
    res = retry_network(
        lambda: client.table("vitals_summary_reports").select("*")
        .eq("patient_id", patient["id"]).order("created_at", desc=True).limit(limit).execute()
    )
    reports = [_shape_summary(r, False) for r in (res.data or [])]
    return {"reports": reports}


@router.get("/{report_id}")
async def report_detail(report_id: str, patient=Depends(get_patient)):
    client = get_admin_client()
    res = retry_network(
        lambda: client.table("vitals_summary_reports").select("*").eq("id", report_id).limit(1).execute()
    )
    if not res.data or res.data[0].get("patient_id") != patient["id"]:
        raise HTTPException(status_code=404, detail="Report not found.")
    row = res.data[0]
    path = _pdf_path(patient.get("patient_code"), str(row["period_start"]), str(row["period_end"]))
    return _shape_summary(row, os.path.exists(path))


@router.get("/{report_id}/pdf")
async def report_pdf(report_id: str, patient=Depends(get_patient),
                     profile=Depends(get_health_profile)):
    client = get_admin_client()
    res = retry_network(
        lambda: client.table("vitals_summary_reports").select("*").eq("id", report_id).limit(1).execute()
    )
    if not res.data or res.data[0].get("patient_id") != patient["id"]:
        raise HTTPException(status_code=404, detail="Report not found.")
    row = res.data[0]
    start = str(row["period_start"])
    end = str(row["period_end"])
    path = _pdf_path(patient.get("patient_code"), start, end)

    if not os.path.exists(path):
        # Rebuild from stored data.
        full_name = None
        try:
            prof = retry_network(
                lambda: client.table("profiles").select("full_name")
                .eq("id", patient["_profile_id"]).limit(1).execute()
            )
            if prof.data:
                full_name = prof.data[0].get("full_name")
        except Exception:  # noqa: BLE001
            pass
        ctx = _patient_context(patient, profile, full_name)
        report_data = {
            "period_start": start, "period_end": end,
            "vitals_count": row.get("vitals_count"),
            "avg_systolic_bp": row.get("avg_systolic_bp"),
            "avg_diastolic_bp": row.get("avg_diastolic_bp"),
            "min_systolic_bp": row.get("min_systolic_bp"),
            "max_systolic_bp": row.get("max_systolic_bp"),
            "min_pulse_bpm": row.get("min_pulse_bpm"),
            "max_pulse_bpm": row.get("max_pulse_bpm"),
            "avg_pulse_bpm": row.get("avg_pulse_bpm"),
            "avg_temperature_c": row.get("avg_temperature_c"),
            "avg_weight_kg": row.get("avg_weight_kg"),
            "weight_change_kg": row.get("weight_change_kg"),
            "avg_spo2": None,
            "checkins_count": row.get("checkins_count"),
            "avg_energy_level": row.get("avg_energy_level"),
            "avg_pain_level": row.get("avg_pain_level"),
            "avg_sleep_hours": row.get("avg_sleep_hours"),
            "total_steps": row.get("total_steps"),
            "total_exercise_minutes": row.get("total_exercise_minutes"),
            "symptom_days": {},
            "flagged_vitals_count": row.get("flagged_vitals_count"),
            "flags_breakdown": row.get("flags_breakdown") or {},
            "overall_risk_band": row.get("overall_risk_band"),
            "ai_summary": row.get("ai_summary"),
            "ai_recommendations": row.get("ai_recommendations"),
            "ai_alerts": row.get("ai_alerts"),
            "goals": [],
        }
        patient_data = {**ctx, "patient_code": patient.get("patient_code")}
        try:
            await pdf_service.generate_patient_report_pdf(report_data, patient_data, path)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Could not build PDF: {exc}")

    return FileResponse(
        path, media_type="application/pdf",
        filename=f"shetu_saathi_report_{start}_{end}.pdf",
    )
