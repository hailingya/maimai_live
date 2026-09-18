@echo off
chcp 65001 >nul 2>&1
title maimaiDX Live Song Request
cd /d "e:\zhuomian\maimai_live"

echo.
echo  ========================================
echo    maimaiDX Live Song Requester
echo  ========================================
echo.

set "NODE_EXE=D:\Program Files\nodejs\node.exe"

if not exist "%NODE_EXE%" (
    echo  [ERROR] Node.js not found: %NODE_EXE%
    echo  Please install Node.js in D:\Program Files\nodejs
    echo.
    pause
    exit /b 1
)

echo  Starting server...
echo  Browser will open automatically.
echo.

REM Kill any process using port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo  Phone: connect to same WiFi, then visit:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    setlocal enabledelayedexpansion
    set "ip=%%a"
    set "ip=!ip: =!"
    echo    http://!ip!:3000
    endlocal
)
echo.
echo  Press Ctrl+C to stop.
echo.

"%NODE_EXE%" server.js

pause
