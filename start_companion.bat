@echo off
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo Companion is not installed. Run install_companion.bat first.
  exit /b 1
)

set "ASTRA_DATABASE_URL=sqlite+aiosqlite:///../data/companion.db"
set "ASTRA_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://astra-ai-786.vercel.app"

start "ASTRA Windows Companion" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m app.main"
endlocal
