@echo off
title Lovense PoC — Auto-Start Setup (Full Stack)
echo ============================================
echo   Setting up Windows auto-start
echo   (All services launch on login)
echo ============================================
echo.

cd /d "%~dp0"

:: Install all dependencies first
echo [1/4] Installing dependencies...
cd web-dispatcher && call npm install && cd ..
cd local-listener && call npm install && cd ..
cd gemini-bridge && call npm install && cd ..
echo.

:: Create shortcut in Startup folder
echo [2/4] Creating startup shortcut...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%~dp0start-hidden.vbs"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%STARTUP%\Lovense-PoC.lnk'); $sc.TargetPath = 'wscript.exe'; $sc.Arguments = '\"%VBS%\"'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Lovense PoC Full Stack Auto-Start'; $sc.Save()"

echo.
echo [3/4] Verifying shortcut...
if exist "%STARTUP%\Lovense-PoC.lnk" (
    echo    Shortcut created successfully.
) else (
    echo    ERROR: Shortcut was not created.
    echo    Try running this script as Administrator.
    pause
    exit /b 1
)

echo.
echo [4/4] Testing launch...
echo    Starting all services now to verify...
call "%~dp0start-all.bat"

echo.
echo ============================================
echo   AUTO-START ENABLED (Full Stack)
echo ============================================
echo   On every Windows login, these start silently:
echo     1. Web Dispatcher (port 3000)
echo     2. Local Listener (Lovense bridge)
echo     3. Cloudflare Tunnel (public URL)
echo     4. Gemini Bridge (Mary AI)
echo.
echo   Dashboard: http://localhost:3000/dashboard.html
echo.
echo   To remove: run remove-autostart.bat
echo ============================================
echo.
pause
