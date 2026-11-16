@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] An error occurred while running the start script.
    pause
)
