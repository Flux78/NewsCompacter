import logging
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

DATABASE_URL = "sqlite+aiosqlite:///./newscompacter.db"

engine = create_async_engine(
    DATABASE_URL, echo=False, poolclass=NullPool,
    connect_args={"timeout": 15},
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def _migrate():
    """Add new columns to existing tables."""
    async with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE news ADD COLUMN published_at DATETIME",
            "ALTER TABLE news ADD COLUMN is_saved BOOLEAN DEFAULT 0",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                logger.debug("Column already exists, skipping migration: %s", stmt)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate()
    async with engine.connect() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.commit()
