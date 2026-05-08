@echo off
echo ========================================
echo   MO EstimatorEngine - Setup
echo ========================================
echo.

echo [1/3] Cloning repository...
git clone https://github.com/RaghavSriram72/MO_EstimatorEngine
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git clone failed. Ensure git is installed and accessible.
    pause
    exit /b 1
)
cd MO_EstimatorEngine

echo.
echo [2/3] Installing Python backend dependencies...
cd backend
uv sync
if %ERRORLEVEL% neq 0 (
    echo ERROR: uv sync failed.
    echo Install uv: https://docs.astral.sh/uv/getting-started/installation/
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Installing frontend dependencies...
cd frontend
npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed. Ensure Node.js is installed.
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo   Setup complete!
echo   Run STARTUP.bat to launch the app.
echo ========================================
pause
