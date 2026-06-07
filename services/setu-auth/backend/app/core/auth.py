"""Authentication dependency — validates the bearer token via Supabase."""
from fastapi import Header, HTTPException, status

from app.core.supabase import get_admin_client, retry_network


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Validate the Authorization bearer token and return the auth user."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()
    try:
        user_response = retry_network(lambda: get_admin_client().auth.get_user(token))
    except Exception:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    user = getattr(user_response, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )

    return {"id": user.id, "email": user.email}
