@echo off
setlocal EnableDelayedExpansion
echo ========================================
echo   MO EstimatorEngine - Setup
echo ========================================
echo.
echo NOTE: Do NOT run this script as Administrator.
echo.

:: ── Helper: reload PATH from registry so installs take effect immediately ──
call :refresh_path

:: ── Resolve winget path (App Execution Alias may not be in PATH) ─────────────
set "WINGET="
"%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe" --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "WINGET=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
) else (
    winget --version >nul 2>&1
    if %ERRORLEVEL% equ 0 set "WINGET=winget"
)

if not defined WINGET (
    echo WARNING: winget not found. If any tool below is missing, install it manually.
    echo   Git:    https://git-scm.com/download/win
    echo   Node:   https://nodejs.org
    echo   Python: https://www.python.org/downloads
    echo   uv:     https://docs.astral.sh/uv/getting-started/installation
    echo.
)

:: ── Git ─────────────────────────────────────────────────────────────────────
git --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if not defined WINGET (
        echo ERROR: Git not found and winget unavailable. Install Git manually: https://git-scm.com/download/win
        pause & exit /b 1
    )
    echo [INSTALL] Git not found. Installing...
    "%WINGET%" install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 ( echo ERROR: Failed to install Git. & pause & exit /b 1 )
    call :refresh_path
    echo [OK] Git installed.
) else (
    echo [OK] Git already installed.
)

:: ── Node.js ─────────────────────────────────────────────────────────────────
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if not defined WINGET (
        echo ERROR: Node.js not found and winget unavailable. Install Node.js manually: https://nodejs.org
        pause & exit /b 1
    )
    echo [INSTALL] Node.js not found. Installing...
    "%WINGET%" install --id OpenJS.NodeJS.LTS -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 ( echo ERROR: Failed to install Node.js. & pause & exit /b 1 )
    call :refresh_path
    echo [OK] Node.js installed.
) else (
    echo [OK] Node.js already installed.
)

:: ── Python ──────────────────────────────────────────────────────────────────
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if not defined WINGET (
        echo ERROR: Python not found and winget unavailable. Install Python manually: https://www.python.org/downloads
        pause & exit /b 1
    )
    echo [INSTALL] Python not found. Installing...
    "%WINGET%" install --id Python.Python.3.11 -e --source winget --accept-source-agreements --accept-package-agreements
    if %ERRORLEVEL% neq 0 ( echo ERROR: Failed to install Python. & pause & exit /b 1 )
    call :refresh_path
    echo [OK] Python installed.
) else (
    echo [OK] Python already installed.
)

:: ── uv ──────────────────────────────────────────────────────────────────────
uv --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INSTALL] uv not found. Installing...
    powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    if %ERRORLEVEL% neq 0 ( echo ERROR: Failed to install uv. & pause & exit /b 1 )
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
    pause & exit /b 1
)
cd MO_EstimatorEngine

:: ── Backend deps ────────────────────────────────────────────────────────────
echo.
echo [2/3] Installing Python backend dependencies...
cd backend
uv sync
if %ERRORLEVEL% neq 0 ( echo ERROR: uv sync failed. & pause & exit /b 1 )
cd ..

:: ── Frontend deps ───────────────────────────────────────────────────────────
echo.
echo [3/3] Installing frontend dependencies...
cd frontend
npm install
if %ERRORLEVEL% neq 0 ( echo ERROR: npm install failed. & pause & exit /b 1 )
cd ..

echo.
echo ========================================
echo   Setup complete!
echo   Run STARTUP.bat to launch the app.
echo ========================================
pause
exit /b 0

:: ── Subroutine: reload PATH from registry ───────────────────────────────────
:refresh_path
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH if defined USR_PATH set "PATH=%SYS_PATH%;%USR_PATH%"
if defined SYS_PATH if not defined USR_PATH set "PATH=%SYS_PATH%"
exit /b 0
