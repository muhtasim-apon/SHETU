# Shetu Auth Microservice

Signup / signin service for the **Shetu** maternal-health platform — *The AI Care Bridge — সেতু*.

A monorepo with two services:

- **`frontend/`** — Next.js 14 (App Router, TypeScript, Tailwind)
- **`backend/`** — FastAPI (Python), talks to Supabase via the `service_role` key

> No AI features on these pages — pure auth + data entry.

---

## 1. Prerequisites

- **Node.js 18+**
- **Python 3.11+**
- A **Supabase** project

---

## 2. Supabase setup

These pages assume your Supabase project already has the schema below. If it
doesn't, run the two SQL blocks in the Supabase **SQL Editor**.

### SQL block A — `profiles` table

```sql
create type user_role as enum ('admin', 'mother', 'patient');

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       user_role not null default 'patient',
  full_name  text not null,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### SQL block B — `handle_new_auth_user` trigger

```sql
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

Also make sure **email confirmation is enabled** under
*Authentication → Sign In / Providers → Email*, so users receive a verification
email after signup.

---

## 3. Quick start

```bash
# 1. Copy env files and fill in your Supabase keys
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# 2. Install dependencies (backend venv + frontend node_modules)
make install

# 3. Run both services
make dev
```

- Backend → http://localhost:8000  (docs at `/docs`)
- Frontend → http://localhost:3000

### Where to get the keys

| Variable | Supabase location |
| --- | --- |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` secret key |

> ⚠️ The `service_role` key is backend-only. Never expose it to the browser.

---

## 4. Backend endpoints

Base prefix: `/api/v1/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/signup` | — | Create user via admin API; Supabase sends a verification email. Returns `201`. |
| `POST` | `/api/v1/auth/signin` | — | Sign in with email + password; returns `access_token` + profile. `401` on bad creds / unconfirmed email. |
| `GET`  | `/api/v1/auth/me` | Bearer token | Verify JWT and return the current user's profile. `401` if missing/invalid. |
| `GET`  | `/health` | — | Liveness check → `{"status": "ok", "service": "shetu-auth-backend"}`. |

All `4xx`/`5xx` responses use the shape `{ "detail": "…" }`.

---

## 5. Folder structure

```
shetu-auth/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app, CORS, health, error handlers
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic settings from .env
│   │   │   └── supabase.py        # admin client + create_anon_client()
│   │   ├── models/
│   │   │   └── user.py            # Pydantic request/response models
│   │   └── routes/
│   │       └── auth.py            # /signup, /signin, /me
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # → redirects to /auth/signin
│   │   │   ├── auth/
│   │   │   │   ├── signup/page.tsx
│   │   │   │   └── signin/page.tsx
│   │   │   └── dashboard/page.tsx # protected placeholder
│   │   └── lib/
│   │       ├── supabase.ts        # browser + server Supabase clients
│   │       └── api.ts             # typed fetch wrapper (signUp/signIn/getMe)
│   ├── package.json
│   └── .env.local.example
├── Makefile
├── .gitignore
└── README.md
```

---

## 6. Auth flow

1. **Signup** → frontend posts to the backend, which calls
   `auth.admin.create_user(..., email_confirm=False)`. The DB trigger inserts a
   `profiles` row; Supabase emails a verification link. The UI shows a green
   "check your email" banner.
2. **Verify** → user clicks the email link.
3. **Signin** → frontend posts to the backend, which calls
   `sign_in_with_password`, fetches the profile, and returns an `access_token`.
   The frontend stores `shetu_token` and `shetu_user` in `localStorage` and
   redirects to `/dashboard`.
4. **Dashboard** → checks `localStorage` for `shetu_token`; redirects to signin
   if absent. "Sign out" clears storage and returns to signin.
