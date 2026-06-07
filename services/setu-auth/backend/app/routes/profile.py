"""Health profile onboarding + summary."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import get_health_profile, get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.vitals import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


def _shape(row: dict) -> dict:
    """Coerce a DB row into ProfileResponse-compatible dict."""
    return {
        "id": row["id"],
        "patient_id": row["patient_id"],
        "height_cm": row.get("height_cm"),
        "weight_kg": row.get("weight_kg"),
        "blood_group": row.get("blood_group"),
        "activity_level": row.get("activity_level"),
        "is_smoker": bool(row.get("is_smoker")),
        "is_diabetic": bool(row.get("is_diabetic")),
        "is_hypertensive": bool(row.get("is_hypertensive")),
        "has_heart_disease": bool(row.get("has_heart_disease")),
        "has_kidney_disease": bool(row.get("has_kidney_disease")),
        "other_conditions": row.get("other_conditions") or [],
        "known_allergies": row.get("known_allergies") or [],
        "current_medications": row.get("current_medications") or [],
        "emergency_contact_name": row.get("emergency_contact_name"),
        "emergency_contact_phone": row.get("emergency_contact_phone"),
        "emergency_contact_relation": row.get("emergency_contact_relation"),
        "daily_step_target": row.get("daily_step_target") or 8000,
        "daily_water_ml": row.get("daily_water_ml") or 2000,
        "sleep_target_hours": row.get("sleep_target_hours") or 7.5,
        "bmi": row.get("bmi"),
        "profile_complete": bool(row.get("profile_complete")),
        "created_at": str(row.get("created_at")) if row.get("created_at") else None,
        "updated_at": str(row.get("updated_at")) if row.get("updated_at") else None,
    }


@router.get("")
async def get_profile(profile=Depends(get_health_profile)):
    if not profile:
        return {"exists": False}
    return _shape(profile)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProfileResponse)
async def upsert_profile(body: ProfileCreate, patient=Depends(get_patient)):
    client = get_admin_client()
    payload = body.model_dump()
    payload["patient_id"] = patient["id"]
    payload["profile_complete"] = bool(body.height_cm and body.weight_kg)

    try:
        result = retry_network(
            lambda: client.table("patient_health_profiles")
            .upsert(payload, on_conflict="patient_id")
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {exc}")

    rows = result.data or []
    if not rows:
        # Re-fetch in case upsert returned nothing.
        fetched = retry_network(
            lambda: client.table("patient_health_profiles")
            .select("*").eq("patient_id", patient["id"]).limit(1).execute()
        )
        rows = fetched.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Profile saved but could not be read back.")

    # Sync emergency contact onto patients row when provided.
    ec = {}
    if body.emergency_contact_name:
        ec["emergency_contact_name"] = body.emergency_contact_name
    if body.emergency_contact_phone:
        ec["emergency_contact_phone"] = body.emergency_contact_phone
    if body.emergency_contact_relation:
        ec["emergency_contact_relation"] = body.emergency_contact_relation
    if ec:
        try:
            retry_network(
                lambda: client.table("patients").update(ec).eq("id", patient["id"]).execute()
            )
        except Exception:  # noqa: BLE001
            pass

    return _shape(rows[0])


@router.patch("", response_model=ProfileResponse)
async def patch_profile(body: ProfileUpdate, patient=Depends(get_patient),
                        profile=Depends(get_health_profile)):
    client = get_admin_client()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    if profile:
        if updates.get("height_cm") or updates.get("weight_kg"):
            h = updates.get("height_cm", profile.get("height_cm"))
            w = updates.get("weight_kg", profile.get("weight_kg"))
            updates["profile_complete"] = bool(h and w)
        result = retry_network(
            lambda: client.table("patient_health_profiles")
            .update(updates).eq("patient_id", patient["id"]).execute()
        )
        rows = result.data or []
    else:
        updates["patient_id"] = patient["id"]
        updates["profile_complete"] = bool(updates.get("height_cm") and updates.get("weight_kg"))
        result = retry_network(
            lambda: client.table("patient_health_profiles").insert(updates).execute()
        )
        rows = result.data or []

    if not rows:
        fetched = retry_network(
            lambda: client.table("patient_health_profiles")
            .select("*").eq("patient_id", patient["id"]).limit(1).execute()
        )
        rows = fetched.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return _shape(rows[0])


@router.get("/summary")
async def profile_summary(patient=Depends(get_patient), profile=Depends(get_health_profile)):
    client = get_admin_client()

    # Profile name from profiles table.
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

    # Latest vitals.
    last_vitals = None
    try:
        lv = retry_network(
            lambda: client.table("vitals")
            .select("recorded_at, systolic_bp, diastolic_bp, oxygen_saturation")
            .eq("patient_id", patient["id"]).order("recorded_at", desc=True)
            .limit(1).execute()
        )
        if lv.data:
            last_vitals = lv.data[0]
    except Exception:  # noqa: BLE001
        pass

    # Goals counts.
    active_goals_count = goals_achieved_count = 0
    try:
        gd = retry_network(
            lambda: client.table("health_goals").select("is_active, is_achieved")
            .eq("patient_id", patient["id"]).execute()
        )
        for g in gd.data or []:
            if g.get("is_achieved"):
                goals_achieved_count += 1
            elif g.get("is_active"):
                active_goals_count += 1
    except Exception:  # noqa: BLE001
        pass

    # Check-in streak.
    streak = 0
    try:
        cd = retry_network(
            lambda: client.table("daily_health_checkins").select("checkin_date")
            .eq("patient_id", patient["id"]).order("checkin_date", desc=True)
            .limit(60).execute()
        )
        dates = {row["checkin_date"] for row in (cd.data or [])}
        cursor = date.today()
        while cursor.isoformat() in dates:
            streak += 1
            cursor -= timedelta(days=1)
    except Exception:  # noqa: BLE001
        pass

    return {
        "full_name": full_name,
        "patient_code": patient.get("patient_code"),
        "last_risk_band": patient.get("last_risk_band"),
        "bmi": profile.get("bmi") if profile else None,
        "blood_group": profile.get("blood_group") if profile else None,
        "activity_level": profile.get("activity_level") if profile else None,
        "chronic_conditions": chronic,
        "last_vitals": last_vitals,
        "active_goals_count": active_goals_count,
        "goals_achieved_count": goals_achieved_count,
        "checkin_streak": streak,
        "profile_complete": bool(profile and profile.get("profile_complete")),
    }
