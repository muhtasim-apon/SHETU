"""Shared FastAPI dependencies — resolve the patient + health profile rows."""
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.supabase import get_admin_client, retry_network


async def get_patient(current_user: dict = Depends(get_current_user)) -> dict:
    """Load the patients row tied to the authenticated profile, auto-creating it if missing."""
    client = get_admin_client()
    result = retry_network(
        lambda: client.table("patients")
        .select("*")
        .eq("profile_id", current_user["id"])
        .limit(1)
        .execute()
    )
    rows = result.data or []

    if not rows:
        # Auto-create the patients row so any signed-in user can use Saathi features.
        email = current_user.get("email", "")
        new_patient = {
            "profile_id": current_user["id"],
            "patient_code": f"PT-{str(uuid.uuid4())[:8].upper()}",
        }
        try:
            insert_result = retry_network(
                lambda: client.table("patients").insert(new_patient).execute()
            )
            rows = insert_result.data or []
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not create patient record: {exc}",
            )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Patient record could not be created.",
            )

    patient = rows[0]
    patient["_profile_id"] = current_user["id"]
    patient["_email"] = current_user.get("email")
    return patient


async def get_health_profile(patient: dict = Depends(get_patient)) -> Optional[dict]:
    """Load the patient_health_profiles row (may be None if not created yet)."""
    result = retry_network(
        lambda: get_admin_client()
        .table("patient_health_profiles")
        .select("*")
        .eq("patient_id", patient["id"])
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None
