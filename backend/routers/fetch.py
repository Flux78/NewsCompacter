import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.news_fetcher import fetch_all_news, cleanup_old_news
from services.llm_service import enrich_news_with_llm
from services.scheduler import update_interval, get_session_factory
from models import NewsSource, NewsTag, Settings
import status

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/fetch", tags=["fetch"])


class IntervalUpdate(BaseModel):
    minutes: int | None


@router.post("/now")
async def fetch_now(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(NewsSource).where(NewsSource.enabled == True))
    sources = [
        {"id": s.id, "name": s.name, "url": s.url, "source_type": s.source_type}
        for s in result.scalars().all()
    ]
    status.fetching = True
    try:
        news = await fetch_all_news(db, sources=sources)
        await cleanup_old_news(db)
        fetched = len(news)
    except Exception as e:
        logger.error("Fetch failed: %s", e)
        return {"fetched": 0, "enriched": 0}
    finally:
        status.fetching = False

    enriched = 0
    if news:
        status.enriching = True
        try:
            enriched = await enrich_news_with_llm(db, news)
        except Exception as e:
            logger.error("Enrichment failed: %s", e)
        finally:
            status.enriching = False

    return {"fetched": fetched, "enriched": enriched}


@router.post("/enrich")
async def enrich_untagged(db: AsyncSession = Depends(get_db)):
    from models import News as NewsModel
    subq = select(NewsTag.news_id).subquery()
    result = await db.execute(
        select(NewsModel).where(NewsModel.id.not_in(select(subq.c.news_id)))
    )
    untagged = result.scalars().all()
    if not untagged:
        return {"enriched": 0}
    status.enriching = True
    try:
        enriched = await enrich_news_with_llm(db, untagged)
        return {"enriched": enriched}
    except Exception as e:
        logger.error("Enrichment failed: %s", e)
        return {"enriched": 0}
    finally:
        status.enriching = False


@router.get("/interval")
async def get_interval(db: AsyncSession = Depends(get_db)):
    config = await db.get(Settings, 1)
    return {"minutes": config.fetch_interval_minutes if config else None}


@router.get("/enrich-status")
async def enrich_status():
    return {"enriching": status.enriching, "fetching": status.fetching}


@router.post("/interval")
async def set_interval(body: IntervalUpdate):
    session_factory = get_session_factory()
    await update_interval(session_factory, body.minutes)
    return {"minutes": body.minutes}
