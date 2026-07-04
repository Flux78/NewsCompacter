from contextlib import asynccontextmanager
from pathlib import Path
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, async_session
from services.scheduler import start_scheduler
from services.auth import AuthMiddleware
from routers.sources import _ensure_default_sources
from routers.topics import _ensure_default_topics
from routers import topics, llm_config, news, fetch, tag_prefs, sources, settings, topic_groups


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await _ensure_default_sources(db)
        await _ensure_default_topics(db)
    await start_scheduler(async_session)
    yield


app = FastAPI(title="NewsCompacter", lifespan=lifespan)

_default_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:8000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.environ.get("NC_API_KEY"):
    app.add_middleware(AuthMiddleware)

app.include_router(topics.router)
app.include_router(llm_config.router)
app.include_router(news.router)
app.include_router(fetch.router)
app.include_router(tag_prefs.router)
app.include_router(sources.router)
app.include_router(settings.router)
app.include_router(topic_groups.router)


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
