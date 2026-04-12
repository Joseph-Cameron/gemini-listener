@echo off
title Lovense PoC — Full Stack Launcher
echo ============================================
echo   Lovense PoC — Starting ALL Services
echo ============================================
echo.

cd /d "%~dp0"

:: Install all dependencies if needed
if not exist "web-dispatcher\node_modules" (
    echo [setup] Installing web-dispatcher dependencies...
    cd web-dispatcher && call npm install && cd ..
)
if not exist "local-listener\node_modules" (
    echo [setup] Installing local-listener dependencies...
    cd local-listener && call npm install && cd ..
)
if not exist "gemini-bridge\node_modules" (
    echo [setup] Installing gemini-bridge dependencies...
    cd gemini-bridge && call npm install && cd ..
)

:: Set Gemini API key
set GEMINI_API_KEY=AIzaSyCFyVfVyClZZjwrfTdJgq4HfACf2xy6-P0

echo.
echo [1/4] Starting Web Dispatcher (port 3000)...
start "Lovense Dispatcher" /min cmd /k "cd /d "%~dp0web-dispatcher" && node server.js"
timeout /t 3 /nobreak >nul

echo [2/4] Starting Local Listener...
start "Lovense Listener" /min cmd /k "cd /d "%~dp0local-listener" && node listener.js"
timeout /t 2 /nobreak >nul

echo [3/4] Starting Cloudflare Tunnel...
if exist "%~dp0cloudflared.exe" (
    start "Cloudflare Tunnel" /min cmd /k "cd /d "%~dp0" && cloudflared.exe tunnel --url http://localhost:3000"
    timeout /t 3 /nobreak >nul
) else (
    echo    [SKIP] cloudflared.exe not found — tunnel not started
)

echo [4/4] Starting Gemini Bridge (Mary)...
start "Gemini Bridge" cmd /k "cd /d "%~dp0gemini-bridge" && set GEMINI_API_KEY=%GEMINI_API_KEY% && node bridge.js"

echo.
echo ============================================
echo   ALL SERVICES RUNNING
echo ============================================
echo   Dispatcher:  http://localhost:3000
echo   Dashboard:   http://localhost:3000/dashboard.html
echo   Tunnel:      Check "Cloudflare Tunnel" window for URL
echo   Gemini:      Type in the "Gemini Bridge" window
echo.
echo   4 windows opened:
echo     - Lovense Dispatcher (minimized)
echo     - Lovense Listener (minimized)
echo     - Cloudflare Tunnel (minimized)
echo     - Gemini Bridge (interactive — type here)
echo.
echo   To stop all: run stop.bat
echo ============================================
echo.
pause
