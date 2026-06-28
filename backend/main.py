import sys
sys.path.insert(0, ".")

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, async_session
from services.scheduler import start_scheduler
from routers.sources import _ensure_default_sources
from routers.topics import _ensure_default_topics
from routers import topics, llm_config, news, fetch, tag_prefs, sources, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await _ensure_default_sources(db)
        await _ensure_default_topics(db)
    await start_scheduler(async_session)
    yield


app = FastAPI(title="NewsCompacter", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(topics.router)
app.include_router(llm_config.router)
app.include_router(news.router)
app.include_router(fetch.router)
app.include_router(tag_prefs.router)
app.include_router(sources.router)
app.include_router(settings.router)


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
