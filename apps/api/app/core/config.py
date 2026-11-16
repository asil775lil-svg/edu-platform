"""إعدادات الخادم — كل شيء قابل للتغيير بمتغيّرات بيئة تبدأ بـ EDU_."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDU_", extra="ignore")

    app_name: str = "منظومة التعليم الذكية"
    api_prefix: str = "/api"
    secret_key: str = "dev-insecure-change-me"
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'app.db').as_posix()}"
    storage_dir: Path = BASE_DIR / "storage"
    web_origin: str = "http://localhost:5173"
    session_ttl_days: int = 30
    cookie_name: str = "edu_session"
    cookie_secure: bool = False
    signed_url_ttl_seconds: int = 900
    max_upload_bytes: int = 2 * 1024**3


settings = Settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)
(settings.storage_dir.parent / "data").mkdir(parents=True, exist_ok=True)
