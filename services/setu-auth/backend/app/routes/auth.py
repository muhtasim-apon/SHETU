"""Authentication routes: signup, signin, and current-user lookup."""
from fastapi import APIRouter, Header, HTTPException, status

from app.core.supabase import create_anon_client, get_admin, retry_network
from app.models.user import (
    AuthResponse,
    MessageResponse,
    SignInRequest,
    SignUpRequest,
    UserProfile,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _fetch_profile(user_id: str, email: str | None = None) -> UserProfile:
    """Load a profile row (inserted by the DB trigger) and shape it.

    The profiles table stores email, so prefer that; fall back to the
    caller-supplied email (e.g. the value from the auth token) if absent.
    """
    result = retry_network(
        lambda: get_admin()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    row = result.data
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found.",
        )
    return UserProfile(
        id=row["id"],
        email=row.get("email") or email,
        role=row["role"],
        full_name=row["full_name"],
        phone=row.get("phone"),
        created_at=row.get("created_at"),
    )


@router.post(
    "/signup",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(body: SignUpRequest) -> MessageResponse:
    """Register via the public sign-up flow so Supabase emails a link.

    NOTE: the admin API (auth.admin.create_user) creates the user *silently*
    and never sends a confirmation email. The normal sign_up() flow on an
    anon client both creates the auth user (firing the profiles trigger) and
    triggers Supabase's verification email.
    """
    anon = create_anon_client()
    try:
        result = retry_network(
            lambda: anon.auth.sign_up(
                {
                    "email": body.email,
                    "password": body.password,
                    "options": {
                        "data": {
                            "role": body.role,
                            "full_name": body.full_name,
                            "phone": body.phone,
                        }
                    },
                }
            )
        )
    except Exception as exc:  # noqa: BLE001 — surface a clean 400 to the client
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_clean_error(exc),
        )

    if not result.user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign up failed. Please try again.",
        )

    return MessageResponse(message="Verification email sent. Please check inbox.")


@router.post("/signin", response_model=AuthResponse)
def signin(body: SignInRequest) -> AuthResponse:
    """Sign in with email + password and return a token plus profile."""
    anon = create_anon_client()
    try:
        result = retry_network(
            lambda: anon.auth.sign_in_with_password(
                {"email": body.email, "password": body.password}
            )
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_clean_error(exc),
        )

    if not result.session or not result.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    profile = _fetch_profile(result.user.id, body.email)
    return AuthResponse(
        access_token=result.session.access_token,
        token_type="bearer",
        user=profile,
    )


@router.get("/me", response_model=UserProfile)
def me(authorization: str | None = Header(default=None)) -> UserProfile:
    """Return the profile for the bearer token in the Authorization header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()
    anon = create_anon_client()
    try:
        user_response = retry_network(lambda: anon.auth.get_user(token))
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

    return _fetch_profile(user.id, user.email)


def _clean_error(exc: Exception) -> str:
    """Map raw Supabase/auth errors to a short, user-safe message."""
    message = getattr(exc, "message", None) or str(exc)
    lowered = message.lower()
    if "already" in lowered and "registered" in lowered:
        return "An account with this email already exists."
    if "password" in lowered and ("weak" in lowered or "least" in lowered):
        return "Password is too weak. Use at least 8 characters."
    if "email not confirmed" in lowered:
        return "Email not confirmed. Please verify your email first."
    if "invalid login credentials" in lowered:
        return "Invalid email or password."
    return message
