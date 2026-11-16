# تشغيل بيئة التطوير كاملة (خادم API + واجهة Vite) في نافذتين.
# الاستخدام:  .\scripts\dev.ps1
#             .\scripts\dev.ps1 -ApiPort 8010

param(
    [int]$ApiPort = 8010,
    [int]$WebPort = 5173
)

$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $root "apps\api\data") | Out-Null

function Assert-Path($path, $hint) {
    if (-not (Test-Path $path)) {
        Write-Host "مفقود: $path" -ForegroundColor Red
        Write-Host "  $hint" -ForegroundColor Yellow
        exit 1
    }
}

$apiPython = Join-Path $root "apps\api\.venv\Scripts\python.exe"
Assert-Path $apiPython "أنشئ البيئة: cd apps\api; python -m venv .venv; .\.venv\Scripts\pip install -e ..\..\packages\pkg -e `".[dev]`""
Assert-Path (Join-Path $root "apps\web\node_modules") "ثبّت الواجهة: cd apps\web; npm install"

$busy = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "المنفذ $ApiPort مشغول (PID $($busy[0].OwningProcess)). اختر منفذاً آخر: .\scripts\dev.ps1 -ApiPort 8020" -ForegroundColor Red
    exit 1
}

# الواجهة تقرأ عنوان الـ API من VITE_API_TARGET إن لم يكن هناك .env
$envFile = Join-Path $root "apps\web\.env.local"
if (-not (Test-Path $envFile)) {
    "VITE_API_TARGET=http://127.0.0.1:$ApiPort" | Set-Content -Path $envFile -Encoding UTF8
    Write-Host "أُنشئ apps\web\.env.local → http://127.0.0.1:$ApiPort" -ForegroundColor DarkGray
}

Write-Host "تشغيل الخادم على http://127.0.0.1:$ApiPort ..." -ForegroundColor Cyan
$api = Start-Process -FilePath $apiPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$ApiPort", "--reload" `
    -WorkingDirectory (Join-Path $root "apps\api") -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root "apps\api\data\uvicorn.log") `
    -RedirectStandardError (Join-Path $root "apps\api\data\uvicorn.err.log")

Write-Host "تشغيل الواجهة على http://localhost:$WebPort ..." -ForegroundColor Cyan
$web = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "--port", "$WebPort" `
    -WorkingDirectory (Join-Path $root "apps\web") -PassThru `
    -RedirectStandardOutput (Join-Path $root "apps\web\.vite-dev.log") `
    -RedirectStandardError (Join-Path $root "apps\web\.vite-dev.err.log")

Write-Host ""
Write-Host "  الواجهة: http://localhost:$WebPort" -ForegroundColor Green
Write-Host "  الـ API: http://127.0.0.1:$ApiPort/api  (التوثيق: /docs)" -ForegroundColor Green
Write-Host ""
Write-Host "أوقف التشغيل بـ: Stop-Process -Id $($api.Id),$($web.Id)" -ForegroundColor DarkGray
Write-Host "السجلات: apps\api\data\uvicorn*.log و apps\web\.vite-dev*.log" -ForegroundColor DarkGray
