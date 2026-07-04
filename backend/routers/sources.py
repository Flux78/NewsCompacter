import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from services.llm_service import _call_llm
from services.types import SourceType

logger = logging.getLogger(__name__)

from database import get_db
from models import NewsSource, LlmConfig, Topic

FALLBACK_SUGGESTIONS = [
    {"name": "Reuters", "url": "https://www.reutersagency.com/feed/", "source_type": "rss"},
    {"name": "CNBC", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "source_type": "rss"},
    {"name": "The Guardian", "url": "https://www.theguardian.com/world/rss", "source_type": "rss"},
    {"name": "Google News – Technology", "url": "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en", "source_type": "google_news"},
    {"name": "Google News – Science", "url": "https://news.google.com/rss/search?q=science&hl=en-US&gl=US&ceid=US:en", "source_type": "google_news"},
]

router = APIRouter(prefix="/api/sources", tags=["sources"])

DEFAULT_SOURCES = [
    {"name": "BBC News", "url": "https://feeds.bbci.co.uk/news/rss.xml", "source_type": "rss"},
    {"name": "DF-EU", "url": "https://www.deutschlandfunk.de/europa-112.rss", "source_type": "rss"},
    {"name": "DF-Ges", "url": "https://www.deutschlandfunk.de/gesellschaft-106.rss", "source_type": "rss"},
    {"name": "DF-News", "url": "https://www.deutschlandfunk.de/nachrichten-100.rss", "source_type": "rss"},
    {"name": "DF-Pol", "url": "https://www.deutschlandfunk.de/politikportal-100.rss", "source_type": "rss"},
    {"name": "DF-Wirt", "url": "https://www.deutschlandfunk.de/wirtschaft-106.rss", "source_type": "rss"},
    {"name": "DF-Wis", "url": "https://www.deutschlandfunk.de/wissen-106.rss", "source_type": "rss"},
    {"name": "Heise", "url": "https://www.heise.de/newsticker/heise.rdf", "source_type": "rss"},
    {"name": "Heise-Sec", "url": "https://www.heise.de/security/rss/news.rdf", "source_type": "rss"},
    {"name": "NYT HomePage", "url": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", "source_type": "rss"},
    {"name": "ORF", "url": "https://rss.orf.at/news.xml", "source_type": "rss"},
    {"name": "Spiegel", "url": "https://www.spiegel.de/schlagzeilen/index.rss", "source_type": "rss"},
    {"name": "Tagesschau", "url": "https://www.tagesschau.de/xml/rss2", "source_type": "rss"},
    {"name": "ZDF", "url": "https://www.zdf.de/rss/zdf/nachrichten", "source_type": "rss"},
    {"name": "Zeit", "url": "https://newsfeed.zeit.de/", "source_type": "rss"},
]


class SourceResponse(BaseModel):
    id: int
    name: str
    url: str
    source_type: SourceType
    enabled: bool

    model_config = {"from_attributes": True}


class SourceCreate(BaseModel):
    name: str
    url: str
    source_type: SourceType = SourceType.RSS


class SourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    source_type: SourceType | None = None
    enabled: bool | None = None


async def _ensure_default_sources(db: AsyncSession):
    result = await db.execute(select(NewsSource).limit(1))
    if result.scalar_one_or_none():
        return
    for s in DEFAULT_SOURCES:
        db.add(NewsSource(**s))
    await db.commit()


@router.get("", response_model=list[SourceResponse])
async def list_sources(db: AsyncSession = Depends(get_db)):
    await _ensure_default_sources(db)
    result = await db.execute(select(NewsSource).order_by(NewsSource.name))
    return result.scalars().all()


@router.post("", response_model=SourceResponse)
async def create_source(body: SourceCreate, db: AsyncSession = Depends(get_db)):
    source = NewsSource(name=body.name, url=body.url, source_type=body.source_type)
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source


@router.put("/{source_id}", response_model=SourceResponse)
async def update_source(source_id: int, body: SourceUpdate, db: AsyncSession = Depends(get_db)):
    source = await db.get(NewsSource, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    for field in ("name", "url", "source_type", "enabled"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(source, field, val)
    await db.commit()
    await db.refresh(source)
    return source


@router.delete("/{source_id}")
async def delete_source(source_id: int, db: AsyncSession = Depends(get_db)):
    source = await db.get(NewsSource, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    await db.delete(source)
    await db.commit()
    return {"ok": True}


class SuggestSourcesResponse(BaseModel):
    suggestions: list[SourceCreate]


@router.get("/suggest", response_model=SuggestSourcesResponse)
async def suggest_sources(db: AsyncSession = Depends(get_db)):
    llm = await db.get(LlmConfig, 1)
    if not llm or not llm.api_key:
        raise HTTPException(400, "No LLM API key configured")
    topic_result = await db.execute(select(Topic.name))
    topic_names = [row[0] for row in topic_result]
    existing_result = await db.execute(select(NewsSource.name))
    existing_names = {row[0].lower().strip() for row in existing_result}
    topics_str = ", ".join(topic_names) if topic_names else "general news"
    prompt = (
        f"You are a news source recommender. The user follows these topics: {topics_str}.\n"
        f"Already configured sources: {', '.join(sorted(existing_names)) or 'none'}.\n"
        "Suggest 5 new RSS feed URLs (or Google News RSS queries) that would be relevant.\n"
        "Return a JSON array of objects with keys: name, url, source_type (\"rss\" or \"google_news\").\n"
        "No explanation, only valid JSON."
    )

    try:
        content = await _call_llm(db, user_prompt=prompt)
        if not content:
            raise ValueError("empty response")
        raw = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        suggestions = json.loads(raw)
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("LLM source suggestion failed: %s", e)
        suggestions = FALLBACK_SUGGESTIONS

    return {"suggestions": [SourceCreate(**s) for s in suggestions]}
