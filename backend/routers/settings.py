from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.utils import get_settings
from services.types import Language

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LanguageResponse(BaseModel):
    language: Language


class LanguageUpdate(BaseModel):
    language: Language


@router.get("/language", response_model=LanguageResponse)
async def get_language(db: AsyncSession = Depends(get_db)):
    settings = await get_settings(db)
    lang = settings.language or "ORIG"
    if lang not in Language.__members__:
        lang = "ORIG"
    return {"language": lang}

@router.put("/language", response_model=LanguageResponse)
async def set_language(body: LanguageUpdate, db: AsyncSession = Depends(get_db)):
    settings = await get_settings(db)
    settings.language = body.language.value
    await db.commit()
    return {"language": settings.language}
