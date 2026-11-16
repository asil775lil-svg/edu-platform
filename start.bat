@echo off
chcp 65001 >nul
title تشغيل منصة التعليم الذكية

echo ========================================================
echo   جارٍ تشغيل منظومة المنصة التعليمية الذكية...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*

if %errorlevel% neq 0 (
    echo.
    echo [خطأ] حدثت مشكلة أثناء التشغيل.
    pause
)
