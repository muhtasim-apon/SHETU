"""Daily wellness check-in — one per patient per day."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_health_profile, get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.checkin import CheckinCreate, CheckinResponse

router = APIRouter(prefix="/api/v1/checkin", tags=["checkin"])

CHEST_PAIN_WARNING = (
    "Chest pain reported. If severe or persistent, seek emergency care immediately."
)


def _shape(row: dict, goal_progress=None, warning=None) -> CheckinResponse:
    return CheckinResponse(
        id=row["id"],
        patient_id=row["patient_id"],
        checkin_date=str(row["checkin_date"]),
        overall_feeling=row.get("overall_feeling"),
        energy_level=row.get("energy_level"),
        pain_level=row.get("pain_level"),
        stress_level=row.get("stress_level"),
        mood_notes=row.get("mood_notes"),
        sleep_hours=row.get("sleep_hours"),
        sleep_quality=row.get("sleep_quality"),
        steps_today=row.get("steps_today"),
        exercise_minutes=row.get("exercise_minutes"),
        water_intake_ml=row.get("water_intake_ml"),
        had_headache=bool(row.get("had_headache")),
        had_fever=bool(row.get("had_fever")),
        had_nausea=bool(row.get("had_nausea")),
        had_chest_pain=bool(row.get("had_chest_pain")),
        had_dizziness=bool(row.get("had_dizziness")),
        other_symptoms=row.get("other_symptoms") or [],
        notes=row.get("notes"),
        goal_progress=goal_progress,
        warning=warning,
        created_at=str(row.get("created_at")) if row.get("created_at") else None,
    )


def _goal_progress(row: dict, profile) -> dict:
    step_target = (profile or {}).get("daily_step_target") or 8000
    water_target = (profile or {}).get("daily_water_ml") or 2000
    sleep_target = (profile or {}).get("sleep_target_hours") or 7.5

    def pct(value, target):
        if not value or not target:
            return 0.0
        return round(value / target * 100, 1)

    return {
        "steps": {"current": row.get("steps_today") or 0, "target": step_target,
                  "percent": pct(row.get("steps_today"), step_target)},
        "water": {"current": row.get("water_intake_ml") or 0, "target": water_target,
                  "percent": pct(row.get("water_intake_ml"), water_target)},
        "sleep": {"current": row.get("sleep_hours") or 0, "target": sleep_target,
                  "percent": pct(row.get("sleep_hours"), sleep_target)},
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def upsert_checkin(body: CheckinCreate, patient=Depends(get_patient),
                         profile=Depends(get_health_profile)):
    client = get_admin_client()
    payload = body.model_dump()
    payload["patient_id"] = patient["id"]
    payload["checkin_date"] = date.today().isoformat()
    try:
        result = retry_network(
            lambda: client.table("daily_health_checkins")
            .upsert(payload, on_conflict="patient_id,checkin_date").execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to save check-in: {exc}")

    rows = result.data or []
    if not rows:
        fetched = retry_network(
            lambda: client.table("daily_health_checkins").select("*")
            .eq("patient_id", patient["id"]).eq("checkin_date", payload["checkin_date"])
            .limit(1).execute()
        )
        rows = fetched.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Check-in saved but could not be read back.")

    warning = CHEST_PAIN_WARNING if body.had_chest_pain else None
    return _shape(rows[0], _goal_progress(rows[0], profile), warning)


@router.get("/today")
async def checkin_today(patient=Depends(get_patient), profile=Depends(get_health_profile)):
    client = get_admin_client()
    result = retry_network(
        lambda: client.table("daily_health_checkins").select("*")
        .eq("patient_id", patient["id"]).eq("checkin_date", date.today().isoformat())
        .limit(1).execute()
    )
    if not result.data:
        return None
    row = result.data[0]
    warning = CHEST_PAIN_WARNING if row.get("had_chest_pain") else None
    return _shape(row, _goal_progress(row, profile), warning)


@router.get("/history")
async def checkin_history(limit: int = Query(7), offset: int = Query(0),
                          patient=Depends(get_patient), profile=Depends(get_health_profile)):
    client = get_admin_client()
    result = retry_network(
        lambda: client.table("daily_health_checkins").select("*")
        .eq("patient_id", patient["id"]).order("checkin_date", desc=True)
        .range(offset, offset + limit - 1).execute()
    )
    checkins = [_shape(r, _goal_progress(r, profile)) for r in (result.data or [])]

    # Streak from full date set.
    all_dates = retry_network(
        lambda: client.table("daily_health_checkins").select("checkin_date")
        .eq("patient_id", patient["id"]).order("checkin_date", desc=True).limit(90).execute()
    )
    dates = {str(r["checkin_date"]) for r in (all_dates.data or [])}
    streak = 0
    cursor = date.today()
    while cursor.isoformat() in dates:
        streak += 1
        cursor -= timedelta(days=1)

    return {"checkins": checkins, "streak": streak}


@router.get("/weekly-summary")
async def weekly_summary(patient=Depends(get_patient)):
    client = get_admin_client()
    since = (date.today() - timedelta(days=7)).isoformat()
    result = retry_network(
        lambda: client.table("daily_health_checkins").select("*")
        .eq("patient_id", patient["id"]).gte("checkin_date", since).execute()
    )
    rows = result.data or []

    def _avg(key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def _sum(key):
        return sum(r[key] for r in rows if r.get(key) is not None)

    symptom_days = {
        "headache": sum(1 for r in rows if r.get("had_headache")),
        "fever": sum(1 for r in rows if r.get("had_fever")),
        "nausea": sum(1 for r in rows if r.get("had_nausea")),
        "chest_pain": sum(1 for r in rows if r.get("had_chest_pain")),
    }
    mood_distribution = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "very_poor": 0}
    for r in rows:
        f = r.get("overall_feeling")
        if f in mood_distribution:
            mood_distribution[f] += 1

    return {
        "avg_energy": _avg("energy_level"),
        "avg_pain": _avg("pain_level"),
        "avg_stress": _avg("stress_level"),
        "avg_sleep_hours": _avg("sleep_hours"),
        "total_steps": _sum("steps_today"),
        "total_exercise_minutes": _sum("exercise_minutes"),
        "total_water_ml": _sum("water_intake_ml"),
        "symptom_days": symptom_days,
        "mood_distribution": mood_distribution,
    }
