from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_user
from app.core.deps import get_patient, get_active_pregnancy
from app.core.supabase import get_admin_client, retry_network
from app.models.mother_vitals import MaternalVitalCreate, MaternalVitalResponse
from app.services.mother_flag_service import detect_maternal_flags, worst_severity

router = APIRouter(prefix="/api/v1/mother/vitals", tags=["mother-vitals"])

TREND_UNITS = {
    "systolic_bp": "mmHg",
    "diastolic_bp": "mmHg",
    "weight_kg": "kg",
    "hemoglobin": "g/dL",
    "blood_glucose_fasting": "mg/dL",
    "oxygen_saturation": "%",
    "fetal_heart_rate": "bpm",
    "pulse_bpm": "bpm",
}


@router.post("/log", status_code=status.HTTP_201_CREATED)
async def log_vital(
    body: MaternalVitalCreate,
    current_user: dict = Depends(get_current_user),
    patient: dict = Depends(get_patient),
    pregnancy: Optional[dict] = Depends(get_active_pregnancy),
):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="At least one vital must be provided.")

    # Extra fields not in vitals table stored in flag_details
    extra_fields = {}
    for field in ("blood_glucose_1hr", "blood_glucose_2hr", "urine_glucose_positive",
                  "hep_b_surface_antigen", "hiv_positive", "vdrl_positive"):
        if field in data:
            extra_fields[field] = data.pop(field)

    flags = detect_maternal_flags({**data, **extra_fields})
    severity = worst_severity(flags)
    flag_dicts = [f.model_dump() for f in flags]
    if extra_fields:
        flag_dicts.append({"type": "extra_screenings", "data": extra_fields})

    insert_data = {
        "patient_id": patient["id"],
        "recorded_by": current_user["id"],
        "source": "manual",
        "has_flags": bool(flags),
        "flag_details": flag_dicts,
    }
    if pregnancy:
        insert_data["pregnancy_id"] = pregnancy["id"]

    allowed_columns = {"systolic_bp", "diastolic_bp", "pulse_bpm", "temperature_c",
                       "respiratory_rate", "oxygen_saturation", "weight_kg",
                       "fetal_heart_rate", "hemoglobin", "blood_glucose_fasting", "urine_protein"}
    for col in allowed_columns:
        if col in data:
            insert_data[col] = data[col]

    client = get_admin_client()
    result = retry_network(lambda: client.table("vitals").insert(insert_data).execute())
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=503, detail="Failed to save vitals.")

    if severity == "severe":
        try:
            retry_network(lambda: client.table("patients")
                          .update({"last_risk_band": "urgent"})
                          .eq("id", patient["id"]).execute())
        except Exception:
            pass

    vital = rows[0]
    return {
        "vital": MaternalVitalResponse(
            id=vital["id"],
            recorded_at=vital.get("recorded_at"),
            systolic_bp=vital.get("systolic_bp"),
            diastolic_bp=vital.get("diastolic_bp"),
            weight_kg=vital.get("weight_kg"),
            pulse_bpm=vital.get("pulse_bpm"),
            temperature_c=vital.get("temperature_c"),
            urine_protein=vital.get("urine_protein"),
            hemoglobin=vital.get("hemoglobin"),
            blood_glucose_fasting=vital.get("blood_glucose_fasting"),
            fetal_heart_rate=vital.get("fetal_heart_rate"),
            oxygen_saturation=vital.get("oxygen_saturation"),
            has_flags=bool(flags),
            flag_details=flag_dicts,
            source="manual",
        ),
        "flags": flag_dicts,
        "severity": severity,
        "message": "Vitals logged",
        "requires_sos": severity == "severe",
    }


@router.get("/history")
async def get_history(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    days: int = Query(30, ge=1, le=365),
    patient: dict = Depends(get_patient),
):
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals")
            .select("*")
            .eq("patient_id", patient["id"])
            .gte("recorded_at", since)
            .order("recorded_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch vitals history.")

    vitals = [
        MaternalVitalResponse(
            id=r["id"], recorded_at=r.get("recorded_at"),
            systolic_bp=r.get("systolic_bp"), diastolic_bp=r.get("diastolic_bp"),
            weight_kg=r.get("weight_kg"), pulse_bpm=r.get("pulse_bpm"),
            temperature_c=r.get("temperature_c"), urine_protein=r.get("urine_protein"),
            hemoglobin=r.get("hemoglobin"), blood_glucose_fasting=r.get("blood_glucose_fasting"),
            fetal_heart_rate=r.get("fetal_heart_rate"), oxygen_saturation=r.get("oxygen_saturation"),
            has_flags=bool(r.get("has_flags")), flag_details=r.get("flag_details"),
            source=r.get("source", "manual"),
        ) for r in rows
    ]
    return {"vitals": vitals, "total": len(vitals)}


@router.get("/latest")
async def get_latest(patient: dict = Depends(get_patient)):
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals")
            .select("*")
            .eq("patient_id", patient["id"])
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch latest vital.")

    if not rows:
        return {"vital": None}
    r = rows[0]
    return {
        "vital": MaternalVitalResponse(
            id=r["id"], recorded_at=r.get("recorded_at"),
            systolic_bp=r.get("systolic_bp"), diastolic_bp=r.get("diastolic_bp"),
            weight_kg=r.get("weight_kg"), pulse_bpm=r.get("pulse_bpm"),
            temperature_c=r.get("temperature_c"), urine_protein=r.get("urine_protein"),
            hemoglobin=r.get("hemoglobin"), blood_glucose_fasting=r.get("blood_glucose_fasting"),
            fetal_heart_rate=r.get("fetal_heart_rate"), oxygen_saturation=r.get("oxygen_saturation"),
            has_flags=bool(r.get("has_flags")), flag_details=r.get("flag_details"),
            source=r.get("source", "manual"),
        )
    }


@router.get("/trends")
async def get_trends(
    metric: str = Query("systolic_bp"),
    days: int = Query(30, ge=1, le=365),
    patient: dict = Depends(get_patient),
):
    if metric not in TREND_UNITS:
        raise HTTPException(status_code=400, detail=f"Unsupported metric. Choose from: {list(TREND_UNITS.keys())}")

    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals")
            .select(f"recorded_at,{metric}")
            .eq("patient_id", patient["id"])
            .gte("recorded_at", since)
            .not_.is_(metric, "null")
            .order("recorded_at", desc=False)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch trends.")

    by_date: dict[str, list[float]] = {}
    for r in rows:
        date_str = (r.get("recorded_at") or "")[:10]
        val = r.get(metric)
        if val is not None:
            by_date.setdefault(date_str, []).append(float(val))

    data = [
        {
            "date": d,
            "avg": round(sum(vals) / len(vals), 2),
            "min": min(vals),
            "max": max(vals),
        }
        for d, vals in sorted(by_date.items())
    ]
    return {"metric": metric, "unit": TREND_UNITS[metric], "data": data}


@router.get("/anc-summary")
async def get_anc_summary(patient: dict = Depends(get_patient)):
    since = (datetime.utcnow() - timedelta(days=30)).isoformat()
    try:
        client = get_admin_client()
        result = retry_network(
            lambda: client.table("vitals")
            .select("*")
            .eq("patient_id", patient["id"])
            .gte("recorded_at", since)
            .order("recorded_at", desc=False)
            .execute()
        )
        rows = result.data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Could not fetch ANC summary.")

    sys_vals = [r["systolic_bp"] for r in rows if r.get("systolic_bp")]
    dia_vals = [r["diastolic_bp"] for r in rows if r.get("diastolic_bp")]
    weight_vals = [r["weight_kg"] for r in rows if r.get("weight_kg")]
    hb_vals = [r["hemoglobin"] for r in rows if r.get("hemoglobin")]
    gf_vals = [r["blood_glucose_fasting"] for r in rows if r.get("blood_glucose_fasting")]
    fhr_vals = [r["fetal_heart_rate"] for r in rows if r.get("fetal_heart_rate")]
    protein_vals = [r["urine_protein"] for r in rows if r.get("urine_protein")]

    any_glucosuria = any(
        "glucose_urine" in str(r.get("flag_details", ""))
        for r in rows
    )

    latest_recorded = rows[-1]["recorded_at"] if rows else None

    return {
        "blood_pressure": {
            "latest_systolic": sys_vals[-1] if sys_vals else None,
            "latest_diastolic": dia_vals[-1] if dia_vals else None,
            "avg_systolic": round(sum(sys_vals) / len(sys_vals), 1) if sys_vals else None,
            "avg_diastolic": round(sum(dia_vals) / len(dia_vals), 1) if dia_vals else None,
            "bp_checked_count": len(sys_vals),
        },
        "weight": {
            "latest_kg": weight_vals[-1] if weight_vals else None,
            "first_recorded_kg": weight_vals[0] if weight_vals else None,
            "total_gain_kg": round(weight_vals[-1] - weight_vals[0], 2) if len(weight_vals) >= 2 else None,
        },
        "urine": {
            "latest_protein": protein_vals[-1] if protein_vals else None,
            "any_proteinuria": any(p not in ("none", None) for p in protein_vals),
            "any_glucosuria": any_glucosuria,
        },
        "blood_tests": {
            "latest_hemoglobin": hb_vals[-1] if hb_vals else None,
            "latest_fasting_glucose": gf_vals[-1] if gf_vals else None,
            "gdm_risk": any(g >= 92 for g in gf_vals),
        },
        "fetal": {
            "latest_fhr": fhr_vals[-1] if fhr_vals else None,
            "fhr_readings_count": len(fhr_vals),
        },
        "last_updated": latest_recorded,
    }
