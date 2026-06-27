from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LanguageResponse(BaseModel):
    language: str


class LanguageUpdate(BaseModel):
    language: str


async def _get_settings(db: AsyncSession) -> Settings:
    config = await db.get(Settings, 1)
    if not config:
        config = Settings(id=1)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.get("/language", response_model=LanguageResponse)
async def get_language(db: AsyncSession = Depends(get_db)):
    settings = await _get_settings(db)
    return {"language": settings.language or "ORIG"}


@router.put("/language", response_model=LanguageResponse)
async def set_language(body: LanguageUpdate, db: AsyncSession = Depends(get_db)):
    settings = await _get_settings(db)
    settings.language = body.language
    await db.commit()
    return {"language": settings.language}
