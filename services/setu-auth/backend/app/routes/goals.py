"""Health goals CRUD with auto-computed current value + progress."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_patient
from app.core.supabase import get_admin_client, retry_network
from app.models.goals import GoalCreate, GoalResponse, GoalUpdate

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])


def _latest_checkin(client, patient_id):
    res = retry_network(
        lambda: client.table("daily_health_checkins").select("*")
        .eq("patient_id", patient_id).order("checkin_date", desc=True).limit(1).execute()
    )
    return res.data[0] if res.data else {}


def _latest_vital(client, patient_id):
    res = retry_network(
        lambda: client.table("vitals").select("*")
        .eq("patient_id", patient_id).order("recorded_at", desc=True).limit(1).execute()
    )
    return res.data[0] if res.data else {}


def _compute_current_value(client, patient_id: str, goal_type: str):
    try:
        if goal_type == "daily_steps":
            return _latest_checkin(client, patient_id).get("steps_today")
        if goal_type in ("weight_loss", "weight_gain"):
            return _latest_vital(client, patient_id).get("weight_kg")
        if goal_type == "blood_pressure":
            return _latest_vital(client, patient_id).get("systolic_bp")
        if goal_type == "blood_glucose":
            res = retry_network(
                lambda: client.table("lab_results").select("result_value")
                .eq("patient_id", patient_id).ilike("test_name", "%glucose%")
                .order("reported_at", desc=True).limit(1).execute()
            )
            if res.data:
                try:
                    return float(res.data[0].get("result_value"))
                except (TypeError, ValueError):
                    return None
            return None
        if goal_type == "exercise_minutes":
            return _latest_checkin(client, patient_id).get("exercise_minutes")
        if goal_type == "sleep_hours":
            return _latest_checkin(client, patient_id).get("sleep_hours")
        if goal_type == "water_intake":
            ml = _latest_checkin(client, patient_id).get("water_intake_ml")
            return round(ml / 1000, 2) if ml else None
    except Exception:  # noqa: BLE001
        return None
    return None


def _shape(client, row: dict, patient_id: str) -> GoalResponse:
    current = row.get("current_value")
    if current is None:
        current = _compute_current_value(client, patient_id, row.get("goal_type"))
    target = row.get("target_value") or 0
    progress = round((current / target) * 100, 1) if (current and target) else 0.0

    days_remaining = None
    if row.get("deadline"):
        try:
            d = datetime.fromisoformat(str(row["deadline"])[:10]).date()
            days_remaining = (d - date.today()).days
        except Exception:  # noqa: BLE001
            days_remaining = None

    return GoalResponse(
        id=row["id"],
        goal_type=row.get("goal_type"),
        goal_label=row.get("goal_label"),
        goal_label_bn=row.get("goal_label_bn"),
        target_value=target,
        target_unit=row.get("target_unit") or "",
        start_date=str(row["start_date"]) if row.get("start_date") else None,
        deadline=str(row["deadline"]) if row.get("deadline") else None,
        reminder_enabled=bool(row.get("reminder_enabled")),
        notes=row.get("notes"),
        current_value=current,
        progress_percent=progress,
        is_active=bool(row.get("is_active")),
        is_achieved=bool(row.get("is_achieved")),
        achieved_at=str(row["achieved_at"]) if row.get("achieved_at") else None,
        days_remaining=days_remaining,
        created_at=str(row["created_at"]) if row.get("created_at") else None,
    )


def _owned_goal(client, goal_id: str, patient_id: str) -> dict:
    res = retry_network(
        lambda: client.table("health_goals").select("*").eq("id", goal_id).limit(1).execute()
    )
    if not res.data or res.data[0].get("patient_id") != patient_id:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return res.data[0]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GoalResponse)
async def create_goal(body: GoalCreate, patient=Depends(get_patient)):
    client = get_admin_client()
    payload = body.model_dump()
    payload["patient_id"] = patient["id"]
    payload["start_date"] = body.start_date or date.today().isoformat()
    payload["is_active"] = True
    payload["is_achieved"] = False
    try:
        res = retry_network(lambda: client.table("health_goals").insert(payload).execute())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to create goal: {exc}")
    return _shape(client, res.data[0], patient["id"])


@router.get("")
async def list_goals(active_only: bool = Query(False), patient=Depends(get_patient)):
    client = get_admin_client()
    query = client.table("health_goals").select("*").eq("patient_id", patient["id"])
    if active_only:
        query = query.eq("is_active", True)
    res = retry_network(lambda: query.order("created_at", desc=True).execute())
    rows = res.data or []
    goals = [_shape(client, r, patient["id"]) for r in rows]
    achieved_count = sum(1 for r in rows if r.get("is_achieved"))
    active_count = sum(1 for r in rows if r.get("is_active") and not r.get("is_achieved"))
    return {"goals": goals, "achieved_count": achieved_count, "active_count": active_count}


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: str, body: GoalUpdate, patient=Depends(get_patient)):
    client = get_admin_client()
    _owned_goal(client, goal_id, patient["id"])
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update.")
    res = retry_network(
        lambda: client.table("health_goals").update(updates).eq("id", goal_id).execute()
    )
    return _shape(client, res.data[0], patient["id"])


@router.delete("/{goal_id}")
async def deactivate_goal(goal_id: str, patient=Depends(get_patient)):
    client = get_admin_client()
    _owned_goal(client, goal_id, patient["id"])
    retry_network(
        lambda: client.table("health_goals").update({"is_active": False})
        .eq("id", goal_id).execute()
    )
    return {"message": "Goal deactivated"}


@router.post("/{goal_id}/achieve", response_model=GoalResponse)
async def achieve_goal(goal_id: str, patient=Depends(get_patient)):
    client = get_admin_client()
    _owned_goal(client, goal_id, patient["id"])
    res = retry_network(
        lambda: client.table("health_goals")
        .update({"is_achieved": True, "achieved_at": datetime.utcnow().isoformat()})
        .eq("id", goal_id).execute()
    )
    return _shape(client, res.data[0], patient["id"])
