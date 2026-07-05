import logging
from urllib.parse import urljoin
import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, computed_field

from database import get_db
from models import LlmConfig
from services.crypto import encrypt, decrypt, is_encrypted
from services.utils import get_http_client

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


@router.get("/models")
async def list_models(
    base_url: str = Query(..., description="Provider base URL"),
    api_key: str = Query("", description="Optional: use this API key instead of the stored one"),
    db: AsyncSession = Depends(get_db),
):
    raw_key = api_key.strip() if api_key else ""
    if raw_key:
        resolved_key = raw_key
    else:
        result = await db.execute(select(LlmConfig))
        config = result.scalar_one_or_none()
        if not config or not config.api_key:
            return {"models": []}
        resolved_key = decrypt(config.api_key)

    try:
        headers = {
            "Authorization": f"Bearer {resolved_key}",
            "Content-Type": "application/json",
        }
        models_url = urljoin(base_url.rstrip("/") + "/", "models")
        client = get_http_client()
        resp = await client.get(models_url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data", []) if isinstance(data, dict) else []
        models = [{"id": m["id"]} for m in items if isinstance(m, dict) and m.get("id")]
        return {"models": models}
    except Exception as e:
        logger.warning("Failed to fetch models from %s: %s", base_url, e)
        return {"models": []}
