# Dockerfile لخادم FastAPI في Render السحابي
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/apps/api

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# تثبيت مكتبة الحزم المشتركة
COPY packages/pkg /app/packages/pkg
RUN pip install --no-cache-dir /app/packages/pkg

# تثبيت تبعيات الخادم
COPY apps/api/pyproject.toml /app/apps/api/
RUN pip install --no-cache-dir /app/apps/api

# نسخ كود المشروع بالكامل
COPY . /app

WORKDIR /app/apps/api

# إنشاء مجلدات التخزين والبيانات
RUN mkdir -p storage data && \
    useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
