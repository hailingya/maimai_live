@echo off
title maimaiDX Live Song Requester
cd /d "%~dp0"

echo.
echo  ========================================
echo    maimaiDX Live Song Requester
echo  ========================================
echo.

set "NODE_EXE=D:\Program Files\nodejs\node.exe"

if not exist "%NODE_EXE%" (
    echo [ERROR] Node.js not found at: %NODE_EXE%
    echo Please check the installation path.
    echo.
    pause
    exit /b 1
)

if not exist "maimai_data.json" (
    echo [ERROR] maimai_data.json not found
    echo Please put maimai_data.json in this folder.
    echo.
    pause
    exit /b 1
)

if not exist "server.js" (
    echo [ERROR] server.js not found
    echo.
    pause
    exit /b 1
)

echo Starting server...
echo Browser will open automatically.
echo.

REM Kill any process using port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Mobile access (same WiFi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    setlocal enabledelayedexpansion
    set "ip=%%a"
    set "ip=!ip: =!"
    echo   http://!ip!:3000
    endlocal
)
echo.
echo Press Ctrl+C to stop.
echo.

"%NODE_EXE%" server.js

pause
