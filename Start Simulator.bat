@echo off
title Match Season Simulator
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
  echo.
)

echo Starting the local server...
echo Your browser will open at http://localhost:4173
echo Keep THIS window open while you use the app. Close it to stop the server.
echo.

rem Open the browser a few seconds after the server starts booting.
start "" cmd /c "timeout /t 3 >nul & start "" http://localhost:4173"

call npm start
