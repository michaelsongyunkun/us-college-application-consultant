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
echo US College Application Consultant is running at:
echo http://127.0.0.1:%PORT%/
echo.
echo DeepSeek generation needs DEEPSEEK_API_KEY from Windows environment or .env.
echo You can copy .env.example to .env and fill in your key.
echo.
if not defined DEEPSEEK_API_KEY if not exist ".env" (
  echo DEEPSEEK_API_KEY was not found in this launch session.
  set /p DEEPSEEK_API_KEY=Paste DEEPSEEK_API_KEY now, or press Enter to run without generation:
  echo.
)
echo Keep this window open while using the page.
echo Press Ctrl+C to stop the local server.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Start-Process -FilePath 'node.exe' -ArgumentList '--import','tsx','server.mjs' -WorkingDirectory '%CD%' -PassThru; " ^
  "try { " ^
  "  $ready = $false; " ^
  "  for ($i = 0; $i -lt 40; $i++) { " ^
  "    if ($p.HasExited) { throw 'Local server exited before it was ready.' } " ^
  "    try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:%PORT%/' -TimeoutSec 1 | Out-Null; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 } " ^
  "  } " ^
  "  if (-not $ready) { throw 'Local server did not become ready in time.' } " ^
  "  Start-Process 'http://127.0.0.1:%PORT%/'; " ^
  "  Wait-Process -Id $p.Id; " ^
  "} finally { if (-not $p.HasExited) { Stop-Process -Id $p.Id } }"
pause
