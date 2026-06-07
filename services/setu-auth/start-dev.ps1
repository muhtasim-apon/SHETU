# Start backend + frontend in separate PowerShell windows
# Usage: .\start-dev.ps1

$Root = $PSScriptRoot

Write-Host "Starting backend in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; .\start.ps1"

Write-Host "Starting frontend in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev"

Write-Host ""
Write-Host "Both services starting in separate windows." -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8000/health" -ForegroundColor White
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
