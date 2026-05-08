@echo off
echo ========================================
echo   MO EstimatorEngine - Startup
echo ========================================
echo.

echo Starting backend (uvicorn)...
start cmd /k "cd /d "%~dp0backend" && uv run uvicorn main:app --reload"

echo Starting frontend (Next.js)...
start cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers are launching in separate windows.
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo.
