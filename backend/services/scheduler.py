from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from sqlalchemy import select
from services.news_fetcher import fetch_all_news, cleanup_old_news
from services.llm_service import enrich_news_with_llm
from services.utils import get_settings
from models import NewsSource
import status

scheduler = AsyncIOScheduler()
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Scheduler not initialized")
    return _session_factory


async def _run_fetch_job(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as db:
        config = await get_settings(db)
        if config.fetch_interval_minutes:
            result = await db.execute(select(NewsSource).where(NewsSource.enabled == True))
            sources = [s.to_dict() for s in result.scalars().all()]
            news = await fetch_all_news(db, sources=sources)
            await cleanup_old_news(db)
            await status.set_enriching(True)
            try:
                if news:
                    await enrich_news_with_llm(db, news)
            finally:
                await status.set_enriching(False)


def _schedule_fetch_job(minutes: int, session_factory: async_sessionmaker[AsyncSession]) -> None:
    scheduler.add_job(
        _run_fetch_job,
        "interval",
        minutes=minutes,
        args=[session_factory],
        id="fetch_news",
        replace_existing=True,
    )


async def start_scheduler(session_factory: async_sessionmaker[AsyncSession]) -> None:
    global _session_factory
    _session_factory = session_factory
    async with session_factory() as db:
        config = await get_settings(db)
        interval = config.fetch_interval_minutes

    if interval:
        _schedule_fetch_job(interval, session_factory)

    scheduler.start()


async def update_interval(db: AsyncSession, minutes: int | None) -> None:
    if scheduler.get_job("fetch_news"):
        scheduler.remove_job("fetch_news")

    config = await get_settings(db)
    config.fetch_interval_minutes = minutes
    await db.commit()

    if minutes:
        _schedule_fetch_job(minutes, _session_factory)
