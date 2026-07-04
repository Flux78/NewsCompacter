import logging
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, computed_field

from database import get_db
from models import LlmConfig
from services.crypto import encrypt, decrypt, is_encrypted

logger = logging.getLogger(__name__)
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
    clear_api_key: bool = False


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
    _migrate_key_if_needed(db, config)
    return _masked_response(config)


@router.put("", response_model=LlmConfigOut)
async def update_config(body: LlmConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LlmConfig))
    config = result.scalar_one_or_none()
    if not config:
        config = LlmConfig(id=1)
        db.add(config)

    if body.clear_api_key:
        config.api_key = ""
    elif body.api_key is not None and body.api_key.strip() != "":
        config.api_key = encrypt(body.api_key)

    for field in ("provider", "model", "base_url"):
        val = getattr(body, field, None)
        if val is not None and val != "":
            setattr(config, field, val)

    await db.commit()
    await db.refresh(config)
    return _masked_response(config)


def _masked_response(config: LlmConfig) -> LlmConfigOut:
    return LlmConfigOut(
        provider=config.provider,
        api_key="***" if config.api_key else "",
        model=config.model,
        base_url=config.base_url,
    )


async def _migrate_key_if_needed(db: AsyncSession, config: LlmConfig) -> None:
    if config.api_key and not is_encrypted(config.api_key):
        logger.info("Migrating plaintext API key to encrypted storage")
        config.api_key = encrypt(config.api_key)
        await db.commit()
        await db.refresh(config)
