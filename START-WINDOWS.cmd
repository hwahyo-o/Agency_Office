@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js가 없습니다. README.md의 휴대용 실행 방법을 확인하세요.
 pause
 exit /b 1
)
node check.mjs
pause
