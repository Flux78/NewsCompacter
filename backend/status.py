import asyncio

_lock = asyncio.Lock()
enrich_lock = asyncio.Lock()
enriching: bool = False
fetching: bool = False


async def set_enriching(v: bool) -> None:
    global enriching
    async with _lock:
        enriching = v


async def set_fetching(v: bool) -> None:
    global fetching
    async with _lock:
        fetching = v
