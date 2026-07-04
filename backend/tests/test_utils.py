import pytest
from services.utils import merge_sources, merge_urls
from services.news_fetcher import _strip_html, _extract_image, _fingerprint


class TestMergeSources:
    def test_single_current(self):
        assert merge_sources("BBC", "CNN") == "BBC + CNN"

    def test_already_present(self):
        assert merge_sources("BBC + CNN", "BBC") == "BBC + CNN"

    def test_multiple_merge(self):
        assert merge_sources("A + B", "C") == "A + B + C"

    def test_empty_current(self):
        assert merge_sources("", "BBC") == "BBC"


class TestMergeUrls:
    def test_single(self):
        assert merge_urls("http://a.com", "http://b.com") == "http://a.com | http://b.com"

    def test_duplicate(self):
        assert merge_urls("http://a.com", "http://a.com") == "http://a.com"


class TestStripHtml:
    def test_basic(self):
        assert _strip_html("<p>Hello</p>") == "Hello"

    def test_no_html(self):
        assert _strip_html("Plain text") == "Plain text"

    def test_nested(self):
        assert _strip_html('<div><a href="#">Link</a></div>') == "Link"


class TestExtractImage:
    def test_basic(self):
        assert _extract_image('<img src="http://img.com/pic.jpg">') == "http://img.com/pic.jpg"

    def test_no_image(self):
        assert _extract_image("<p>No image</p>") is None


class TestFingerprint:
    def test_same_title_same_hash(self):
        a = _fingerprint({"title": "Hello World"})
        b = _fingerprint({"title": "Hello  World"})
        assert a == b

    def test_different_title(self):
        a = _fingerprint({"title": "Foo"})
        b = _fingerprint({"title": "Bar"})
        assert a != b

    def test_case_insensitive(self):
        a = _fingerprint({"title": "HELLO"})
        b = _fingerprint({"title": "hello"})
        assert a == b
