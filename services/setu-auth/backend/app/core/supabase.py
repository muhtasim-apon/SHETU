"""Supabase client factories.

`supabase_admin` uses the service_role key and bypasses RLS — it is used for
admin operations (creating users, reading any profile). `create_anon_client`
returns a client built with the anon key, used for password sign-in and JWT
verification on behalf of an end user.
"""
from supabase import Client, create_client

from app.core.config import settings

# Admin client (service_role) — full access, never expose to the browser.
supabase_admin: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)


def create_anon_client() -> Client:
    """Build a fresh anon-key client for user-scoped auth operations."""
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
    )
