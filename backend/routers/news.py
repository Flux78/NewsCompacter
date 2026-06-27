from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import News


def _serialize(item: News) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "source": item.source,
        "source_url": item.source_url,
        "summary": item.summary,
        "content": item.content,
        "image_url": item.image_url,
        "published_at": item.published_at.isoformat() if item.published_at else None,
        "fetched_at": item.fetched_at.isoformat() if item.fetched_at else None,
        "is_saved": item.is_saved,
        "topic_name": item.topic.name if item.topic else None,
        "tags": [t.tag_name for t in item.tags],
    }


router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("")
async def list_news(
    topic_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(News)
        .options(selectinload(News.tags), selectinload(News.topic))
        .order_by(News.fetched_at.desc())
    )
    if topic_id is not None:
        query = query.where(News.topic_id == topic_id)

    result = await db.execute(query)
    return [_serialize(item) for item in result.scalars().all()]


class SaveUpdate(BaseModel):
    is_saved: bool


@router.patch("/{news_id}")
async def update_news(news_id: int, body: SaveUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(News, news_id)
    if not item:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="News not found")
    item.is_saved = body.is_saved
    await db.commit()
    return _serialize(item)


@router.get("/grouped")
async def grouped_news(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(News)
        .options(selectinload(News.tags), selectinload(News.topic))
        .order_by(News.fetched_at.desc())
    )
    items = result.scalars().all()

    grouped: dict[str, list[dict]] = {"other": []}
    for item in items:
        key = item.topic.name if item.topic else "other"
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(_serialize(item))
    return grouped
