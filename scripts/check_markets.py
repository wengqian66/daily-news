#!/usr/bin/env python3
"""Validate data/markets.json before it is published.

The page can omit a series. A present series must be a real daily snapshot:
positive price, matching history, Shanghai cutoff, and sane units.
Fuel, when present, must be the 31 mainland provincial-level regions, and
each province needs a history whose latest 92/95/0 prices match the snapshot.
A missing fuel history is allowed only when there is no fuel snapshot at all.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "markets.json"

ISO_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$")
ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CLOCK = re.compile(r"^\d{2}:\d{2}$")
QUOTE_ID = re.compile(r"^[a-z][a-z0-9]{1,31}$")

# Keep fetch_markets.py catalog checks aligned with this table.
CATALOG = {
    "au9999": {"group": "gold", "unit": "元/克", "decimals": 2, "low": 50, "high": 8000},
    "agtd": {"group": "silver", "unit": "元/千克", "decimals": 2, "low": 500, "high": 500000},
    "xau": {"group": "gold", "unit": "美元/盎司", "decimals": 2, "low": 200, "high": 30000},
    "xag": {"group": "silver", "unit": "美元/盎司", "decimals": 3, "low": 1, "high": 2000},
    "wti": {"group": "oil", "unit": "美元/桶", "decimals": 2, "low": 5, "high": 500},
    "brent": {"group": "oil", "unit": "美元/桶", "decimals": 2, "low": 5, "high": 500},
}

PROVINCES = [
    "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江",
    "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南",
    "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州",
    "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆",
]

HISTORY_MAX = 200
# A year of daily fuel snapshots, with room for the older adjustment-day seed.
FUEL_HISTORY_MAX = 400


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def close_enough(left, right, decimals):
    return abs(left - right) <= (0.51 * (10 ** (-decimals))) + 1e-9


def validate(data):
    errors = []
    if not isinstance(data, dict):
        return ["root must be an object"]

    if data.get("version") != 1:
        errors.append("version must be 1")
    if data.get("timezone") != "Asia/Shanghai":
        errors.append('timezone must be "Asia/Shanghai"')
    generated = data.get("generatedAt")
    if not isinstance(generated, str) or not ISO_DT.match(generated):
        errors.append("generatedAt must be YYYY-MM-DDTHH:MM:SS+08:00")

    quotes = data.get("quotes")
    if not isinstance(quotes, list):
        errors.append("quotes must be an array")
        quotes = []

    seen = set()
    for i, quote in enumerate(quotes):
        where = f"quotes[{i}]"
        if not isinstance(quote, dict):
            errors.append(f"{where} must be an object")
            continue
        qid = quote.get("id")
        if not isinstance(qid, str) or not QUOTE_ID.match(qid):
            errors.append(f"{where}.id must be a short lowercase id")
            qid = ""
        elif qid in seen:
            errors.append(f"duplicate quote id {qid}")
        seen.add(qid)
        where = f"quotes[{qid or i}]"
        spec = CATALOG.get(qid)
        for field in ("name", "unit", "source"):
            if not isinstance(quote.get(field), str) or not quote[field].strip():
                errors.append(f"{where}.{field} is required")
        href = quote.get("sourceUrl")
        if not isinstance(href, str) or not (href.startswith("https://") or href.startswith("http://")):
            errors.append(f"{where}.sourceUrl must start with http:// or https://")
        if spec:
            if quote.get("group") != spec["group"]:
                errors.append(f'{where}.group must be "{spec["group"]}"')
            if quote.get("unit") != spec["unit"]:
                errors.append(f'{where}.unit must be "{spec["unit"]}"')
            if quote.get("decimals") != spec["decimals"]:
                errors.append(f"{where}.decimals must be {spec['decimals']}")
        else:
            group = quote.get("group")
            if group not in ("gold", "silver", "oil"):
                errors.append(f'{where}.group must be "gold", "silver", or "oil"')
            decimals = quote.get("decimals")
            if not isinstance(decimals, int) or isinstance(decimals, bool) or not 0 <= decimals <= 4:
                errors.append(f"{where}.decimals must be an integer from 0 to 4")
        decimals = quote.get("decimals") if isinstance(quote.get("decimals"), int) else 2
        price = quote.get("price")
        if not is_number(price) or not price > 0:
            errors.append(f"{where}.price must be a positive number")
        elif spec and not spec["low"] <= price <= spec["high"]:
            errors.append(f"{where}.price {price} is outside {spec['low']}–{spec['high']}")
        session = quote.get("sessionDate")
        if not isinstance(session, str) or not ISO_DAY.match(session):
            errors.append(f"{where}.sessionDate must be YYYY-MM-DD")
        else:
            try:
                datetime.strptime(session, "%Y-%m-%d")
            except ValueError:
                errors.append(f"{where}.sessionDate is not a real date")
        as_of = quote.get("asOf")
        if not isinstance(as_of, str) or not ISO_DT.match(as_of):
            errors.append(f"{where}.asOf must be YYYY-MM-DDTHH:MM:SS+08:00")
        elif isinstance(session, str) and not as_of.startswith(session):
            errors.append(f"{where}.asOf must fall on sessionDate")
        if "clock" in quote and (not isinstance(quote.get("clock"), str) or not CLOCK.match(quote["clock"])):
            errors.append(f"{where}.clock must be HH:MM when present")
        if "clockKind" in quote and quote.get("clockKind") not in ("close", "tick"):
            errors.append(f'{where}.clockKind must be "close" or "tick" when present')
        if "stale" in quote and quote.get("stale") is not True:
            errors.append(f"{where}.stale must be true when present")
        if "detail" in quote and not isinstance(quote.get("detail"), str):
            errors.append(f"{where}.detail must be a string when present")

        history = quote.get("history")
        if not isinstance(history, list) or not history:
            errors.append(f"{where}.history must be a non-empty array")
            history = []
        elif len(history) > HISTORY_MAX:
            errors.append(f"{where}.history has {len(history)} points; limit is {HISTORY_MAX}")
        prev_day = ""
        last_close = None
        prev_close = None
        for n, point in enumerate(history):
            pwhere = f"{where}.history[{n}]"
            if not isinstance(point, dict):
                errors.append(f"{pwhere} must be an object")
                continue
            day = point.get("date")
            if not isinstance(day, str) or not ISO_DAY.match(day):
                errors.append(f"{pwhere}.date must be YYYY-MM-DD")
            elif prev_day and day <= prev_day:
                errors.append(f"{pwhere}.date must be later than {prev_day}")
            prev_day = day if isinstance(day, str) else prev_day
            close = point.get("close")
            if not is_number(close) or not close > 0:
                errors.append(f"{pwhere}.close must be a positive number")
            else:
                prev_close = last_close
                last_close = close
                if spec and not spec["low"] <= close <= spec["high"]:
                    errors.append(f"{pwhere}.close {close} is outside {spec['low']}–{spec['high']}")
        if isinstance(session, str) and prev_day and prev_day != session:
            errors.append(f"{where}.sessionDate must match the last history date")
        if is_number(price) and is_number(last_close) and isinstance(decimals, int):
            if not close_enough(price, last_close, decimals):
                errors.append(f"{where}.price must match the last history close")
        change = quote.get("change")
        change_pct = quote.get("changePct")
        if len(history) >= 2 and is_number(last_close) and is_number(prev_close):
            delta = last_close - prev_close
            if not is_number(change) or (isinstance(decimals, int) and not close_enough(change, delta, decimals)):
                errors.append(f"{where}.change must equal the last two closes")
            if prev_close:
                pct = delta / prev_close * 100
                if not is_number(change_pct) or abs(change_pct - pct) > 0.02:
                    errors.append(f"{where}.changePct must match the last two closes")
        elif history and change not in (None,) and not (len(history) < 2 and change is None):
            if len(history) < 2 and change is not None:
                errors.append(f"{where}.change must be null when history has one point")

    fuel = data.get("fuel")
    if fuel is not None:
        errors.extend(validate_fuel(fuel))

    problems = data.get("problems")
    if problems is not None:
        if not isinstance(problems, list):
            errors.append("problems must be an array when present")
        else:
            for i, problem in enumerate(problems):
                if not isinstance(problem, dict):
                    errors.append(f"problems[{i}] must be an object")
                    continue
                if not isinstance(problem.get("id"), str) or not problem["id"].strip():
                    errors.append(f"problems[{i}].id is required")
                if not isinstance(problem.get("message"), str) or not problem["message"].strip():
                    errors.append(f"problems[{i}].message is required")

    if not quotes and not isinstance(fuel, dict):
        errors.append("quotes and fuel are both empty")
    return errors


def validate_fuel(fuel):
    errors = []
    if not isinstance(fuel, dict):
        return ["fuel must be an object when present"]
    if fuel.get("unit") != "元/升":
        errors.append('fuel.unit must be "元/升"')
    for field in ("source", "attribution"):
        if not isinstance(fuel.get(field), str) or not fuel[field].strip():
            errors.append(f"fuel.{field} is required")
    if isinstance(fuel.get("attribution"), str) and "riyoujia.com" not in fuel["attribution"]:
        errors.append("fuel.attribution must credit riyoujia.com")
    href = fuel.get("sourceUrl")
    if href != "https://www.riyoujia.com/":
        errors.append("fuel.sourceUrl must be https://www.riyoujia.com/")
    updated = fuel.get("updatedAt")
    if not isinstance(updated, str) or not ISO_DT.match(updated):
        errors.append("fuel.updatedAt must be YYYY-MM-DDTHH:MM:SS+08:00")
    if "nextWindow" in fuel:
        window = fuel.get("nextWindow")
        if not isinstance(window, str) or not window.strip() or len(window) > 40:
            errors.append("fuel.nextWindow must be a short string when present")
    if "stale" in fuel and fuel.get("stale") is not True:
        errors.append("fuel.stale must be true when present")
    provinces = fuel.get("provinces")
    if not isinstance(provinces, list):
        errors.append("fuel.provinces must be an array")
        return errors
    names = []
    for i, row in enumerate(provinces):
        where = f"fuel.provinces[{i}]"
        if not isinstance(row, dict):
            errors.append(f"{where} must be an object")
            continue
        name = row.get("name")
        if name not in PROVINCES:
            errors.append(f"{where}.name must be one of the 31 provincial-level regions")
        else:
            names.append(name)
        url = row.get("url")
        if not isinstance(url, str) or not url.startswith("https://www.riyoujia.com/"):
            errors.append(f"{where}.url must start with https://www.riyoujia.com/")
        for field in ("p92", "p95", "p0"):
            price = row.get(field)
            if not is_number(price) or not 2 <= price <= 30:
                errors.append(f"{where}.{field} must be a price from 2 to 30")
        for field in ("d92", "d95", "d0"):
            if field not in row:
                continue
            delta = row.get(field)
            if not is_number(delta) or abs(delta) > 5:
                errors.append(f"{where}.{field} must be a change within ±5 when present")
        errors.extend(validate_fuel_history(row, where))
    if names and set(names) != set(PROVINCES):
        missing = [name for name in PROVINCES if name not in names]
        errors.append("fuel.provinces must include all 31 regions, missing " + "、".join(missing))
    if len(names) != len(set(names)):
        errors.append("fuel.provinces has a duplicate name")
    if isinstance(provinces, list) and len(provinces) != 31:
        errors.append(f"fuel.provinces has {len(provinces)} rows; expected 31")
    return errors


def validate_fuel_history(row, where):
    errors = []
    history = row.get("history")
    if not isinstance(history, list) or not history:
        errors.append(f"{where}.history must be a non-empty array")
        return errors
    if len(history) > FUEL_HISTORY_MAX:
        errors.append(f"{where}.history has {len(history)} points; limit is {FUEL_HISTORY_MAX}")
    prev_day = ""
    tail = None
    for n, point in enumerate(history):
        pwhere = f"{where}.history[{n}]"
        if not isinstance(point, dict):
            errors.append(f"{pwhere} must be an object")
            tail = None
            continue
        day = point.get("date")
        if not isinstance(day, str) or not ISO_DAY.match(day):
            errors.append(f"{pwhere}.date must be YYYY-MM-DD")
        else:
            try:
                datetime.strptime(day, "%Y-%m-%d")
            except ValueError:
                errors.append(f"{pwhere}.date is not a real date")
            if prev_day and day <= prev_day:
                errors.append(f"{pwhere}.date must be later than {prev_day}")
            prev_day = day
        prices = {}
        for field in ("p92", "p95", "p0"):
            price = point.get(field)
            if not is_number(price) or not 2 <= price <= 30:
                errors.append(f"{pwhere}.{field} must be a price from 2 to 30")
            else:
                prices[field] = price
        tail = prices if len(prices) == 3 else None
    if tail:
        for field in ("p92", "p95", "p0"):
            current = row.get(field)
            if is_number(current) and not close_enough(current, tail[field], 2):
                errors.append(f"{where}.{field} must match the last history price")
    return errors


def main() -> int:
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"ERROR  missing {PATH}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"ERROR  {PATH} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    errors = validate(data)
    if errors:
        print(f"{PATH} has {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"ERROR  {err}", file=sys.stderr)
        return 1

    quotes = data.get("quotes") or []
    fuel = data.get("fuel") or {}
    provinces = fuel.get("provinces") or []
    lengths = [len(row.get("history") or []) for row in provinces if isinstance(row, dict)]
    span = ""
    if lengths:
        span = f", fuel history {min(lengths)}–{max(lengths)} point(s)"
    print(f"OK  {PATH}  {len(quotes)} quote(s), {len(provinces)} province fuel price(s){span}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
