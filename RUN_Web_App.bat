@echo off
REM ============================================================
REM   Lens Detection - Dataset Collector Web Launcher
REM   Double-click to start local web server and open browser
REM ============================================================
title Lens Detection - Web Dataset Collector

chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   LENS DETECTION - DATASET COLLECTOR
echo ============================================================
echo.
echo   Python yoxlanilir...

set "PY_CMD="
where python >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
) else (
    where py >nul 2>&1
    if not errorlevel 1 (
        set "PY_CMD=py"
    ) else (
        echo [ERROR] Python tapilmadi. Zehmet olmasa Python 3.9+ qurasdirin.
        pause
        exit /b 1
    )
)

echo   Asililiqlar yoxlanilir...
"%PY_CMD%" -m pip install -q -r requirements.txt

echo.
echo   Veb server ise salinir...
echo   Brauzer acilacaq: http://localhost:8000
echo.

"%PY_CMD%" server.py

pause
