from html.parser import HTMLParser
from urllib.parse import parse_qs, urlencode, urlparse

import httpx


class ResearchError(RuntimeError):
    pass


class _SearchResultsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.results: list[dict[str, str]] = []
        self._active: str | None = None
        self._current: dict[str, str] = {}

    def finish(self) -> None:
        self._save_current()

    def _save_current(self) -> None:
        if self._current.get("title") and self._current.get("url"):
            self.results.append(self._current)
        self._current = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "a" and "result__a" in classes:
            self._save_current()
            href = attributes.get("href") or ""
            parsed = urlparse(href)
            if parsed.netloc.endswith("duckduckgo.com"):
                href = parse_qs(parsed.query).get("uddg", [href])[0]
            if urlparse(href).scheme in {"http", "https"}:
                self._current = {"title": "", "url": href, "snippet": ""}
                self._active = "title"
        elif tag in {"a", "div", "td"} and "result__snippet" in classes and self._current:
            self._active = "snippet"

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._active == "title":
            self._active = None
        elif tag in {"a", "div", "td"} and self._active == "snippet":
            self._active = None

    def handle_data(self, data: str) -> None:
        if self._active in {"title", "snippet"} and self._current:
            current = self._current[self._active]
            self._current[self._active] = (current + " " + data).strip()


def search_web(query: str) -> list[dict[str, str]]:
    url = "https://html.duckduckgo.com/html/?" + urlencode({"q": query})
    try:
        response = httpx.get(
            url,
            timeout=12.0,
            follow_redirects=True,
            headers={"User-Agent": "ASTRA local assistant/1.0"},
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ResearchError("Free web search is unavailable. Check this PC's internet connection and try again.") from exc

    parser = _SearchResultsParser()
    parser.feed(response.text)
    parser.finish()
    results = [
        {
            "title": item["title"][:300],
            "url": item["url"],
            "snippet": item["snippet"][:700],
        }
        for item in parser.results
        if item["title"] and item["url"]
    ]
    if not results:
        raise ResearchError("The search provider returned no readable results. Try a different query.")
    return results[:10]
