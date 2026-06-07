# ============================================================
# SHETU AUTH MICROSERVICE — Makefile
#
# WSL / Linux:   make install | make dev | make backend | make frontend
# Windows PS:    .\start-backend.ps1 | .\start-frontend.ps1 | .\start-dev.ps1
# ============================================================

SHELL := /bin/bash
PYTHON := backend/.venv/bin/python
PIP    := backend/.venv/bin/pip

.PHONY: install install-backend install-frontend \
        dev backend frontend \
        win-backend win-frontend win-dev win-install \
        kill-backend \
        clean clean-backend clean-frontend \
        lint lint-backend lint-frontend \
        push help

# ---- INSTALL (WSL/Linux) ------------------------------------

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

# ---- RUN — WSL/Linux ----------------------------------------

dev:
	@echo "→ Starting backend and frontend in parallel..."
	@$(MAKE) -j2 backend frontend

backend: kill-backend
	@echo "→ Starting FastAPI on http://localhost:8000 ..."
	@cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

frontend:
	@echo "→ Starting Next.js on http://localhost:3000 ..."
	@cd frontend && npm run dev

kill-backend:
	@kill $$(ps aux | grep uvicorn | grep -v grep | awk '{print $$2}') 2>/dev/null || true
	@sleep 0.5

# ---- RUN — Windows PowerShell (call from PS terminal) -------
# Usage: make win-backend  OR  just run .\start-backend.ps1 directly

win-install:
	@echo "→ Installing Windows backend venv (first run only)..."
	powershell.exe -ExecutionPolicy Bypass -File backend/start.ps1 -Install
	@echo "→ Installing frontend deps..."
	cd frontend && npm install --silent
	@echo "✓ Windows deps installed."

win-backend:
	@echo "→ Launching backend in PowerShell window..."
	powershell.exe -ExecutionPolicy Bypass -Command \
	  "Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','backend\\start.ps1'"

win-frontend:
	@echo "→ Launching frontend in PowerShell window..."
	powershell.exe -ExecutionPolicy Bypass -Command \
	  "Start-Process powershell -ArgumentList '-NoExit','-Command','Set-Location frontend; npm run dev'"

win-dev:
	@echo "→ Launching backend + frontend in separate PowerShell windows..."
	powershell.exe -ExecutionPolicy Bypass -File start-dev.ps1

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

# ---- ENV SETUP ----------------------------------------------

env-setup:
	@cp -n backend/.env.example backend/.env && echo "✓ backend/.env created" || echo "→ backend/.env already exists"
	@cp -n frontend/.env.local.example frontend/.env.local && echo "✓ frontend/.env.local created" || echo "→ frontend/.env.local already exists"

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
	@echo "  === WSL / Linux ==="
	@echo "  make install        Install all deps (backend + frontend)"
	@echo "  make dev            Run backend + frontend in parallel"
	@echo "  make backend        Kill old uvicorn + start FastAPI (port 8000)"
	@echo "  make frontend       Start Next.js (port 3000)"
	@echo "  make kill-backend   Kill any uvicorn on port 8000"
	@echo ""
	@echo "  === Windows PowerShell ==="
	@echo "  make win-install    Create Windows venv + install deps"
	@echo "  make win-backend    Open PS window running backend"
	@echo "  make win-frontend   Open PS window running frontend"
	@echo "  make win-dev        Open PS windows for both services"
	@echo ""
	@echo "  — OR run PS scripts directly from PowerShell —"
	@echo "  .\\start-backend.ps1     (first run installs .venv-win automatically)"
	@echo "  .\\start-frontend.ps1"
	@echo "  .\\start-dev.ps1         (opens two windows)"
	@echo ""
	@echo "  === Other ==="
	@echo "  make clean          Remove caches and build artifacts"
	@echo "  make lint           Syntax-check both services"
	@echo "  make env-setup      Copy .env.example files"
	@echo "  make push           git add + commit + push"
	@echo ""
