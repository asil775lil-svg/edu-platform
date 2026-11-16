from logging.config import fileConfig

from alembic import context
from app.core.config import settings
from app.db.base import Base, engine
import app.db.models  # noqa: F401 — لضمان تسجيل كافة النماذج في Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """تشغيل الهجرات في الوضع غير المتصل."""
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # مهم لدعم تغيير الأعمدة في SQLite
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """تشغيل الهجرات في الوضع المتصل."""
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # مهم لدعم SQLite والترقية لـ Postgres
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
