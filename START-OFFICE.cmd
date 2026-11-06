@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE="
for /f "delims=" %%N in ('node -p "Number(process.versions.node.split('.')[0]) >= 22 ? process.execPath : ''" 2^>nul') do set "NODE_EXE=%%N"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\AI-Team-Office\runtime\node.exe" set "NODE_EXE=%LOCALAPPDATA%\AI-Team-Office\runtime\node.exe"
if not defined NODE_EXE (
  echo Preparing the official portable Node.js runtime. No system installation is required.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0office\install-node.ps1"
  if errorlevel 1 (
    echo Portable runtime setup failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  set "NODE_EXE=%LOCALAPPDATA%\AI-Team-Office\runtime\node.exe"
)
"%NODE_EXE%" --version
start "AI Team Office" cmd /k ""%NODE_EXE%" "%~dp0office\server.mjs""
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:1455/
