import logging
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.news_fetcher import fetch_all_news, cleanup_old_news
from services.llm_service import enrich_news_with_llm
from services.scheduler import update_interval
from services.utils import get_settings
from models import News, NewsSource, NewsTag
import status

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/fetch", tags=["fetch"])

_last_fetch: float = 0
FETCH_COOLDOWN = 60


class IntervalUpdate(BaseModel):
    minutes: int | None


@router.post("/now")
async def fetch_now(db: AsyncSession = Depends(get_db)):
    global _last_fetch
    now = time.time()
    if now - _last_fetch < FETCH_COOLDOWN:
        remaining = int(FETCH_COOLDOWN - (now - _last_fetch))
        raise HTTPException(429, f"Bitte {remaining}s warten bis zum nächsten Fetch")
    _last_fetch = now

    result = await db.execute(select(NewsSource).where(NewsSource.enabled == True))
    sources = [s.to_dict() for s in result.scalars().all()]
    await status.set_fetching(True)
    try:
        news = await fetch_all_news(db, sources=sources)
        await cleanup_old_news(db)
        fetched = len(news)
    except Exception as e:
        logger.error("Fetch failed: %s", e)
        return {"fetched": 0, "enriched": 0}
    finally:
        await status.set_fetching(False)

    enriched = 0
    if news:
        await status.set_enriching(True)
        try:
            enriched = await enrich_news_with_llm(db, news)
        except Exception as e:
            logger.error("Enrichment failed: %s", e)
        finally:
            await status.set_enriching(False)

    return {"fetched": fetched, "enriched": enriched}


@router.post("/enrich")
async def enrich_untagged(db: AsyncSession = Depends(get_db)):
    
    subq = select(NewsTag.news_id).subquery()
    result = await db.execute(
        select(News).where(News.id.not_in(subq))
    )
    untagged = result.scalars().all()
    if not untagged:
        return {"enriched": 0}
    await status.set_enriching(True)
    try:
        enriched = await enrich_news_with_llm(db, untagged)
        return {"enriched": enriched}
    except Exception as e:
        logger.error("Enrichment failed: %s", e)
        return {"enriched": 0}
    finally:
        await status.set_enriching(False)


@router.get("/interval")
async def get_interval(db: AsyncSession = Depends(get_db)):
    config = await get_settings(db)
    return {"minutes": config.fetch_interval_minutes}


@router.get("/enrich-status")
async def enrich_status():
    return {"enriching": status.enriching, "fetching": status.fetching}


@router.post("/interval")
async def set_interval(body: IntervalUpdate, db: AsyncSession = Depends(get_db)):
    await update_interval(db, body.minutes)
    return {"minutes": body.minutes}
