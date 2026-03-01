# NearuVibe Build Script (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1 [-Platform win|mac|all]

param(
    [string]$Platform = "win"
)

$ErrorActionPreference = "Stop"

Write-Host "=== NearuVibe Build ===" -ForegroundColor Cyan

# Step 1: Freeze Python orchestrator with PyInstaller
Write-Host "`n[1/3] Freezing orchestrator with PyInstaller..." -ForegroundColor Yellow
Push-Location orchestrator

$venvSP = Join-Path $PWD ".venv\Lib\site-packages"
if (-not (Test-Path $venvSP)) {
    throw "Orchestrator venv not found. Run: cd orchestrator && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
}

# Use global pyinstaller; the .spec adds the venv's site-packages to pathex
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
    Write-Host "Installing PyInstaller globally..." -ForegroundColor Gray
    pip install pyinstaller
}

pyinstaller nearu-orchestrator.spec --noconfirm
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
Pop-Location

Write-Host "Orchestrator frozen to orchestrator/dist/nearu-orchestrator/" -ForegroundColor Green

# Step 2: Build Electron client
Write-Host "`n[2/3] Building Electron client..." -ForegroundColor Yellow
Push-Location client
npm run build
if ($LASTEXITCODE -ne 0) { throw "electron-vite build failed" }
Pop-Location

Write-Host "Client built to client/out/" -ForegroundColor Green

# Step 3: Package with electron-builder
Write-Host "`n[3/3] Packaging with electron-builder ($Platform)..." -ForegroundColor Yellow
Push-Location client

switch ($Platform) {
    "win"  { npx electron-builder --win }
    "mac"  { npx electron-builder --mac }
    "all"  { npx electron-builder --win --mac }
    default { throw "Unknown platform: $Platform (use win, mac, or all)" }
}

if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
Pop-Location

Write-Host "`n=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Output in client/release/" -ForegroundColor Green
