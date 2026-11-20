@echo off
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo Companion is not installed. Run install_companion.bat first.
  exit /b 1
)

start "ASTRA Windows Companion" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m app.main"
endlocal
