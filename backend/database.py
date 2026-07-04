import os
import logging
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./newscompacter.db")
DB_TIMEOUT = 15

engine = create_async_engine(
    DATABASE_URL, echo=False, poolclass=StaticPool,
    connect_args={"timeout": DB_TIMEOUT, "check_same_thread": False},
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


SCHEMA_VERSION = 2

MIGRATIONS: dict[int, list[str]] = {
    1: [
        "ALTER TABLE news ADD COLUMN published_at DATETIME",
        "ALTER TABLE news ADD COLUMN is_saved BOOLEAN DEFAULT 0",
        "ALTER TABLE topics ADD COLUMN group_id INTEGER REFERENCES topic_groups(id)",
    ],
}


async def _get_schema_version(conn) -> int:
    try:
        result = await conn.execute(text("SELECT MAX(version) FROM schema_version"))
        row = result.scalar()
        return row if row is not None else 0
    except OperationalError:
        return 0


async def _migrate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
        ))
        current = await _get_schema_version(conn)
        for version in sorted(MIGRATIONS.keys()):
            if version > current:
                for stmt in MIGRATIONS[version]:
                    try:
                        await conn.execute(text(stmt))
                    except OperationalError:
                        logger.debug("Migration step already applied: %s", stmt)
                await conn.execute(text("INSERT INTO schema_version (version) VALUES (:v)"), {"v": version})
                logger.info("Applied schema migration v%d", version)


async def init_db():
    await _migrate()
    async with engine.connect() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.commit()
