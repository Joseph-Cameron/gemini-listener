@echo off
echo Stopping all Lovense PoC services...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
echo All services stopped.
pause
