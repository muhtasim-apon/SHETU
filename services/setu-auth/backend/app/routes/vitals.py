"""Patient vitals logging — BP + SpO2 primary."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_health_profile, get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.vitals import VitalCreate, VitalResponse
from app.services.flag_service import detect_flags, worst_severity

router = APIRouter(prefix="/api/v1/vitals", tags=["vitals"])

_METRIC_UNITS = {
    "systolic_bp": "mmHg", "diastolic_bp": "mmHg", "oxygen_saturation": "%",
    "pulse_bpm": "bpm", "temperature_c": "°C", "weight_kg": "kg",
}


def _shape_vital(row: dict) -> VitalResponse:
    return VitalResponse(
        id=row["id"],
        recorded_at=str(row.get("recorded_at")) if row.get("recorded_at") else None,
        systolic_bp=row.get("systolic_bp"),
        diastolic_bp=row.get("diastolic_bp"),
        oxygen_saturation=row.get("oxygen_saturation"),
        pulse_bpm=row.get("pulse_bpm"),
        temperature_c=row.get("temperature_c"),
        respiratory_rate=row.get("respiratory_rate"),
        weight_kg=row.get("weight_kg"),
        has_flags=bool(row.get("has_flags")),
        flag_details=row.get("flag_details"),
        source=row.get("source") or "manual",
    )


@router.post("/log", status_code=status.HTTP_201_CREATED)
async def log_vital(body: VitalCreate, patient=Depends(get_patient),
                    profile=Depends(get_health_profile)):
    if body.systolic_bp is None and body.oxygen_saturation is None:
        raise HTTPException(
            status_code=422,
            detail="At least one of systolic_bp or oxygen_saturation must be provided.",
        )
    client = get_admin_client()

    # Weight change vs last recorded weight.
    vital_dict = body.model_dump()
    if body.weight_kg is not None:
        try:
            last = retry_network(
                lambda: client.table("vitals").select("weight_kg")
                .eq("patient_id", patient["id"]).not_.is_("weight_kg", "null")
                .order("recorded_at", desc=True).limit(1).execute()
            )
            if last.data and last.data[0].get("weight_kg") is not None:
                vital_dict["weight_change_kg"] = body.weight_kg - last.data[0]["weight_kg"]
        except Exception:  # noqa: BLE001
            pass

    flags = detect_flags(vital_dict, profile)
    flag_dicts = [f.model_dump() for f in flags]
    severity = worst_severity(flags)

    insert_payload = {
        "patient_id": patient["id"],
        "recorded_by": patient["_profile_id"],
        "source": "manual",
        "systolic_bp": body.systolic_bp,
        "diastolic_bp": body.diastolic_bp,
        "oxygen_saturation": body.oxygen_saturation,
        "pulse_bpm": body.pulse_bpm,
        "temperature_c": body.temperature_c,
        "respiratory_rate": body.respiratory_rate,
        "weight_kg": body.weight_kg,
        "has_flags": len(flags) > 0,
        "flag_details": flag_dicts,
    }
    try:
        result = retry_network(
            lambda: client.table("vitals").insert(insert_payload).execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to log vitals: {exc}")

    row = (result.data or [{}])[0]

    # Mirror to vitals_streaming for real-time consumers.
    try:
        streaming_payload = {
            "patient_id": patient["id"],
            "systolic_bp": body.systolic_bp,
            "diastolic_bp": body.diastolic_bp,
            "oxygen_saturation": body.oxygen_saturation,
            "pulse_bpm": body.pulse_bpm,
            "temperature_c": body.temperature_c,
            "weight_kg": body.weight_kg,
            "has_flags": len(flags) > 0,
            "severity": severity or "none",
        }
        retry_network(
            lambda: client.table("vitals_streaming").insert(streaming_payload).execute()
        )
    except Exception:  # noqa: BLE001
        pass  # Non-critical — don't fail the log if streaming write fails

    # Update patient risk band.
    new_band = None
    if severity == "severe":
        new_band = "urgent"
    elif severity in ("elevated", "moderate"):
        new_band = "watch"
    if new_band:
        try:
            retry_network(
                lambda: client.table("patients").update({"last_risk_band": new_band})
                .eq("id", patient["id"]).execute()
            )
        except Exception:  # noqa: BLE001
            pass

    return {
        "vital": _shape_vital(row),
        "flags": flag_dicts,
        "severity": severity or "none",
    }


@router.get("/history")
async def vitals_history(limit: int = Query(10), offset: int = Query(0),
                         days: int = Query(30), patient=Depends(get_patient)):
    client = get_admin_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = retry_network(
        lambda: client.table("vitals").select("*", count="exact")
        .eq("patient_id", patient["id"]).gte("recorded_at", since)
        .order("recorded_at", desc=True).range(offset, offset + limit - 1).execute()
    )
    vitals = [_shape_vital(r) for r in (result.data or [])]
    return {"vitals": vitals, "total": result.count or len(vitals)}


@router.get("/latest")
async def vitals_latest(patient=Depends(get_patient)):
    client = get_admin_client()
    result = retry_network(
        lambda: client.table("vitals").select("*")
        .eq("patient_id", patient["id"]).order("recorded_at", desc=True)
        .limit(1).execute()
    )
    if not result.data:
        return None
    return _shape_vital(result.data[0])


@router.get("/trends")
async def vitals_trends(metric: str = Query("systolic_bp"), days: int = Query(30),
                        patient=Depends(get_patient)):
    if metric not in _METRIC_UNITS:
        raise HTTPException(status_code=422, detail=f"Unsupported metric: {metric}")
    client = get_admin_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = retry_network(
        lambda: client.table("vitals").select(f"recorded_at, {metric}")
        .eq("patient_id", patient["id"]).gte("recorded_at", since)
        .not_.is_(metric, "null").order("recorded_at", desc=False).execute()
    )
    buckets: dict[str, list[float]] = defaultdict(list)
    for r in result.data or []:
        val = r.get(metric)
        if val is None or not r.get("recorded_at"):
            continue
        day = str(r["recorded_at"])[:10]
        buckets[day].append(float(val))
    data = [
        {"date": d, "avg": round(sum(vals) / len(vals), 1),
         "min": min(vals), "max": max(vals)}
        for d, vals in sorted(buckets.items())
    ]
    return {"metric": metric, "unit": _METRIC_UNITS[metric], "data": data}


@router.get("/stats")
async def vitals_stats(patient=Depends(get_patient)):
    client = get_admin_client()
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    result = retry_network(
        lambda: client.table("vitals").select("*")
        .eq("patient_id", patient["id"]).gte("recorded_at", since).execute()
    )
    rows = result.data or []

    def _avg(key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    avg_sys = _avg("systolic_bp")
    avg_dia = _avg("diastolic_bp")
    avg_spo2 = _avg("oxygen_saturation")
    flagged = sum(1 for r in rows if r.get("has_flags"))

    if avg_sys is None:
        bp_status = "normal"
    elif avg_sys >= 180:
        bp_status = "critical"
    elif avg_sys >= 140:
        bp_status = "high"
    elif avg_sys >= 130:
        bp_status = "elevated"
    else:
        bp_status = "normal"

    if avg_spo2 is None or avg_spo2 >= 95:
        spo2_status = "normal"
    elif avg_spo2 < 90:
        spo2_status = "critical"
    else:
        spo2_status = "low"

    return {
        "avg_systolic_bp": avg_sys,
        "avg_diastolic_bp": avg_dia,
        "avg_spo2": avg_spo2,
        "avg_pulse": _avg("pulse_bpm"),
        "readings_count": len(rows),
        "flagged_count": flagged,
        "bp_status": bp_status,
        "spo2_status": spo2_status,
    }
