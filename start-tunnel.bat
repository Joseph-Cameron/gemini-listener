@echo off
title Lovense PoC — Public Tunnel
echo ============================================
echo   Starting public tunnel to localhost:3000
echo   (no account required)
echo ============================================
echo.

:: Install localtunnel if needed
where lt >nul 2>&1
if %errorlevel% neq 0 (
    echo [setup] Installing localtunnel...
    call npm install -g localtunnel
)

echo.
echo [tunnel] Creating public URL...
echo [tunnel] Give this URL to Gemini:
echo.
lt --port 3000
