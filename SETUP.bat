@echo off
setlocal EnableDelayedExpansion
echo ========================================
echo   MO EstimatorEngine - Setup
echo ========================================
echo.

:: ── Helper: reload PATH from registry so installs take effect immediately ──
call :refresh_path

:: ── Check winget ────────────────────────────────────────────────────────────
where winget >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: winget is not available on this machine.
    echo Please update Windows or install App Installer from the Microsoft Store.
    pause
    exit /b 1
)

:: ── Git ─────────────────────────────────────────────────────────────────────
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALL] Git not found. Installing...
    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install Git.
        pause
        exit /b 1
    )
    call :refresh_path
    echo [OK] Git installed.
) else (
    echo [OK] Git already installed.
)

:: ── Node.js ─────────────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALL] Node.js not found. Installing...
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install Node.js.
        pause
        exit /b 1
    )
    call :refresh_path
    echo [OK] Node.js installed.
) else (
    echo [OK] Node.js already installed.
)

:: ── Python ──────────────────────────────────────────────────────────────────
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALL] Python not found. Installing...
    winget install --id Python.Python.3.11 -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install Python.
        pause
        exit /b 1
    )
    call :refresh_path
    echo [OK] Python installed.
) else (
    echo [OK] Python already installed.
)

:: ── uv ──────────────────────────────────────────────────────────────────────
where uv >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALL] uv not found. Installing...
    powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install uv.
        pause
        exit /b 1
    )
    call :refresh_path
    echo [OK] uv installed.
) else (
    echo [OK] uv already installed.
)

echo.
:: ── Clone repo ──────────────────────────────────────────────────────────────
echo [1/3] Cloning repository...
git clone https://github.com/RaghavSriram72/MO_EstimatorEngine
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git clone failed.
    pause
    exit /b 1
)
cd MO_EstimatorEngine

:: ── Backend deps ────────────────────────────────────────────────────────────
echo.
echo [2/3] Installing Python backend dependencies...
cd backend
uv sync
if %ERRORLEVEL% neq 0 (
    echo ERROR: uv sync failed.
    pause
    exit /b 1
)
cd ..

:: ── Frontend deps ────────────────────────────────────────────────────────────
echo.
echo [3/3] Installing frontend dependencies...
cd frontend
npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed.
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
exit /b 0

:: ── Subroutine: reload PATH from registry ────────────────────────────────────
:refresh_path
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=%SYS_PATH%;%USR_PATH%"
if defined SYS_PATH if not defined USR_PATH set "PATH=%SYS_PATH%"
exit /b 0
