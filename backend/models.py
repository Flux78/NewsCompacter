import datetime
from datetime import timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def _utcnow():
    return datetime.datetime.now(timezone.utc)


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), unique=True, nullable=False)
    is_important = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    source = Column(String(200))
    source_url = Column(String(1000))
    content = Column(Text)
    summary = Column(Text)
    image_url = Column(String(1000), nullable=True)
    fingerprint = Column(String(64), unique=True)
    published_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=_utcnow)
    is_saved = Column(Boolean, default=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)

    topic = relationship("Topic", backref="news")
    tags = relationship("NewsTag", backref="news", cascade="all, delete-orphan")


class NewsTag(Base):
    __tablename__ = "news_tags"

    id = Column(Integer, primary_key=True)
    news_id = Column(Integer, ForeignKey("news.id"), nullable=False)
    tag_name = Column(String(100), nullable=False)


class LlmConfig(Base):
    __tablename__ = "llm_config"

    id = Column(Integer, primary_key=True)
    provider = Column(String(100), default="openrouter")
    api_key = Column(String(500))  # WARNING: Plaintext in DB — encryption recommended for production
    model = Column(String(200), default="meta-llama/llama-3.2-3b-instruct")
    base_url = Column(String(500), default="https://openrouter.ai/api/v1")


class NewsSource(Base):
    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    url = Column(String(1000), nullable=False)
    source_type = Column(String(20), default="rss")
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "url": self.url,
            "source_type": self.source_type,
        }


class TagPreference(Base):
    __tablename__ = "tag_preferences"

    id = Column(Integer, primary_key=True)
    tag_name = Column(String(100), unique=True, nullable=False)
    is_important = Column(Boolean, default=True)


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    fetch_interval_minutes = Column(Integer, nullable=True)
    language = Column(String(10), default="ORIG")
