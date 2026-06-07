# """Supabase client factories.

# `supabase_admin` uses the service_role key and bypasses RLS — it is used for
# admin operations (creating users, reading any profile). `create_anon_client`
# returns a client built with the anon key, used for password sign-in and JWT
# verification on behalf of an end user.
# """
# from supabase import Client, create_client

# from app.core.config import settings

# # Admin client (service_role) — full access, never expose to the browser.
# supabase_admin: Client = create_client(
#     settings.SUPABASE_URL,
#     settings.SUPABASE_SERVICE_ROLE_KEY,
# )


# def create_anon_client() -> Client:
#     """Build a fresh anon-key client for user-scoped auth operations."""
#     return create_client(
#         settings.SUPABASE_URL,
#         settings.SUPABASE_ANON_KEY,
#     )
"""Supabase client factories with retry + timeout for slow networks."""

import time
import logging
from typing import Callable, TypeVar

from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions
from app.core.config import settings

logger = logging.getLogger(__name__)
T = TypeVar("T")


def _retry(fn: Callable[[], T], attempts: int = 3, delay: float = 3.0) -> T:
    """Retry fn with exponential back-off. Raises last exception on failure."""
    last_exc: Exception = RuntimeError("No attempts made")
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if i < attempts - 1:
                wait = delay * (2 ** i)
                logger.warning(
                    "Supabase connection attempt %d/%d failed (%s). "
                    "Retrying in %.0fs...",
                    i + 1, attempts, exc, wait,
                )
                time.sleep(wait)
    raise last_exc


# Public retry wrapper for actual network operations (sign-in, queries, …).
# On slow/restricted networks the first TLS handshake to Supabase can time out
# ("_ssl.c:983: The handshake operation timed out"); retrying recovers it.
def retry_network(fn: Callable[[], T]) -> T:
    return _retry(fn, attempts=2, delay=2.0)


def _client_options() -> ClientOptions:
    # Generous timeouts so a slow handshake doesn't abort mid-request.
    return ClientOptions(
        postgrest_client_timeout=60,
        storage_client_timeout=60,
        function_client_timeout=60,
    )


def _make_client(url: str, key: str) -> Client:
    # Only 1 attempt for client creation — network won't recover mid-request.
    # Use retry_network() for actual queries where transient errors matter.
    return _retry(lambda: create_client(url, key, options=_client_options()), attempts=1)


# ── Admin client (service_role) — lazy so startup never hard-crashes ─────────
_admin_client: Client | None = None


def get_admin() -> Client:
    global _admin_client
    if _admin_client is None:
        logger.info("Creating Supabase admin client...")
        _admin_client = _make_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("Supabase admin client ready.")
    return _admin_client


# Backward-compatible alias used by auth.py
supabase_admin: Client = None  # type: ignore  (populated on first request)


def create_anon_client() -> Client:
    """Fresh anon-key client for each user-scoped request."""
    return _make_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


# ── Shetu Saathi (patient module) aliases ────────────────────────────────────
def get_admin_client() -> Client:
    """Alias for get_admin() used by the patient (Saathi) modules."""
    return get_admin()


def get_user_client(jwt: str) -> Client:
    """User-scoped Supabase client (anon key + user JWT)."""
    client = _make_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(jwt)
    return client