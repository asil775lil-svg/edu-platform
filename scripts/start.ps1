# =============================================================================
# سكربت تشغيل منظومة المنصة التعليمية الذكية
# الاستخدام:  .\scripts\start.ps1
#             أو بالنقر المزدوج على start.bat في المجلد الرئيسي
# =============================================================================

param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173,
    [switch]$NoBrowser
)

$Host.UI.RawUI.WindowTitle = "منظومة المنصة التعليمية الذكية"
$root = (Split-Path -Parent $PSScriptRoot)

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "          منظومة المنصة التعليمية الذكية (.edupkg)          " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. التحقق من متطلبات النظام
Write-Host "[1/5] فحص بيئة التشغيل..." -ForegroundColor Yellow

$apiDir = Join-Path $root "apps\api"
$webDir = Join-Path $root "apps\web"
$venvDir = Join-Path $apiDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"

# فحص بايثون
if (-not (Test-Path $pythonExe)) {
    Write-Host "  -> جارٍ إنشاء بيئة بايثون الافتراضية (.venv)..." -ForegroundColor DarkGray
    python -m venv $venvDir
    if (-not (Test-Path $pythonExe)) {
        Write-Host "خطأ: تعذّر إنشاء بيئة Python. تأكد من تثبيت Python 3.11+ وإضافته لـ PATH." -ForegroundColor Red
        Read-Host "اضغط Enter للخروج"
        exit 1
    }
    Write-Host "  -> تثبيت مكتبات الخادم ومكتبة edupkg..." -ForegroundColor DarkGray
    & $pythonExe -m pip install --upgrade pip | Out-Null
    & $pythonExe -m pip install -e (Join-Path $root "packages\pkg") -e (Join-Path $apiDir ".[dev]")
}

# فحص مكتبات الواجهة
$nodeModules = Join-Path $webDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "  -> تثبيت حزم الواجهة (npm install)..." -ForegroundColor DarkGray
    Push-Location $webDir
    npm install
    Pop-Location
}

# 2. تحديث وهجرات قاعدة البيانات
Write-Host "[2/5] تطبيق هجرات قاعدة البيانات (Alembic)..." -ForegroundColor Yellow
Push-Location $apiDir
& $pythonExe -m alembic upgrade head
Pop-Location

# 3. إعداد الاتصال والـ ports
Write-Host "[3/5] فحص المنافذ وإعدادات الشبكة..." -ForegroundColor Yellow
$busy = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "تنبيه: المنفذ $ApiPort مشغول. جاري محاولة استخدام منفذ بديل 8020..." -ForegroundColor Yellow
    $ApiPort = 8020
}

# ضبط عنوان الـ API للواجهة
$envLocal = Join-Path $webDir ".env.local"
"VITE_API_TARGET=http://127.0.0.1:$ApiPort" | Set-Content -Path $envLocal -Encoding UTF8

# 4. تشغيل خادم FastAPI
Write-Host "[4/5] تشغيل خادم الـ API على http://127.0.0.1:$ApiPort ..." -ForegroundColor Yellow
$apiLog = Join-Path $apiDir "data\uvicorn.log"
$apiErrLog = Join-Path $apiDir "data\uvicorn.err.log"
New-Item -ItemType Directory -Force -Path (Join-Path $apiDir "data") | Out-Null

$apiProcess = Start-Process -FilePath $pythonExe `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$ApiPort", "--reload" `
    -WorkingDirectory $apiDir -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $apiLog `
    -RedirectStandardError $apiErrLog

# 5. تشغيل واجهة الويب (Vite)
Write-Host "[5/5] تشغيل الواجهة على http://localhost:$WebPort ..." -ForegroundColor Yellow
$webProcess = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "--port", "$WebPort" `
    -WorkingDirectory $webDir -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "          تم تشغيل النظام بنجاح وهو جاهز للعمل!           " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 واجهة المنصة : " -NoNewline; Write-Host "http://localhost:$WebPort" -ForegroundColor Cyan
Write-Host "  📡 واجهة الـ API : " -NoNewline; Write-Host "http://127.0.0.1:$ApiPort/api" -ForegroundColor Cyan
Write-Host "  📚 توثيق الـ API : " -NoNewline; Write-Host "http://127.0.0.1:$ApiPort/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  [اضغط Q أو Ctrl+C في أي وقت لإيقاف تشغيل الخوادم والخروج]" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor DarkGray
Write-Host ""

# فتح المتصفح تلقائياً
if (-not $NoBrowser) {
    Start-Process "http://localhost:$WebPort"
}

# حلقة مراقبة وإيقاف نظيف
try {
    while ($true) {
        if ($Host.UI.RawUI.KeyAvailable) {
            $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            if ($key.Character -eq 'q' -or $key.Character -eq 'Q') {
                break
            }
        }
        # التحقق إن كانت العمليات ما زالت حية
        if ($apiProcess.HasExited) {
            Write-Host "تنبيه: توقف خادم الـ API بشكل غير متوقع. راجع السجل: $apiErrLog" -ForegroundColor Red
            break
        }
        Start-Sleep -Milliseconds 400
    }
}
finally {
    Write-Host "`nجارٍ إيقاف تشغيل الخوادم والعمليات..." -ForegroundColor Yellow
    if ($apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($webProcess -and -not $webProcess.HasExited) {
        # إنهاء شجرة عمليات npm و node
        Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*node*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Write-Host "تم إيقاف تشغيل كافة الخدمات بنجاح. في أمان الله.`n" -ForegroundColor Green
}
