import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import get_patient, get_active_pregnancy
from app.core.supabase import get_admin_client, retry_network
from app.models.mother_report import PregnancyReportRequest, PregnancyReportSummary
from app.services import mother_gemini_service
from app.services.mother_pdf_service import generate_pregnancy_report_pdf

router = APIRouter(prefix="/api/v1/mother/reports", tags=["mother-reports"])


def _compute_period(period_type: str, period_start: Optional[str], period_end: Optional[str]):
    now = datetime.utcnow()
    if period_type == "weekly":
        end = now
        start = now - timedelta(days=7)
    elif period_type == "monthly":
        end = now
        start = now - timedelta(days=30)
    elif period_type == "custom":
        if not period_start or not period_end:
            raise HTTPException(status_code=400, detail="period_start and period_end required for custom.")
        start = datetime.fromisoformat(period_start)
        end = datetime.fromisoformat(period_end)
        if (end - start).days > 90:
            raise HTTPException(status_code=400, detail="Custom period cannot exceed 90 days.")
    else:
        raise HTTPException(status_code=400, detail="period_type must be weekly|monthly|custom.")
    return start.date().isoformat(), end.date().isoformat()


def _agg_vitals(rows: list[dict]) -> dict:
    def _avg(vals):
        return round(sum(vals) / len(vals), 2) if vals else None

    sys_vals = [r["systolic_bp"] for r in rows if r.get("systolic_bp")]
    dia_vals = [r["diastolic_bp"] for r in rows if r.get("diastolic_bp")]
    pulse_vals = [r["pulse_bpm"] for r in rows if r.get("pulse_bpm")]
    temp_vals = [r["temperature_c"] for r in rows if r.get("temperature_c")]
    weight_vals = [r["weight_kg"] for r in rows if r.get("weight_kg")]
    spo2_vals = [r["oxygen_saturation"] for r in rows if r.get("oxygen_saturation")]
    hb_vals = [r["hemoglobin"] for r in rows if r.get("hemoglobin")]
    gf_vals = [r["blood_glucose_fasting"] for r in rows if r.get("blood_glucose_fasting")]
    fhr_vals = [r["fetal_heart_rate"] for r in rows if r.get("fetal_heart_rate")]
    protein_vals = [r["urine_protein"] for r in rows if r.get("urine_protein")]

    flagged = [r for r in rows if r.get("has_flags")]
    flags_breakdown: dict = {}
    any_proteinuria = False
    any_glucosuria = False
    infection_flags = []
    gdm_risk_readings = 0

    for r in flagged:
        for fd in (r.get("flag_details") or []):
            ft = fd.get("type", "")
            flags_breakdown[ft] = flags_breakdown.get(ft, 0) + 1
            if ft in ("high_protein_urine", "protein_urine"):
                any_proteinuria = True
            if ft == "glucose_urine":
                any_glucosuria = True
            if ft in ("hep_b_positive", "hiv_positive", "syphilis_positive"):
                infection_flags.append(ft)
            if ft in ("elevated_fasting_glucose", "high_fasting_glucose",
                      "high_1hr_glucose", "high_2hr_glucose"):
                gdm_risk_readings += 1

    return {
        "vitals_count": len(rows),
        "flagged_vitals_count": len(flagged),
        "flags_breakdown": flags_breakdown,
        "avg_systolic_bp": _avg(sys_vals),
        "avg_diastolic_bp": _avg(dia_vals),
        "min_systolic_bp": min(sys_vals) if sys_vals else None,
        "max_systolic_bp": max(sys_vals) if sys_vals else None,
        "avg_pulse_bpm": _avg(pulse_vals),
        "avg_temperature_c": _avg(temp_vals),
        "avg_weight_kg": _avg(weight_vals),
        "min_weight_kg": min(weight_vals) if weight_vals else None,
        "max_weight_kg": max(weight_vals) if weight_vals else None,
        "weight_change_kg": round(weight_vals[-1] - weight_vals[0], 2) if len(weight_vals) >= 2 else None,
        "avg_spo2": _avg(spo2_vals),
        "avg_hemoglobin": _avg(hb_vals),
        "avg_fasting_glucose": _avg(gf_vals),
        "latest_fhr": fhr_vals[-1] if fhr_vals else None,
        "avg_fetal_heart_rate": _avg(fhr_vals),
        "latest_urine_protein": protein_vals[-1] if protein_vals else None,
        "any_proteinuria": any_proteinuria,
        "any_glucosuria": any_glucosuria,
        "infection_flags": infection_flags,
        "gdm_risk_readings": gdm_risk_readings,
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_report(
    body: PregnancyReportRequest,
    patient: dict = Depends(get_patient),
    pregnancy: Optional[dict] = Depends(get_active_pregnancy),
):
    period_start, period_end = _compute_period(body.period_type, body.period_start, body.period_end)

    client = get_admin_client()
    try:
        result = retry_network(
            lambda: client.table("vitals")
            .select("*")
            .eq("patient_id", patient["id"])
            .gte("recorded_at", period_start)
            .lte("recorded_at", period_end + "T23:59:59")
            .order("recorded_at", desc=False)
            .execute()
        )
        vitals_rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch vitals.")

    agg = _agg_vitals(vitals_rows)

    pregnancy_context = {
        "trimester": pregnancy["trimester"] if pregnancy else "unknown",
        "gestational_age_weeks": pregnancy["gestational_age_weeks"] if pregnancy else None,
        "edd": pregnancy["edd"] if pregnancy else None,
        "anc_count": pregnancy["anc_count"] if pregnancy else 0,
    }

    try:
        profile_id = patient.get("_profile_id") or patient.get("profile_id", "")
        profile_result = retry_network(
            lambda: client.table("profiles")
            .select("full_name")
            .eq("id", profile_id)
            .limit(1)
            .execute()
        )
        profile_rows = profile_result.data or []
        full_name = profile_rows[0]["full_name"] if profile_rows else "Patient"
    except Exception:
        full_name = "Patient"

    ai = await mother_gemini_service.analyze_pregnancy_health(agg, pregnancy_context, body.language)

    insert_data = {
        "patient_id": patient["id"],
        "period_type": body.period_type,
        "period_start": period_start,
        "period_end": period_end,
        "overall_risk_band": ai.get("overall_risk_band", "watch"),
        "ai_summary": ai.get("ai_summary"),
        "ai_summary_bn": ai.get("ai_summary_bn"),
        "ai_recommendations": ai.get("ai_recommendations") or [],
        "ai_alerts": ai.get("ai_alerts") or [],
        "generated_by_model": ai.get("generated_by_model"),
        "generation_latency_ms": ai.get("generation_latency_ms"),
        # aggregates — only insert if the column exists (ignored otherwise)
        "avg_systolic_bp": agg.get("avg_systolic_bp"),
        "avg_diastolic_bp": agg.get("avg_diastolic_bp"),
        "avg_pulse_bpm": agg.get("avg_pulse_bpm"),
        "avg_temperature_c": agg.get("avg_temperature_c"),
        "avg_weight_kg": agg.get("avg_weight_kg"),
        "weight_change_kg": agg.get("weight_change_kg"),
    }
    if pregnancy:
        insert_data["pregnancy_id"] = pregnancy["id"]

    try:
        ins_result = retry_network(
            lambda: client.table("vitals_summary_reports").insert(insert_data).execute()
        )
        report_row = (ins_result.data or [{}])[0]
    except Exception:
        raise HTTPException(status_code=503, detail="Could not save report.")

    patient_code = patient.get("patient_code", "PT")
    pdf_path = os.path.join(
        settings.REPORT_STORAGE_PATH,
        f"PREG_{patient_code}_{period_start}_{period_end}.pdf",
    )
    pdf_available = False
    try:
        patient_data = {
            "full_name": full_name,
            "patient_code": patient_code,
            "edd": pregnancy_context.get("edd"),
            "anc_count": pregnancy_context.get("anc_count"),
        }
        report_for_pdf = {**agg, **ai,
                          "period_start": period_start, "period_end": period_end,
                          "overall_risk_band": ai.get("overall_risk_band"),
                          "gestational_age_weeks": pregnancy_context.get("gestational_age_weeks"),
                          "trimester": pregnancy_context.get("trimester")}
        await generate_pregnancy_report_pdf(report_for_pdf, patient_data, pdf_path)
        pdf_available = True
    except Exception:
        pass

    return PregnancyReportSummary(
        id=report_row.get("id", ""),
        period_type=body.period_type,
        period_start=period_start,
        period_end=period_end,
        overall_risk_band=ai.get("overall_risk_band"),
        ai_summary=ai.get("ai_summary"),
        ai_summary_bn=ai.get("ai_summary_bn"),
        ai_recommendations=ai.get("ai_recommendations"),
        ai_alerts=ai.get("ai_alerts"),
        vitals_count=agg["vitals_count"],
        flagged_vitals_count=agg["flagged_vitals_count"],
        gestational_age_weeks=pregnancy_context.get("gestational_age_weeks"),
        trimester=pregnancy_context.get("trimester"),
        generated_by_model=ai.get("generated_by_model"),
        created_at=report_row.get("created_at"),
        pdf_available=pdf_available,
    )


@router.get("/history")
async def get_history(
    limit: int = Query(5, ge=1, le=50),
    patient: dict = Depends(get_patient),
):
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals_summary_reports")
            .select("*")
            .eq("patient_id", patient["id"])
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch reports.")

    reports = [
        PregnancyReportSummary(
            id=r["id"], period_type=r.get("period_type", ""),
            period_start=r.get("period_start", ""), period_end=r.get("period_end", ""),
            overall_risk_band=r.get("overall_risk_band"),
            ai_summary=r.get("ai_summary"), ai_summary_bn=r.get("ai_summary_bn"),
            ai_recommendations=r.get("ai_recommendations"), ai_alerts=r.get("ai_alerts"),
            vitals_count=r.get("vitals_count", 0),
            flagged_vitals_count=r.get("flagged_vitals_count", 0),
            gestational_age_weeks=None, trimester=None,
            generated_by_model=r.get("generated_by_model"),
            created_at=r.get("created_at"),
            pdf_available=False,
        )
        for r in rows
    ]
    return {"reports": reports}


@router.get("/{report_id}")
async def get_report(report_id: str, patient: dict = Depends(get_patient)):
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals_summary_reports")
            .select("*")
            .eq("id", report_id)
            .eq("patient_id", patient["id"])
            .limit(1)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch report.")

    if not rows:
        raise HTTPException(status_code=404, detail="Report not found.")
    r = rows[0]
    return PregnancyReportSummary(
        id=r["id"], period_type=r.get("period_type", ""),
        period_start=r.get("period_start", ""), period_end=r.get("period_end", ""),
        overall_risk_band=r.get("overall_risk_band"),
        ai_summary=r.get("ai_summary"), ai_summary_bn=r.get("ai_summary_bn"),
        ai_recommendations=r.get("ai_recommendations"), ai_alerts=r.get("ai_alerts"),
        vitals_count=r.get("vitals_count", 0),
        flagged_vitals_count=r.get("flagged_vitals_count", 0),
        gestational_age_weeks=None, trimester=None,
        generated_by_model=r.get("generated_by_model"),
        created_at=r.get("created_at"),
        pdf_available=False,
    )


@router.get("/{report_id}/pdf")
async def get_report_pdf(report_id: str, patient: dict = Depends(get_patient)):
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals_summary_reports")
            .select("*")
            .eq("id", report_id)
            .eq("patient_id", patient["id"])
            .limit(1)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch report.")

    if not rows:
        raise HTTPException(status_code=404, detail="Report not found.")
    r = rows[0]

    patient_code = patient.get("patient_code", "PT")
    start = r.get("period_start", "")
    end = r.get("period_end", "")
    pdf_path = os.path.join(settings.REPORT_STORAGE_PATH, f"PREG_{patient_code}_{start}_{end}.pdf")

    if not os.path.exists(pdf_path):
        try:
            _pid = patient.get("_profile_id") or patient.get("profile_id", "")
            profile_result = retry_network(
                lambda: client.table("profiles")
                .select("full_name")
                .eq("id", _pid)
                .limit(1)
                .execute()
            )
            profile_rows = profile_result.data or []
            full_name = profile_rows[0]["full_name"] if profile_rows else "Patient"
        except Exception:
            full_name = "Patient"

        patient_data = {"full_name": full_name, "patient_code": patient_code}
        report_for_pdf = {
            "period_start": start, "period_end": end,
            "overall_risk_band": r.get("overall_risk_band"),
            "ai_summary": r.get("ai_summary"), "ai_summary_bn": r.get("ai_summary_bn"),
            "ai_recommendations": r.get("ai_recommendations"),
            "ai_alerts": r.get("ai_alerts"),
            "vitals_count": r.get("vitals_count", 0),
            "flagged_vitals_count": r.get("flagged_vitals_count", 0),
            "flags_breakdown": r.get("flags_breakdown", {}),
            "avg_systolic_bp": r.get("avg_systolic_bp"),
            "avg_diastolic_bp": r.get("avg_diastolic_bp"),
            "avg_weight_kg": r.get("avg_weight_kg"),
            "weight_change_kg": r.get("weight_change_kg"),
        }
        try:
            await generate_pregnancy_report_pdf(report_for_pdf, patient_data, pdf_path)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"PDF generation failed: {exc}")

    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=f"shetu_maternal_report_{start}_{end}.pdf",
    )
