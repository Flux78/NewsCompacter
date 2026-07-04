from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import TopicGroup, Topic

router = APIRouter(prefix="/api/topic-groups", tags=["topic-groups"])


class GroupCreate(BaseModel):
    name: str
    display_order: int = 0


class GroupUpdate(BaseModel):
    name: str | None = None
    display_order: int | None = None


class GroupResponse(BaseModel):
    id: int
    name: str
    display_order: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[GroupResponse])
async def list_groups(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TopicGroup).order_by(TopicGroup.display_order, TopicGroup.name))
    return result.scalars().all()


@router.post("", response_model=GroupResponse)
async def create_group(body: GroupCreate, db: AsyncSession = Depends(get_db)):
    group = TopicGroup(name=body.name, display_order=body.display_order)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(group_id: int, body: GroupUpdate, db: AsyncSession = Depends(get_db)):
    group = await db.get(TopicGroup, group_id)
    if not group:
        raise HTTPException(404, "Topic group not found")
    if body.name is not None:
        group.name = body.name
    if body.display_order is not None:
        group.display_order = body.display_order
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}")
async def delete_group(group_id: int, db: AsyncSession = Depends(get_db)):
    group = await db.get(TopicGroup, group_id)
    if not group:
        raise HTTPException(404, "Topic group not found")
    await db.execute(
        update(Topic).where(Topic.group_id == group_id).values(group_id=None)
    )
    await db.delete(group)
    await db.commit()
    return {"ok": True}
