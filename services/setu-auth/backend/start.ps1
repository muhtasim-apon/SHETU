# PowerShell backend starter — creates Windows venv on first run
# Usage: .\start.ps1   (from backend folder)
#        .\start-backend.ps1  (from repo root)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Venv   = ".venv-win"
$Python = "$Venv\Scripts\python.exe"
$Pip    = "$Venv\Scripts\pip.exe"
$Uvi    = "$Venv\Scripts\uvicorn.exe"

if (-not (Test-Path $Uvi)) {
    Write-Host ""
    Write-Host "First run: creating Windows Python venv..." -ForegroundColor Cyan
    python -m venv $Venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 'python' not found. Install Python 3.11+ from python.org" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "Installing packages (takes ~2 minutes)..." -ForegroundColor Cyan
    & $Pip install --upgrade pip --quiet
    & $Pip install -r requirements.txt
    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Starting backend on http://localhost:8000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""
& $Uvi app.main:app --host 0.0.0.0 --port 8000 --reload
