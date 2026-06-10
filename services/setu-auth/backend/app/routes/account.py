"""Account profile — credentials display, basic-field editing, and avatar upload.

Avatar upload and `profiles` writes go through the service-role admin client so
they bypass storage/table RLS (no extra policies or schema changes required).
The avatar URL is stored on the Supabase Auth user's `user_metadata` (again, no
schema change to `profiles`).
"""
import base64
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.core.supabase import get_admin_client, retry_network

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/account", tags=["account"])

_AVATAR_BUCKET = "avatars"
_MIME_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}


class AccountResponse(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    avatar_url: Optional[str] = None


class AccountUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None


class AvatarUpload(BaseModel):
    content_type: str
    data_base64: str  # raw base64 (no data: prefix)


def _avatar_url_from_metadata(admin, user_id: str) -> Optional[str]:
    try:
        res = admin.auth.admin.get_user_by_id(user_id)
        meta = getattr(res.user, "user_metadata", None) or {}
        return meta.get("avatar_url")
    except Exception as exc:  # noqa: BLE001
        logger.warning("avatar metadata read failed: %s", exc)
        return None


@router.get("", response_model=AccountResponse)
async def get_account(current_user: dict = Depends(get_current_user)):
    admin = get_admin_client()
    user_id = current_user["id"]
    row = {}
    try:
        res = retry_network(
            lambda: admin.table("profiles").select("*").eq("id", user_id).single().execute()
        )
        row = res.data or {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("profiles read failed: %s", exc)

    return AccountResponse(
        id=user_id,
        email=row.get("email") or current_user.get("email"),
        full_name=row.get("full_name"),
        phone=row.get("phone"),
        role=row.get("role"),
        avatar_url=_avatar_url_from_metadata(admin, user_id),
    )


@router.put("", response_model=AccountResponse)
async def update_account(body: AccountUpdate, current_user: dict = Depends(get_current_user)):
    admin = get_admin_client()
    user_id = current_user["id"]
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        try:
            retry_network(
                lambda: admin.table("profiles").update(patch).eq("id", user_id).execute()
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("profiles update failed: %s", exc)
            raise HTTPException(status_code=500, detail="Could not save profile.")
    return await get_account(current_user)


@router.post("/avatar", response_model=AccountResponse)
async def upload_avatar(body: AvatarUpload, current_user: dict = Depends(get_current_user)):
    ext = _MIME_EXT.get(body.content_type.lower())
    if not ext:
        raise HTTPException(status_code=400, detail="Unsupported image type.")
    try:
        raw = base64.b64decode(body.data_base64)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid image data.")

    admin = get_admin_client()
    user_id = current_user["id"]
    path = f"{user_id}/avatar.{ext}"

    try:
        storage = admin.storage.from_(_AVATAR_BUCKET)
        # upsert so re-uploads overwrite the previous avatar
        retry_network(
            lambda: storage.upload(
                path,
                raw,
                {"content-type": body.content_type, "upsert": "true"},
            )
        )
        public_url = storage.get_public_url(path)
    except Exception as exc:  # noqa: BLE001
        logger.error("avatar upload failed: %s", exc)
        raise HTTPException(status_code=500, detail="Avatar upload failed.")

    # Cache-bust so the new image shows immediately.
    public_url = f"{public_url}?v={user_id[:8]}-{ext}"
    try:
        admin.auth.admin.update_user_by_id(user_id, {"user_metadata": {"avatar_url": public_url}})
    except Exception as exc:  # noqa: BLE001
        logger.error("avatar metadata write failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not save avatar URL.")

    return await get_account(current_user)
