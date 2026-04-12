@echo off
title Lovense PoC — Cloudflare Tunnel
echo ============================================
echo   Starting Cloudflare tunnel to localhost:3000
echo   (free, no account required, very reliable)
echo ============================================
echo.

:: Check if cloudflared exists
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo [setup] cloudflared not found. Downloading...
    echo.

    :: Download cloudflared for Windows
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"

    if not exist "%~dp0cloudflared.exe" (
        echo [ERROR] Download failed.
        echo Please download manually from:
        echo   https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
        echo Save it to this folder as cloudflared.exe
        pause
        exit /b 1
    )
    echo [setup] Downloaded cloudflared.exe
    echo.
)

echo [tunnel] Creating public URL...
echo [tunnel] Look for the line that says:
echo          https://xxxxx.trycloudflare.com
echo [tunnel] Give THAT URL to the other AI, appending /trigger-ai
echo.

:: Use local copy if available, otherwise use PATH version
if exist "%~dp0cloudflared.exe" (
    "%~dp0cloudflared.exe" tunnel --url http://localhost:3000
) else (
    cloudflared tunnel --url http://localhost:3000
)
