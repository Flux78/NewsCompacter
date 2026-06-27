from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import TagPreference

router = APIRouter(prefix="/api/tag-prefs", tags=["tag_prefs"])


class TagPrefResponse(BaseModel):
    tag_name: str
    is_important: bool

    model_config = {"from_attributes": True}


class TagPrefUpsert(BaseModel):
    tag_name: str
    is_important: bool


@router.get("", response_model=list[TagPrefResponse])
async def list_prefs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TagPreference))
    return result.scalars().all()


@router.put("", response_model=TagPrefResponse)
async def upsert_pref(body: TagPrefUpsert, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TagPreference).where(TagPreference.tag_name == body.tag_name)
    )
    pref = result.scalar_one_or_none()
    if pref:
        pref.is_important = body.is_important
    else:
        pref = TagPreference(tag_name=body.tag_name, is_important=body.is_important)
        db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref


@router.delete("/{tag_name}")
async def delete_pref(tag_name: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TagPreference).where(TagPreference.tag_name == tag_name)
    )
    pref = result.scalar_one_or_none()
    if pref:
        await db.delete(pref)
        await db.commit()
    return {"ok": True}
