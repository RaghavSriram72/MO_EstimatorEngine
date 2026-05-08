@echo off
echo ========================================
echo   MO EstimatorEngine - Update
echo ========================================
echo.

set "REPO=%~dp0MO_EstimatorEngine"

echo [1/3] Pulling latest code from main...
cd /d "%REPO%"
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git pull failed. Check your connection and credentials.
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing Python backend dependencies...
cd /d "%REPO%\backend"
uv sync

echo.
echo [3/3] Syncing frontend dependencies...
cd /d "%REPO%\frontend"
npm install

echo.
echo ========================================
echo   Update complete!
echo   Run STARTUP.bat to relaunch the app.
echo ========================================
pause
