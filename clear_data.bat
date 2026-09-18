@echo off
title clean
cd /d "%~dp0"

echo.
echo  ========================================
echo    clean
echo  ========================================
echo.


choice /c yn /m "yes or not"
if errorlevel 2 (
  echo c。
  pause
  exit /b 0
)

echo.
echo [1/3] c hot_songs.json ...
if exist "hot_songs.json" (
  echo {} > "hot_songs.json"
  echo   c。
) else (
  echo   n。
)

echo.
echo [2/3] c...
set "PORT=3000"
set "BASE=http://localhost:%PORT%"

powershell -Command ^
  "try {" ^
  "  $r = Invoke-WebRequest -Uri '%BASE%/api/hot/reset' -Method POST -UseBasicParsing -TimeoutSec 3;" ^
  "  Write-Host '  c' " ^
  "} catch { Write-Host '  s' }"

powershell -Command ^
  "try {" ^
  "  $r = Invoke-WebRequest -Uri '%BASE%/api/playlist/clear' -Method POST -UseBasicParsing -TimeoutSec 3;" ^
  "  Write-Host '  c " ^
  "} catch { Write-Host '  s' }"

echo.
echo [3/3] done！
echo.

pause
