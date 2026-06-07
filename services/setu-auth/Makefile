# ============================================================
# SHETU AUTH MICROSERVICE — Makefile
# Usage: make install | make dev | make backend | make frontend
#        make clean   | make push | make lint
# ============================================================

SHELL := /bin/bash
PYTHON := backend/.venv/bin/python
PIP    := backend/.venv/bin/pip

.PHONY: install install-backend install-frontend \
        dev backend frontend \
        clean clean-backend clean-frontend \
        lint lint-backend lint-frontend \
        push help

# ---- INSTALL ------------------------------------------------

install: install-backend install-frontend
	@echo "✓ All dependencies installed."

install-backend:
	@echo "→ Creating Python venv and installing backend deps..."
	@cd backend && python3 -m venv .venv && \
	  .venv/bin/pip install --quiet --upgrade pip && \
	  .venv/bin/pip install --quiet -r requirements.txt
	@echo "✓ Backend installed."

install-frontend:
	@echo "→ Installing frontend deps..."
	@cd frontend && npm install --silent
	@echo "✓ Frontend installed."

# ---- RUN (dev) ----------------------------------------------

dev:
	@echo "→ Starting backend and frontend in parallel..."
	@$(MAKE) -j2 backend frontend

backend:
	@echo "→ Starting FastAPI (auth + Saathi patient API) on http://localhost:8000 ..."
	@cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

frontend:
	@echo "→ Starting Next.js on http://localhost:3000 ..."
	@cd frontend && npm run dev

# ---- CLEAN --------------------------------------------------

clean: clean-backend clean-frontend
	@find . -name ".DS_Store" -delete 2>/dev/null || true
	@echo "✓ Project cleaned."

clean-backend:
	@find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find backend -name "*.pyc" -delete 2>/dev/null || true
	@find backend -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ Backend cleaned."

clean-frontend:
	@rm -rf frontend/.next frontend/node_modules/.cache 2>/dev/null || true
	@echo "✓ Frontend cache cleaned."

# ---- LINT ---------------------------------------------------

lint: lint-backend lint-frontend

lint-backend:
	@cd backend && find app -name "*.py" -print0 | xargs -0 .venv/bin/python -m py_compile && \
	  echo "✓ Backend syntax OK (auth + saathi)"

lint-frontend:
	@cd frontend && npm run lint --silent && echo "✓ Frontend lint OK"

# ---- ENV SETUP (first-time helper) --------------------------

env-setup:
	@cp -n backend/.env.example backend/.env && echo "✓ backend/.env created" || echo "→ backend/.env already exists"
	@cp -n frontend/.env.local.example frontend/.env.local && echo "✓ frontend/.env.local created" || echo "→ frontend/.env.local already exists"
	@echo ""
	@echo "  Fill in your Supabase credentials in:"
	@echo "    backend/.env"
	@echo "    frontend/.env.local"

# ---- GIT PUSH -----------------------------------------------

push:
	@git add -A
	@git commit -m "feat: shetu auth microservice — signup/signin"
	@git push
	@echo "✓ Pushed."

# ---- HELP ---------------------------------------------------

help:
	@echo ""
	@echo "  Shetu Auth Microservice"
	@echo ""
	@echo "  make install        Install all deps (backend + frontend)"
	@echo "  make dev            Run backend + frontend in parallel"
	@echo "  make backend        Run FastAPI only (port 8000)"
	@echo "  make frontend       Run Next.js only (port 3000)"
	@echo "  make clean          Remove caches and build artifacts"
	@echo "  make lint           Syntax-check both services"
	@echo "  make env-setup      Copy .env.example files"
	@echo "  make push           git add + commit + push"
	@echo ""