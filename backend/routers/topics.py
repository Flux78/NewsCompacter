from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import Topic, News

DEFAULT_TOPICS = [
    {"name": "Weltpolitik", "is_important": True},
    {"name": "Deutschlandpolitik", "is_important": True},
    {"name": "künstliche Intelligenz", "is_important": True},
]


async def ensure_default_topics(db: AsyncSession):
    result = await db.execute(select(Topic).limit(1))
    if result.scalar_one_or_none():
        return
    for t in DEFAULT_TOPICS:
        db.add(Topic(**t))
    await db.commit()

router = APIRouter(prefix="/api/topics", tags=["topics"])


class TopicCreate(BaseModel):
    name: str
    is_important: bool = True


class TopicUpdate(BaseModel):
    name: str | None = None
    is_important: bool | None = None


class TopicResponse(BaseModel):
    id: int
    name: str
    is_important: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[TopicResponse])
async def list_topics(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Topic).order_by(Topic.name))
    return result.scalars().all()


@router.post("", response_model=TopicResponse)
async def create_topic(body: TopicCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Topic).where(Topic.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Topic already exists")
    topic = Topic(name=body.name, is_important=body.is_important)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


@router.put("/{topic_id}", response_model=TopicResponse)
async def update_topic(topic_id: int, body: TopicUpdate, db: AsyncSession = Depends(get_db)):
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(404, "Topic not found")
    if body.name is not None:
        existing = await db.execute(select(Topic).where(Topic.name == body.name, Topic.id != topic_id))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Topic name already exists")
        topic.name = body.name
    if body.is_important is not None:
        topic.is_important = body.is_important
    await db.commit()
    await db.refresh(topic)
    return topic


@router.delete("/{topic_id}")
async def delete_topic(topic_id: int, db: AsyncSession = Depends(get_db)):
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(404, "Topic not found")
    await db.execute(
        update(News).where(News.topic_id == topic_id).values(topic_id=None)
    )
    await db.delete(topic)
    await db.commit()
    return {"ok": True}
