@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if errorlevel 1 (
  echo Python Launcher was not found. Install Python 3.11, then run this installer again.
  exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
  py -3.11 -m venv backend\.venv
  if errorlevel 1 exit /b 1
)

backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-vercel.txt
if errorlevel 1 (
  echo Companion dependencies could not be installed.
  exit /b 1
)

echo ASTRA companion is installed. Run start_companion.bat to start it.
endlocal
