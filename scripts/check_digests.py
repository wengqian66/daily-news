#!/usr/bin/env python3
"""Validate data/digests.json before it is published.

story.bodyZh is optional and must be a string when present.
story.region is optional and must be "cn" or "global" when present.
link.lang is optional and must be "zh" or "en" when present.
There is no cap on how many stories a category may hold.
Target mix is about 3 cn + 3 global in each of tech, markets, and general
(about 18 stories a day). That quota is not enforced.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "digests.json"
DATE = "%Y-%m-%d"
BAD_ID = set(" \t\n#?&/")


def main() -> int:
    errors = []

    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR  missing {PATH}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"ERROR  {PATH} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if not isinstance(data, dict):
        errors.append("root must be an object")
        data = {}

    site = data.get("site")
    if not isinstance(site, dict) or not str(site.get("title") or "").strip():
        errors.append("site.title is required")

    digests = data.get("digests")
    if not isinstance(digests, list):
        errors.append("digests must be an array")
        digests = []

    seen_days = set()
    seen_stories = set()

    for i, digest in enumerate(digests):
        where = f"digests[{i}]"
        if not isinstance(digest, dict):
            errors.append(f"{where} must be an object")
            continue
        day = str(digest.get("id") or "")
        where = f"digests[{day or i}]"
        try:
            datetime.strptime(day, DATE)
        except ValueError:
            errors.append(f"{where}.id must be YYYY-MM-DD")
        if day in seen_days:
            errors.append(f"duplicate digest id {day}")
        seen_days.add(day)
        if not str(digest.get("label") or "").strip():
            errors.append(f"{where}.label is required")

        categories = digest.get("categories")
        if not isinstance(categories, list) or not categories:
            errors.append(f"{where}.categories must be a non-empty array")
            continue

        seen_cats = set()
        for j, cat in enumerate(categories):
          cwhere = f"{where}.categories[{j}]"
          if not isinstance(cat, dict):
              errors.append(f"{cwhere} must be an object")
              continue
          cid = str(cat.get("id") or "").strip()
          if not cid:
              errors.append(f"{cwhere}.id is required")
          elif cid in seen_cats:
              errors.append(f"{where} has duplicate category id {cid}")
          seen_cats.add(cid)
          if not str(cat.get("heading") or "").strip():
              errors.append(f"{cwhere}.heading is required")
          stories = cat.get("stories")
          if not isinstance(stories, list):
              errors.append(f"{cwhere}.stories must be an array")
              continue
          for k, story in enumerate(stories):
              swhere = f"{cwhere}.stories[{k}]"
              if not isinstance(story, dict):
                  errors.append(f"{swhere} must be an object")
                  continue
              sid = str(story.get("id") or "").strip()
              if not sid:
                  errors.append(f"{swhere}.id is required")
              elif any(ch in sid for ch in BAD_ID):
                  errors.append(f"{swhere}.id cannot contain whitespace or # ? & /")
              elif sid in seen_stories:
                  errors.append(f"duplicate story id {sid}")
              seen_stories.add(sid)
              for field in ("title", "excerpt", "source"):
                  if not str(story.get(field) or "").strip():
                      errors.append(f"{swhere}.{field} is required")
              if "featured" in story and not isinstance(story["featured"], bool):
                  errors.append(f"{swhere}.featured must be true or false")
              if "bodyZh" in story and not isinstance(story.get("bodyZh"), str):
                  errors.append(f"{swhere}.bodyZh must be a string")
              if "region" in story and story.get("region") not in ("cn", "global"):
                  errors.append(f'{swhere}.region must be "cn" or "global" when present')
              links = story.get("links", [])
              if not isinstance(links, list):
                  errors.append(f"{swhere}.links must be an array")
                  continue
              for n, link in enumerate(links):
                  lwhere = f"{swhere}.links[{n}]"
                  if not isinstance(link, dict):
                      errors.append(f"{lwhere} must be an object")
                      continue
                  href = str(link.get("href") or "")
                  if not (href.startswith("https://") or href.startswith("http://")):
                      errors.append(f"{lwhere}.href must start with http:// or https://")
                  if not str(link.get("title") or "").strip():
                      errors.append(f"{lwhere}.title is required")
                  if not str(link.get("site") or "").strip():
                      errors.append(f"{lwhere}.site is required")
                  if "lang" in link and link.get("lang") not in ("zh", "en"):
                      errors.append(f'{lwhere}.lang must be "zh" or "en" when present')

    if errors:
        print(f"{PATH} has {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"ERROR  {err}", file=sys.stderr)
        return 1

    print(f"OK  {PATH}  {len(digests)} day(s), {len(seen_stories)} story(ies)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
