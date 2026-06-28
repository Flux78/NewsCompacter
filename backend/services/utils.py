import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from models import Settings

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(60.0))
    return _http_client


async def get_settings(db: AsyncSession) -> Settings:
    config = await db.get(Settings, 1)
    if not config:
        config = Settings(id=1)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


def merge_sources(current: str, new: str) -> str:
    parts = [s.strip() for s in current.split("+")]
    for s in new.split("+"):
        s = s.strip()
        if s and s not in parts:
            parts.append(s)
    return " + ".join(parts)


def merge_urls(current: str, new: str) -> str:
    parts = [u.strip() for u in current.split(" | ")]
    for u in new.split(" | "):
        u = u.strip()
        if u and u not in parts:
            parts.append(u)
    return " | ".join(parts)
