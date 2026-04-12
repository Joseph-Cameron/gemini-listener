@echo off
title Gemini Bridge — Lovense PoC
echo ============================================
echo   Gemini Bridge — Function Calling
echo   Gemini AI  -→  Lovense Hardware
echo ============================================
echo.

:: Check for API key
if "%GEMINI_API_KEY%"=="" (
    echo  You need a Gemini API key ^(free^).
    echo.
    echo  1. Go to: https://aistudio.google.com/apikey
    echo  2. Click "Create API Key"
    echo  3. Copy the key
    echo  4. Run this command, replacing YOUR_KEY:
    echo.
    echo     set GEMINI_API_KEY=YOUR_KEY
    echo.
    echo  5. Then run this bat file again.
    echo.
    set /p GEMINI_API_KEY="  Or paste your API key here now: "
    if "%GEMINI_API_KEY%"=="" (
        echo  No key provided. Exiting.
        pause
        exit /b 1
    )
)

:: Install deps if needed
if not exist "%~dp0gemini-bridge\node_modules" (
    echo [setup] Installing dependencies...
    cd /d "%~dp0gemini-bridge"
    npm install
    echo.
)

:: Run the bridge
cd /d "%~dp0gemini-bridge"
node bridge.js
pause
