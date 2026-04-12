@echo off
:: Lovense PoC — Firewall Setup (Run as Administrator)
echo ============================================
echo   Adding Windows Firewall Rules
echo   TCP 3000 (Dispatcher) + TCP 20010 (Lovense)
echo ============================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click this file and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

:: Clean up old rules
netsh advfirewall firewall delete rule name="Lovense PoC - Dispatcher Inbound" >nul 2>&1
netsh advfirewall firewall delete rule name="Lovense PoC - Dispatcher Outbound" >nul 2>&1
netsh advfirewall firewall delete rule name="Lovense PoC - Node.js Inbound" >nul 2>&1
netsh advfirewall firewall delete rule name="Lovense PoC - Node.js Outbound" >nul 2>&1
netsh advfirewall firewall delete rule name="Lovense PoC - Lovense API Loopback" >nul 2>&1

:: Port 3000 — Dispatcher (inbound + outbound)
echo [1/3] Adding inbound rule for TCP 3000 (Dispatcher)...
netsh advfirewall firewall add rule ^
    name="Lovense PoC - Dispatcher Inbound" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3000 ^
    enable=yes ^
    profile=any

echo [2/3] Adding outbound rule for TCP 3000 (Dispatcher)...
netsh advfirewall firewall add rule ^
    name="Lovense PoC - Dispatcher Outbound" ^
    dir=out ^
    action=allow ^
    protocol=TCP ^
    localport=3000 ^
    enable=yes ^
    profile=any

:: Port 20010 — Lovense Connect LAN API loopback
echo [3/3] Adding loopback rule for TCP 20010 (Lovense API)...
netsh advfirewall firewall add rule ^
    name="Lovense PoC - Lovense API Loopback" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=20010 ^
    enable=yes ^
    profile=any

echo.
echo ============================================
echo   Rules added:
echo     TCP 3000 inbound  (Dispatcher)
echo     TCP 3000 outbound (Dispatcher)
echo     TCP 20010 inbound (Lovense LAN API)
echo ============================================
echo.

:: Also update listener to use 127.0.0.1 instead of localhost
echo NOTE: If localhost still fails, the listener
echo is already configured to accept 127.0.0.1
echo as a fallback.
echo.
pause
