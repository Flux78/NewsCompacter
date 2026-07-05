import json
import logging
from typing import List
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import LlmConfig, News, NewsTag
from services.utils import merge_sources, merge_urls, get_settings
from services.crypto import decrypt

logger = logging.getLogger(__name__)

LLM_TEMPERATURE = 0.3
LLM_MAX_TOKENS = 1024
LLM_TIMEOUT = 60
MAX_TAGS_PER_ARTICLE = 8
DEDUP_LIMIT = 100
MAX_PROMPT_CONTENT = 3000
MAX_TITLE_LENGTH = 300

async def _get_config(db: AsyncSession) -> LlmConfig | None:
    result = await db.execute(select(LlmConfig))
    return result.scalar_one_or_none()


async def _get_language(db: AsyncSession) -> str:
    settings = await get_settings(db)
    return settings.language or "ORIG"


def _lang_suffix(lang: str) -> str:
    if lang == "DEU":
        return " Antworte auf Deutsch."
    if lang == "ENG":
        return " Respond in English."
    return ""


async def _call_llm(db: AsyncSession, system_prompt: str = "", user_prompt: str = "", lang: str = "ORIG") -> str | None:
    config = await _get_config(db)
    if not config or not config.api_key:
        return None

    suffix = _lang_suffix(lang)
    if suffix:
        system_prompt += suffix

    api_key = decrypt(config.api_key)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if config.provider == "openrouter":
        headers["HTTP-Referer"] = "http://localhost:8000"

    messages = [{"role": "user", "content": user_prompt}]
    if system_prompt:
        messages.insert(0, {"role": "system", "content": system_prompt})

    payload = {
        "model": config.model,
        "messages": messages,
        "temperature": LLM_TEMPERATURE,
        "max_tokens": LLM_MAX_TOKENS,
    }

    try:
        client = get_http_client()
        url = f"{config.base_url}/chat/completions"
        resp = await client.post(url, timeout=LLM_TIMEOUT, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]
    except (httpx.HTTPError, httpx.TimeoutException, KeyError, json.JSONDecodeError) as e:
        logger.warning("LLM call failed (model=%s, base=%s): %s", config.model, config.base_url, e)
        return None


def _sanitize(text: str | None) -> str:
    if not text:
        return ""
    return text[:MAX_PROMPT_CONTENT]


async def generate_tags(db: AsyncSession, news: News, lang: str = "ORIG") -> List[str]:
    title = _sanitize(news.title)[:MAX_TITLE_LENGTH]
    content = _sanitize(news.content)
    prompt = (
        f"Analyze the following news article and extract fine-grained, specific tags. "
        f"Include: named entities (people, organizations, locations), specific topics or subtopics, "
        f"key events, and relevant categories. Provide 5-8 tags. "
        f"Respond ONLY with a JSON array, e.g. [\"Tag1\", \"Tag2\", \"Tag3\"].\n\n"
        f"Title: {title}\nContent: {content}"
    )
    result = await _call_llm(
        db,
        "You extract detailed, fine-grained tags (entities, topics, categories, events) from news articles.",
        prompt,
        lang,
    )
    if not result:
        return []

    try:
        tags = json.loads(result)
        if isinstance(tags, list):
            return [str(t).strip()[:100] for t in tags[:MAX_TAGS_PER_ARTICLE]]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


async def generate_summary(db: AsyncSession, news: News, lang: str = "ORIG") -> str | None:
    title = _sanitize(news.title)[:MAX_TITLE_LENGTH]
    content = _sanitize(news.content)
    prompt = (
        f"Summarize the following news article in 1-2 sentences.\n\n"
        f"Title: {title}\nContent: {content}"
    )
    return await _call_llm(db, "You summarize news articles concisely.", prompt, lang)


async def _generate_consolidated_summary(
    db: AsyncSession, primary: News, duplicates: list[News], lang: str = "ORIG"
) -> str | None:
    titles_text = "\n".join(
        f"- {n.title} (source: {n.source})"
        for n in [primary] + duplicates
    )
    content = _sanitize(primary.content)
    prompt = (
        f"The following {len(duplicates) + 1} news articles from different sources cover the same topic. "
        f"Generate a consolidated, comprehensive summary in 2-3 sentences that captures the key "
        f"information from all sources.\n\n"
        f"Articles:\n{titles_text}\n\n"
        f"Main article content:\n{content}"
    )
    return await _call_llm(
        db,
        "You combine multiple news articles about the same topic into one concise, comprehensive summary.",
        prompt,
        lang,
    )


async def deduplicate_articles(db: AsyncSession, news_list: List[News]) -> List[List[News]]:
    if len(news_list) < 2:
        return [[n] for n in news_list]

    titles = "\n".join(f"{i+1}. {_sanitize(n.title)[:MAX_TITLE_LENGTH]}" for i, n in enumerate(news_list))
    prompt = (
        f"The following news headlines may be duplicates. "
        f"Group them if they cover the same topic. "
        f"Respond ONLY with a JSON array of arrays, e.g. [[1,3], [2,4,5]]. "
        f"Each group contains the numbers of related articles.\n\n{titles}"
    )
    result = await _call_llm(db, "You identify duplicate news articles.", prompt)
    if not result:
        return [[n] for n in news_list]

    try:
        groups_raw = json.loads(result)
        result_groups: List[List[News]] = []
        seen: set[int] = set()
        for grp in groups_raw:
            if not grp:
                continue
            items = [news_list[i - 1] for i in grp if 1 <= i <= len(news_list)]
            if items:
                result_groups.append(items)
                seen.update(i - 1 for i in grp)
        for i, n in enumerate(news_list):
            if i not in seen:
                result_groups.append([n])
        return result_groups
    except (json.JSONDecodeError, TypeError, IndexError):
        pass
    return [[n] for n in news_list]


async def enrich_news_with_llm(db: AsyncSession, news_list: List[News]) -> int:
    config = await _get_config(db)
    if not config:
        logger.warning("enrich_news_with_llm: no LlmConfig row in DB")
        return 0
    if not config.api_key:
        logger.warning("enrich_news_with_llm: api_key is empty (configure it on the LLM page)")
        return 0

    lang = await _get_language(db)
    enriched = 0
    logger.info("enrich_news_with_llm: starting enrichment for %d items", len(news_list))

    all_new_tags: list[NewsTag] = []
    for news_item in news_list:
        tags = await generate_tags(db, news_item, lang)
        if tags:
            enriched += 1
        for tag_name in tags:
            all_new_tags.append(NewsTag(news_id=news_item.id, tag_name=tag_name))

        if not news_item.summary:
            summary = await generate_summary(db, news_item, lang)
            if summary:
                news_item.summary = summary

    if all_new_tags:
        existing_result = await db.execute(
            select(NewsTag.news_id, NewsTag.tag_name).where(
                NewsTag.news_id.in_({t.news_id for t in all_new_tags}),
                NewsTag.tag_name.in_({t.tag_name for t in all_new_tags}),
            )
        )
        existing_set = set(existing_result.fetchall())
        for tag in all_new_tags:
            if (tag.news_id, tag.tag_name) not in existing_set:
                db.add(tag)

    await db.commit()

    news_ids = {n.id for n in news_list}
    existing_result = await db.execute(
        select(News)
        .options(selectinload(News.tags))
        .where(News.id.notin_(news_ids))
        .where(News.is_saved == False)
        .order_by(News.fetched_at.desc())
        .limit(DEDUP_LIMIT)
    )
    existing = list(existing_result.scalars().all())

    groups = await deduplicate_articles(db, news_list + existing)
    deleted_ids: set[int] = set()
    merge_groups: list[tuple[News, list[News]]] = []
    for group in groups:
        if len(group) < 2:
            continue
        primary = group[0]
        if primary.id in deleted_ids:
            continue
        dups: list[News] = []
        for dup in group[1:]:
            if dup.id in deleted_ids:
                continue
            primary.source = merge_sources(primary.source or "", dup.source or "")
            primary.source_url = merge_urls(primary.source_url or "", dup.source_url or "")
            if len(dup.content or "") > len(primary.content or ""):
                primary.content = dup.content
            if not primary.image_url and dup.image_url:
                primary.image_url = dup.image_url
            dups.append(dup)
            deleted_ids.add(dup.id)
            await db.delete(dup)
        if dups:
            merge_groups.append((primary, dups))

    if deleted_ids:
        logger.info("deduplicate_articles: merged %d duplicate(s)", len(deleted_ids))
        await db.commit()

    if merge_groups:
        summary_count = 0
        for primary, dups in merge_groups:
            consolidated = await _generate_consolidated_summary(db, primary, dups, lang)
            if consolidated:
                primary.summary = consolidated
                summary_count += 1
        if summary_count:
            logger.info("deduplicate_articles: regenerated %d consolidated summary/summaries", summary_count)
            await db.commit()

    return enriched






