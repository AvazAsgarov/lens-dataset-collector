@echo off
REM ============================================================
REM   Lens Dataset Collector - local web launcher
REM   Double-click to start the local server and open the browser
REM ============================================================
title Lens Dataset Collector
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo   LENS DATASET COLLECTOR
echo ============================================================
echo.
echo   Python yoxlanilir...

REM "where python" also finds the Microsoft Store alias, so actually run the interpreter.
set "PY_CMD="
python -c "import sys" >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD (
    py -3 -c "import sys" >nul 2>&1 && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    echo   [XETA] Python tapilmadi. Python 3.9+ qurasdirin: https://www.python.org/downloads/
    echo          Qurasdirarken "Add python.exe to PATH" secimini isaretleyin.
    pause
    exit /b 1
)

%PY_CMD% -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
    echo   [XETA] Python 3.9 ve ya daha yeni versiya lazimdir.
    %PY_CMD% --version
    pause
    exit /b 1
)

echo   Asililiqlar yoxlanilir...
%PY_CMD% -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo   [XETA] Asililiqlar qurasdirila bilmedi. Internet baglantisini yoxlayin.
    pause
    exit /b 1
)

echo.
echo   Veb server ise salinir: http://localhost:8000
echo.
%PY_CMD% server.py

pause
