#!/usr/bin/env python3
"""Fetch public RSS/Atom feeds into scripts/candidates.json.

Install the only dependency first:

    pip install feedparser

Each object in feeds.json needs id, url, category (tech, markets, or
general), region (cn or global), and site. A feed that times out, refuses
the connection, or returns no items is skipped. The rest are still written.
This script does not edit data/digests.json.
"""

import json
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FEEDS_PATH = ROOT / "feeds.json"
OUT_PATH = ROOT / "candidates.json"
CATEGORIES = {"tech", "markets", "general"}
REGIONS = {"cn", "global"}
AGENT = "daily-news fetch_candidates/1.0 (+https://github.com/wengqian66/daily-news)"


def load_feedparser():
    try:
        import feedparser
    except ImportError:
        print("feedparser is not installed. Run: pip install feedparser", file=sys.stderr)
        return None
    return feedparser


def published_iso(entry):
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if not parsed:
            continue
        try:
            return datetime(*parsed[:6], tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (TypeError, ValueError):
            continue
    for key in ("published", "updated"):
        raw = str(entry.get(key) or "").strip()
        if raw:
            return raw
    return ""


def validate_feeds(feeds):
    errors = []
    if not isinstance(feeds, list) or not feeds:
        return ["feeds.json must be a non-empty array"]
    seen = set()
    for index, feed in enumerate(feeds):
        where = f"feeds[{index}]"
        if not isinstance(feed, dict):
            errors.append(f"{where} must be an object")
            continue
        feed_id = str(feed.get("id") or "").strip()
        where = f"feeds[{feed_id or index}]"
        if not feed_id:
            errors.append(f"{where}.id is required")
        elif feed_id in seen:
            errors.append(f"duplicate feed id {feed_id}")
        seen.add(feed_id)
        url = str(feed.get("url") or "").strip()
        if not (url.startswith("https://") or url.startswith("http://")):
            errors.append(f"{where}.url must start with http:// or https://")
        if feed.get("category") not in CATEGORIES:
            errors.append(f'{where}.category must be "tech", "markets", or "general"')
        if feed.get("region") not in REGIONS:
            errors.append(f'{where}.region must be "cn" or "global"')
        if not str(feed.get("site") or "").strip():
            errors.append(f"{where}.site is required")
    return errors


def failure_reason(parsed):
    status = getattr(parsed, "status", None)
    exc = getattr(parsed, "bozo_exception", None)
    parts = []
    if status:
        parts.append(f"status {status}")
    if exc:
        parts.append(str(exc).splitlines()[0][:180])
    if not parts:
        parts.append("no entries")
    return "; ".join(parts)


def candidates_from_feed(feedparser, feed):
    parsed = feedparser.parse(feed["url"], agent=AGENT)
    entries = list(getattr(parsed, "entries", None) or [])
    if not entries:
        raise RuntimeError(failure_reason(parsed))
    rows = []
    for entry in entries:
        title = " ".join(str(entry.get("title") or "").split())
        url = str(entry.get("link") or "").strip()
        if not title or not (url.startswith("https://") or url.startswith("http://")):
            continue
        rows.append({
            "title": title,
            "url": url,
            "site": str(feed["site"]).strip(),
            "category": feed["category"],
            "region": feed["region"],
            "published": published_iso(entry),
        })
    if not rows:
        raise RuntimeError("entries had no title and http(s) link")
    return rows


def main() -> int:
    feedparser = load_feedparser()
    if feedparser is None:
        return 1

    try:
        feeds = json.loads(FEEDS_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR  missing {FEEDS_PATH}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"ERROR  {FEEDS_PATH} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    errors = validate_feeds(feeds)
    if errors:
        print(f"{FEEDS_PATH} has {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"ERROR  {err}", file=sys.stderr)
        return 1

    socket.setdefaulttimeout(20)
    candidates = []
    seen_urls = set()
    failures = []
    for feed in feeds:
        feed_id = feed["id"]
        try:
            rows = candidates_from_feed(feedparser, feed)
        except Exception as exc:
            failures.append((feed_id, str(exc).splitlines()[0][:180]))
            continue
        for row in rows:
            if row["url"] in seen_urls:
                continue
            seen_urls.add(row["url"])
            candidates.append(row)

    candidates.sort(key=lambda row: row.get("published") or "")
    candidates.reverse()
    OUT_PATH.write_text(
        json.dumps(candidates, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(candidates)} candidate(s) from {len(feeds) - len(failures)}/{len(feeds)} feed(s) to {OUT_PATH}")
    if failures:
        print(f"{len(failures)} feed(s) failed:", file=sys.stderr)
        for feed_id, reason in failures:
            print(f"  {feed_id}: {reason}", file=sys.stderr)
    if not candidates:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
