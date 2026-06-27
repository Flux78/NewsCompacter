from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from sqlalchemy import select
from services.news_fetcher import fetch_all_news, cleanup_old_news
from services.llm_service import enrich_news_with_llm
from models import Settings, NewsSource
import status

scheduler = AsyncIOScheduler()
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Scheduler not initialized")
    return _session_factory


async def _run_fetch_job(session_factory: async_sessionmaker[AsyncSession]):
    async with session_factory() as db:
        config = await db.get(Settings, 1)
        if config and config.fetch_interval_minutes:
            result = await db.execute(select(NewsSource).where(NewsSource.enabled == True))
            sources = [
                {"id": s.id, "name": s.name, "url": s.url, "source_type": s.source_type}
                for s in result.scalars().all()
            ]
            news = await fetch_all_news(db, sources=sources)
            await cleanup_old_news(db)
            status.enriching = True
            try:
                if news:
                    await enrich_news_with_llm(db, news)
            finally:
                status.enriching = False


async def start_scheduler(session_factory: async_sessionmaker[AsyncSession]):
    global _session_factory
    _session_factory = session_factory
    async with session_factory() as db:
        config = await db.get(Settings, 1)
        interval = config.fetch_interval_minutes if config else None

    if interval:
        scheduler.add_job(
            _run_fetch_job,
            "interval",
            minutes=interval,
            args=[session_factory],
            id="fetch_news",
            replace_existing=True,
        )

    scheduler.start()


async def update_interval(session_factory: async_sessionmaker[AsyncSession], minutes: int | None):
    if scheduler.get_job("fetch_news"):
        scheduler.remove_job("fetch_news")

    async with session_factory() as db:
        config = await db.get(Settings, 1)
        if not config:
            config = Settings(id=1, fetch_interval_minutes=minutes)
            db.add(config)
        else:
            config.fetch_interval_minutes = minutes
        await db.commit()

    if minutes:
        scheduler.add_job(
            _run_fetch_job,
            "interval",
            minutes=minutes,
            args=[session_factory],
            id="fetch_news",
            replace_existing=True,
        )
