#!/usr/bin/env bash
set -e

# =============================================================================
# سكربت تشغيل المنصة في بيئات Linux / macOS / WSL
# =============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

API_PORT="${API_PORT:-8010}"
WEB_PORT="${WEB_PORT:-5173}"

echo "=========================================================="
echo "          منظومة المنصة التعليمية الذكية (.edupkg)          "
echo "=========================================================="

# 1. تفعيل بيئة بايثون وتطبيق الهجرات
if [ ! -d "$API_DIR/.venv" ]; then
    echo "إنشاء بيئة بايثون..."
    python3 -m venv "$API_DIR/.venv"
    "$API_DIR/.venv/bin/pip" install -e "$ROOT/packages/pkg" -e "$API_DIR[dev]"
fi

echo "تطبيق هجرات قاعدة البيانات (Alembic)..."
(cd "$API_DIR" && "$API_DIR/.venv/bin/alembic" upgrade head)

# 2. فحص حزم الواجهة
if [ ! -d "$WEB_DIR/node_modules" ]; then
    echo "تثبيت حزم الواجهة (npm install)..."
    (cd "$WEB_DIR" && npm install)
fi

echo "VITE_API_TARGET=http://127.0.0.1:$API_PORT" > "$WEB_DIR/.env.local"

# 3. تشغيل الخوادم
echo "تشغيل خادم الـ API على http://127.0.0.1:$API_PORT ..."
"$API_DIR/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port "$API_PORT" --reload --app-dir "$API_DIR" &
API_PID=$!

echo "تشغيل واجهة الويب على http://localhost:$WEB_PORT ..."
(cd "$WEB_DIR" && npm run dev -- --port "$WEB_PORT") &
WEB_PID=$!

cleanup() {
    echo ""
    echo "جارٍ إيقاف الخوادم..."
    kill "$API_PID" "$WEB_PID" 2>/dev/null || true
    wait "$API_PID" "$WEB_PID" 2>/dev/null || true
    echo "تم إيقاف الخدمات بنجاح."
}

trap cleanup INT TERM EXIT

echo ""
echo "  الواجهة: http://localhost:$WEB_PORT"
echo "  الـ API: http://127.0.0.1:$API_PORT/api (التوثيق: /docs)"
echo ""
echo "اضغط Ctrl+C لإيقاف التشغيل."

wait
