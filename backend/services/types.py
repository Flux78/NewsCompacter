from enum import Enum


class Language(str, Enum):
    DEU = "DEU"
    ENG = "ENG"
    ORIG = "ORIG"


class SourceType(str, Enum):
    RSS = "rss"
    GOOGLE_NEWS = "google_news"
