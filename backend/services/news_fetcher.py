import asyncio
import hashlib
import datetime
import logging
from datetime import timezone
import re
from typing import List
import feedparser
import httpx
from sqlalchemy import select, delete, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from models import News, NewsSource, Topic
from services.utils import merge_sources, merge_urls, get_http_client

logger = logging.getLogger(__name__)

RETENTION_DAYS = 8
FETCH_TIMEOUT = 15
FETCH_ARTICLE_TIMEOUT = 10
MAX_ARTICLE_LENGTH = 2000
MAX_RSS_ENTRIES = 20
MAX_GOOGLE_NEWS_ENTRIES = 10
USER_AGENT = "Mozilla/5.0"
MIN_CONTENT_LENGTH = 80
GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=de&gl=DE&ceid=DE:de"

_IMG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]*>")
_BODY_RE = re.compile(r'<body[^>]*>(.*?)</body>', re.IGNORECASE | re.DOTALL)
_ARTICLE_RE = re.compile(r'<article[^>]*>(.*?)</article>', re.IGNORECASE | re.DOTALL)
_SCRIPT_RE = re.compile(r'<script[^>]*>.*?</script>', re.IGNORECASE | re.DOTALL)
_STYLE_RE = re.compile(r'<style[^>]*>.*?</style>', re.IGNORECASE | re.DOTALL)
_NAV_RE = re.compile(r'<nav[^>]*>.*?</nav>', re.IGNORECASE | re.DOTALL)


def _strip_html(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def _extract_image(html: str) -> str | None:
    m = _IMG_RE.search(html)
    return m.group(1) if m else None


def _clean_article(article: dict) -> dict:
    raw_content = article["content"]
    img_url = _extract_image(raw_content)
    clean = _strip_html(raw_content)
    article["content"] = clean
    article["image_url"] = img_url
    return article


async def fetch_article_text(url: str) -> str | None:
    for attempt in range(2):
        try:
            client = get_http_client()
            resp = await client.get(url, timeout=FETCH_ARTICLE_TIMEOUT, headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            break
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            if attempt < 1:
                await asyncio.sleep(2)
                continue
            logger.warning("fetch_article_text(%s) failed: %s", url, e)
            return None
    html = resp.text
    for tag in (_SCRIPT_RE, _STYLE_RE, _NAV_RE):
        html = tag.sub("", html)
    m = _ARTICLE_RE.search(html)
    if m:
        text = _strip_html(m.group(1))
    else:
        m = _BODY_RE.search(html)
        if m:
            text = _strip_html(m.group(1))
        else:
            text = _strip_html(html)
    lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 30]
    return " ".join(lines)[:MAX_ARTICLE_LENGTH] if lines else None


def _parse_published(entry) -> datetime.datetime | None:
    ts = entry.get("published_parsed") or entry.get("updated_parsed")
    if ts:
        return datetime.datetime(*ts[:6], tzinfo=timezone.utc)
    return None


async def fetch_rss(url: str, source_name: str) -> List[dict]:
    for attempt in range(2):
        try:
            client = get_http_client()
            resp = await client.get(url, timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            break
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            if attempt < 1:
                await asyncio.sleep(2)
                continue
            logger.warning("fetch_rss(%s) failed: %s", url, e)
            return []

    feed = feedparser.parse(resp.text)
    articles = []
    for entry in feed.entries[:MAX_RSS_ENTRIES]:
        content = entry.get("summary", entry.get("description", ""))
        url = entry.get("link", "")
        if len(_strip_html(content).strip()) < MIN_CONTENT_LENGTH and url:
            fetched = await fetch_article_text(url)
            if fetched:
                content = fetched
        articles.append(_clean_article({
            "title": entry.get("title", ""),
            "source": source_name,
            "source_url": url,
            "content": content,
            "published_at": _parse_published(entry),
        }))
    return articles


async def fetch_google_news(query: str) -> List[dict]:
    url = GOOGLE_NEWS_RSS.format(query=query)
    for attempt in range(2):
        try:
            client = get_http_client()
            resp = await client.get(url, timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            break
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            if attempt < 1:
                await asyncio.sleep(2)
                continue
            logger.warning("fetch_google_news(%s) failed: %s", query, e)
            return []

    feed = feedparser.parse(resp.text)
    articles = []

    for entry in feed.entries[:MAX_GOOGLE_NEWS_ENTRIES]:
        articles.append(_clean_article({
            "title": entry.get("title", ""),
            "source": "Google News",
            "source_url": entry.get("link", ""),
            "content": entry.get("summary", entry.get("description", "")),
            "published_at": _parse_published(entry),
        }))
    return articles


def _fingerprint(article: dict) -> str:
    raw = re.sub(r'\s+', ' ', article["title"]).strip().lower()
    return hashlib.sha256(raw.encode()).hexdigest()


async def fetch_all_news(db: AsyncSession, sources: list[dict] | None = None) -> List[News]:

    all_articles = []

    if sources is None:
        result = await db.execute(
            select(NewsSource).where(NewsSource.enabled == True)
        )
        sources = [s.to_dict() for s in result.scalars().all()]

    for src in sources:
        if src["source_type"] == "rss":
            articles = await fetch_rss(src["url"], src["name"])
            all_articles.extend(articles)
        elif src["source_type"] == "google_news":
            topics_result = await db.execute(select(Topic.name))
            topic_names = [row[0] for row in topics_result]
            for topic in topic_names:
                articles = await fetch_google_news(topic)
                all_articles.extend(articles)

    cutoff = datetime.datetime.now(timezone.utc) - datetime.timedelta(days=RETENTION_DAYS)
    all_articles = [
        a for a in all_articles
        if a.get("published_at") is None or a["published_at"] >= cutoff
    ]

    existing_map: dict[str, News] = {}
    result = await db.execute(select(News))
    for item in result.scalars().all():
        existing_map[item.fingerprint] = item

    touched: List[News] = []
    seen_fps: set[str] = set()
    for article in all_articles:
        fp = _fingerprint(article)
        if fp in seen_fps:
            continue
        seen_fps.add(fp)

        existing = existing_map.get(fp)
        if existing:
            old_source = existing.source
            existing.source = merge_sources(existing.source, article["source"])
            existing.source_url = merge_urls(existing.source_url or "", article["source_url"])
            if len(article.get("content", "")) > len(existing.content or ""):
                existing.content = article["content"]
            if not existing.image_url and article.get("image_url"):
                existing.image_url = article["image_url"]
            if not existing.published_at and article.get("published_at"):
                existing.published_at = article["published_at"]
            if existing.source != old_source:
                touched.append(existing)
        else:
            news_item = News(
                title=article["title"],
                source=article["source"],
                source_url=article["source_url"],
                content=article["content"],
                image_url=article.get("image_url"),
                fingerprint=fp,
                published_at=article.get("published_at"),
                fetched_at=datetime.datetime.now(timezone.utc),
            )
            db.add(news_item)
            touched.append(news_item)

    await db.commit()
    return touched


async def cleanup_old_news(db: AsyncSession):
    cutoff = datetime.datetime.now(timezone.utc) - datetime.timedelta(days=RETENTION_DAYS)
    stmt = delete(News).where(
        News.is_saved == False,
        or_(
            and_(News.published_at.isnot(None), News.published_at < cutoff),
            and_(News.published_at.is_(None), News.fetched_at < cutoff),
        ),
    )
    result = await db.execute(stmt)
    if result.rowcount:
        await db.commit()
