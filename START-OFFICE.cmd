@echo off
setlocal
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install the official Node.js runtime first.
  pause
  exit /b 1
)
start "AI Team Office" cmd /k "node office\server.mjs"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:1455/
