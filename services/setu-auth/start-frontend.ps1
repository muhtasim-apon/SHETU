# Run frontend from repo root
# Usage: .\start-frontend.ps1
Set-Location "$PSScriptRoot\frontend"
Write-Host "Starting Next.js on http://localhost:3000 ..." -ForegroundColor Green
npm run dev
