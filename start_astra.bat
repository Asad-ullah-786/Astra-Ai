@echo off
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo The Python virtual environment is missing.
  echo Create it with: py -3.11 -m venv backend\.venv
  echo Then install: backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js npm was not found on PATH. Install Node.js, then run this launcher again.
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo Frontend dependencies are missing. Run npm install inside the frontend folder first.
  exit /b 1
)

start "ASTRA API" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m app.main"
start "ASTRA UI" /D "%~dp0frontend" cmd /k "npm run dev"
echo ASTRA is starting. Open http://127.0.0.1:5173 after both windows report they are ready.
endlocal
