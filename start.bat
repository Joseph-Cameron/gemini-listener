@echo off
title Lovense PoC Launcher
echo ============================================
echo   Lovense PoC — Starting Services
echo ============================================
echo.

cd /d "%~dp0"

:: Install dependencies if needed
if not exist "web-dispatcher\node_modules" (
    echo [setup] Installing web-dispatcher dependencies...
    cd web-dispatcher && npm install && cd ..
)
if not exist "local-listener\node_modules" (
    echo [setup] Installing local-listener dependencies...
    cd local-listener && npm install && cd ..
)

echo.
echo [1/2] Starting Web Dispatcher on port 3000...
start "Lovense Dispatcher" /min cmd /c "cd /d "%~dp0web-dispatcher" && node server.js"

:: Give the dispatcher a moment to bind the port
timeout /t 2 /nobreak >nul

echo [2/2] Starting Local Listener...
start "Lovense Listener" /min cmd /c "cd /d "%~dp0local-listener" && node listener.js"

echo.
echo ============================================
echo   Both services running (minimized).
echo   Dashboard: http://localhost:3000/dashboard.html
echo   To stop: close the two minimized windows.
echo ============================================
echo.
pause
