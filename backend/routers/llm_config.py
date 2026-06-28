from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, computed_field

from database import get_db
from models import LlmConfig

router = APIRouter(prefix="/api/llm-config", tags=["llm"])


class LlmConfigOut(BaseModel):
    provider: str
    api_key: str
    model: str
    base_url: str

    @computed_field
    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key)

    model_config = {"from_attributes": True}


class LlmConfigUpdate(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None


DEFAULTS = {
    "provider": "openrouter",
    "api_key": "",
    "model": "meta-llama/llama-3.2-3b-instruct",
    "base_url": "https://openrouter.ai/api/v1",
}


@router.get("", response_model=LlmConfigOut | None)
async def get_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LlmConfig))
    config = result.scalar_one_or_none()
    if not config:
        config = LlmConfig(id=1, **DEFAULTS)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.put("", response_model=LlmConfigOut)
async def update_config(body: LlmConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LlmConfig))
    config = result.scalar_one_or_none()
    if not config:
        config = LlmConfig(id=1)
        db.add(config)
    for field in ("provider", "api_key", "model", "base_url"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(config, field, val)
    await db.commit()
    await db.refresh(config)
    return config
