@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not available in PATH.
  echo Please install Node.js, then run this file again.
  pause
  exit /b 1
)

set PORT=4179
start "" "http://127.0.0.1:%PORT%/"
echo US College Application Consultant is running at:
echo http://127.0.0.1:%PORT%/
echo.
echo Keep this window open while using the page.
echo Press Ctrl+C to stop the local server.
echo.
node server.mjs
pause
