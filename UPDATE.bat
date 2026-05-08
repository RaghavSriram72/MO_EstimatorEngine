@echo off
echo ========================================
echo   MO EstimatorEngine - Update
echo ========================================
echo.

echo [1/3] Pulling latest code from main...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git pull failed. Check your connection and credentials.
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing Python backend dependencies...
cd backend
uv sync
cd ..

echo.
echo [3/3] Syncing frontend dependencies...
cd frontend
npm install
cd ..

echo.
echo ========================================
echo   Update complete!
echo   Run STARTUP.bat to relaunch the app.
echo ========================================
pause
