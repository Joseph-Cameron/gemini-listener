@echo off
title Lovense PoC — Remove Auto-Start
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if exist "%STARTUP%\Lovense-PoC.lnk" (
    del "%STARTUP%\Lovense-PoC.lnk"
    echo Auto-start removed.
) else (
    echo No auto-start shortcut found.
)

:: Also kill any running instances
taskkill /fi "WINDOWTITLE eq Lovense*" /f >nul 2>&1
echo Any running services have been stopped.
pause
