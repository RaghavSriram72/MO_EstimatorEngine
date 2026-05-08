@echo off
echo ========================================
echo   MO EstimatorEngine - Startup
echo ========================================
echo.

set "REPO=%~dp0MO_EstimatorEngine"

echo Starting backend (uvicorn)...
start "MO Backend" cmd /k "cd /d "%REPO%\backend" && uv run uvicorn main:app --reload"

echo Starting frontend (Next.js)...
start "MO Frontend" cmd /k "cd /d "%REPO%\frontend" && npm run dev"

echo.
echo Both servers are launching in separate windows.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo.
