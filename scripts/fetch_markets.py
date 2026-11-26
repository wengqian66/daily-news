#!/usr/bin/env python3
"""Fetch a daily markets snapshot into data/markets.json.

The browser never calls these hosts. A morning routine can run:

    python3 scripts/fetch_markets.py

The write is idempotent: the same session date replaces that point, and a
failed series keeps the previous snapshot instead of inventing a price.
Fuel works the same way. Each successful fetch writes that Shanghai calendar
day's 92/95/0 prices into every province's history, and a same-day rerun
overwrites that day. Older adjustment-day points already in the file stay.
A failed fuel fetch keeps the previous snapshot, including its history.
Stdlib only. Run from any working directory.
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_markets import CATALOG, FUEL_HISTORY_MAX, PROVINCES, validate  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "markets.json"
SH = timezone(timedelta(hours=8))
HISTORY_KEEP = 120
UA = "daily-news-markets/1.0 (+https://github.com/wengqian66/daily-news)"

SGE_URL = "https://www.sge.com.cn/graph/Dailyhq"
SINA_KLINE = (
    "https://stock2.finance.sina.com.cn/futures/api/json.php/"
    "GlobalFuturesService.getGlobalFuturesDailyKLine?symbol={symbol}"
)
SINA_HQ = "https://hq.sinajs.cn/list=hf_GC,hf_SI,hf_CL,hf_OIL"
FUEL_URL = "https://www.riyoujia.com/api/oil.json"

# Verified 2026-11-26:
# SGE Dailyhq rows are [date, open, close, low, high].
# Sina hq.sinajs.cn fields used below were checked against that response.
SERIES = [
    {
        "id": "au9999",
        "name": "沪金 Au99.99",
        "group": "gold",
        "unit": "元/克",
        "decimals": 2,
        "source": "上海黄金交易所",
        "sourceUrl": "https://www.sge.com.cn/sjzx/mrhq",
        "detail": "Au99.99 现货",
        "kind": "sge",
        "instid": "Au99.99",
        "clock": "15:30",
        "clockKind": "close",
    },
    {
        "id": "xau",
        "name": "纽约黄金",
        "group": "gold",
        "unit": "美元/盎司",
        "decimals": 2,
        "source": "新浪财经",
        "sourceUrl": "https://finance.sina.com.cn/futures/quotes/GC.shtml",
        "detail": "COMEX 黄金期货，主力连续",
        "kind": "sina",
        "symbol": "GC",
        "hq": "hf_GC",
    },
    {
        "id": "agtd",
        "name": "沪银 Ag(T+D)",
        "group": "silver",
        "unit": "元/千克",
        "decimals": 2,
        "source": "上海黄金交易所",
        "sourceUrl": "https://www.sge.com.cn/sjzx/mrhq",
        "detail": "Ag(T+D) 延期交收",
        "kind": "sge",
        "instid": "Ag(T+D)",
        "clock": "15:30",
        "clockKind": "close",
    },
    {
        "id": "xag",
        "name": "纽约白银",
        "group": "silver",
        "unit": "美元/盎司",
        "decimals": 3,
        "source": "新浪财经",
        "sourceUrl": "https://finance.sina.com.cn/futures/quotes/SI.shtml",
        "detail": "COMEX 白银期货，主力连续",
        "kind": "sina",
        "symbol": "SI",
        "hq": "hf_SI",
    },
    {
        "id": "brent",
        "name": "布伦特原油",
        "group": "oil",
        "unit": "美元/桶",
        "decimals": 2,
        "source": "新浪财经",
        "sourceUrl": "https://finance.sina.com.cn/futures/quotes/OIL.shtml",
        "detail": "布伦特原油",
        "kind": "sina",
        "symbol": "OIL",
        "hq": "hf_OIL",
    },
    {
        "id": "wti",
        "name": "WTI 原油",
        "group": "oil",
        "unit": "美元/桶",
        "decimals": 2,
        "source": "新浪财经",
        "sourceUrl": "https://finance.sina.com.cn/futures/quotes/CL.shtml",
        "detail": "NYMEX WTI 原油期货，主力连续",
        "kind": "sina",
        "symbol": "CL",
        "hq": "hf_CL",
    },
]


def now_shanghai():
    return datetime.now(SH).replace(microsecond=0)


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%S+08:00")


def rnd(value, decimals):
    return float(f"{value:.{decimals}f}")


def in_range(qid, price):
    spec = CATALOG[qid]
    return spec["low"] <= price <= spec["high"]


def http_bytes(url, *, data=None, headers=None, timeout=30):
    head = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*"}
    if headers:
        head.update(headers)
    last = None
    for attempt in range(2):
        req = urllib.request.Request(
            url,
            data=data,
            headers=head,
            method="POST" if data is not None else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt == 0:
                time.sleep(1.2)
    raise last


def load_previous():
    if not PATH.exists():
        return {}
    try:
        data = json.loads(PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"WARN  ignoring unreadable {PATH}: {exc}", file=sys.stderr)
        return {}
    return data if isinstance(data, dict) else {}


def previous_quote(previous, qid):
    for quote in previous.get("quotes") or []:
        if isinstance(quote, dict) and quote.get("id") == qid:
            return quote
    return None


def parse_sge(payload):
    data = json.loads(payload.decode("utf-8"))
    rows = data.get("time") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise ValueError("SGE payload has no time array")
    points = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 5:
            continue
        day = str(row[0])
        try:
            datetime.strptime(day, "%Y-%m-%d")
            close = float(row[2])
            low = float(row[3])
            high = float(row[4])
        except (TypeError, ValueError):
            continue
        if close <= 0 or low <= 0 or high <= 0 or low > high:
            continue
        if not low - 1e-6 <= close <= high + 1e-6:
            continue
        points.append((day, close))
    if not points:
        raise ValueError("SGE payload has no closes")
    return points


def fetch_sge(instid):
    body = urllib.parse.urlencode({"instid": instid}).encode("utf-8")
    raw = http_bytes(
        SGE_URL,
        data=body,
        headers={
            "Referer": "https://www.sge.com.cn/",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout=30,
    )
    return parse_sge(raw)


def parse_sina_kline(payload):
    data = json.loads(payload.decode("utf-8"))
    if not isinstance(data, list):
        raise ValueError("Sina kline is not an array")
    points = []
    for row in data:
        if not isinstance(row, dict):
            continue
        day = str(row.get("date") or "")
        try:
            datetime.strptime(day, "%Y-%m-%d")
            close = float(row.get("close"))
        except (TypeError, ValueError):
            continue
        if close <= 0:
            continue
        points.append((day, close))
    if not points:
        raise ValueError("Sina kline has no closes")
    return points


def fetch_sina_klines():
    out = {}
    errors = {}
    for spec in SERIES:
        if spec["kind"] != "sina":
            continue
        url = SINA_KLINE.format(symbol=urllib.parse.quote(spec["symbol"]))
        try:
            raw = http_bytes(url, headers={"Referer": "https://finance.sina.com.cn/"}, timeout=40)
            out[spec["id"]] = parse_sina_kline(raw)
        except Exception as exc:  # noqa: BLE001 — one series must not block the others
            errors[spec["id"]] = exc
    return out, errors


def parse_sina_hq(payload):
    text = payload.decode("gb18030", "replace")
    found = {}
    for chunk in text.split(";"):
        if "hq_str_" not in chunk or "=" not in chunk:
            continue
        left, right = chunk.split("=", 1)
        symbol = left.strip().split("hq_str_")[-1]
        raw = right.strip()
        if raw.startswith('"') and raw.endswith('"'):
            raw = raw[1:-1]
        parts = raw.split(",")
        if len(parts) < 13:
            continue
        try:
            price = float(parts[0])
        except ValueError:
            continue
        if price <= 0:
            continue
        day = parts[12].strip()
        clock = parts[6].strip()
        try:
            datetime.strptime(day, "%Y-%m-%d")
        except ValueError:
            continue
        if len(clock) >= 5 and clock[2] == ":":
            clock = clock[:5]
        else:
            clock = ""
        found[symbol] = {"price": price, "date": day, "clock": clock}
    return found


def fetch_sina_hq():
    raw = http_bytes(SINA_HQ, headers={"Referer": "https://finance.sina.com.cn/"}, timeout=20)
    return parse_sina_hq(raw)


def merge_points(old_history, fresh, decimals):
    by_date = {}
    for point in old_history or []:
        if not isinstance(point, dict):
            continue
        day = point.get("date")
        close = point.get("close")
        if isinstance(day, str) and isinstance(close, (int, float)) and not isinstance(close, bool):
            by_date[day] = float(close)
    for day, close in fresh:
        by_date[day] = rnd(close, decimals)
    days = sorted(by_date)[-HISTORY_KEEP:]
    return [{"date": day, "close": by_date[day]} for day in days]


def build_quote(spec, history, *, clock, clock_kind):
    decimals = spec["decimals"]
    last = history[-1]
    prev = history[-2] if len(history) >= 2 else None
    price = rnd(last["close"], decimals)
    change = None
    change_pct = None
    if prev and prev["close"]:
        change = rnd(price - prev["close"], decimals)
        change_pct = rnd(change / prev["close"] * 100, 2)
    shown = clock or "00:00"
    quote = {
        "id": spec["id"],
        "name": spec["name"],
        "group": spec["group"],
        "detail": spec["detail"],
        "price": price,
        "change": change,
        "changePct": change_pct,
        "unit": spec["unit"],
        "decimals": decimals,
        "sessionDate": last["date"],
        "asOf": f"{last['date']}T{shown}:00+08:00",
        "source": spec["source"],
        "sourceUrl": spec["sourceUrl"],
        "history": history,
    }
    if clock and clock_kind:
        quote["clock"] = clock
        quote["clockKind"] = clock_kind
    return quote


def refresh_series(spec, previous, sina_klines, sina_hq, sina_kline_errors):
    old = previous_quote(previous, spec["id"])
    old_history = old.get("history") if isinstance(old, dict) else None
    try:
        if spec["kind"] == "sge":
            fresh = fetch_sge(spec["instid"])
            clock = spec["clock"]
            clock_kind = spec["clockKind"]
        else:
            if spec["id"] in sina_kline_errors:
                raise sina_kline_errors[spec["id"]]
            fresh = list(sina_klines.get(spec["id"]) or [])
            if not fresh:
                raise ValueError("empty kline")
            # No exchange close clock unless the quote payload includes one.
            clock = None
            clock_kind = None
            tick = sina_hq.get(spec["hq"]) if sina_hq else None
            if tick and tick["date"] >= fresh[-1][0]:
                fresh = [item for item in fresh if item[0] != tick["date"]]
                fresh.append((tick["date"], tick["price"]))
                if tick["clock"]:
                    clock = tick["clock"]
                    clock_kind = "tick"
        fresh = [(day, close) for day, close in fresh if in_range(spec["id"], close)]
        if not fresh:
            raise ValueError("no prices inside the expected range")
        history = merge_points(old_history, fresh, spec["decimals"])
        if not history or not in_range(spec["id"], history[-1]["close"]):
            raise ValueError("latest price failed the range check")
        quote = build_quote(spec, history, clock=clock, clock_kind=clock_kind)
        return quote, None
    except Exception as exc:  # noqa: BLE001 — keep the other series
        if isinstance(old, dict) and old.get("price"):
            kept = dict(old)
            kept["stale"] = True
            return kept, f"{spec['name']} 这次没有刷新（{exc}），沿用上次快照"
        return None, f"{spec['name']} 这次没有数据（{exc}）"


def short_region(name):
    text = str(name or "").strip()
    for suffix in ("维吾尔自治区", "壮族自治区", "回族自治区", "自治区", "省", "市"):
        if text.endswith(suffix) and len(text) - len(suffix) >= 2:
            return text[: -len(suffix)]
    return text


def parse_fuel_time(value):
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=SH)
        except ValueError:
            continue
    raise ValueError(f"unrecognized fuel update time {value!r}")


def fetch_fuel():
    raw = http_bytes(FUEL_URL, headers={"Accept": "application/json"}, timeout=25)
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict) or data.get("code") not in (0, "0"):
        raise ValueError(f"fuel API code {data.get('code') if isinstance(data, dict) else 'invalid'}")
    body = data.get("data") if isinstance(data.get("data"), dict) else {}
    rows = body.get("provinces")
    if not isinstance(rows, list):
        raise ValueError("fuel API has no provinces")
    by_name = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = short_region(row.get("name"))
        if name not in PROVINCES or name in by_name:
            continue
        try:
            item = {
                "name": name,
                "url": fuel_url(row.get("url")),
                "p92": rnd(float(row["p92"]), 2),
                "p95": rnd(float(row["p95"]), 2),
                "p0": rnd(float(row["p0"]), 2),
            }
        except (TypeError, ValueError, KeyError):
            continue
        for src, dest in (("d92", "d92"), ("d95", "d95"), ("d0", "d0")):
            if src in row and row[src] is not None and row[src] != "":
                item[dest] = rnd(float(row[src]), 2)
        if not item["url"]:
            continue
        by_name[name] = item
    missing = [name for name in PROVINCES if name not in by_name]
    if missing:
        raise ValueError("missing " + "、".join(missing))
    updated = parse_fuel_time(data.get("update_time"))
    adjust = body.get("adjust") if isinstance(body.get("adjust"), dict) else {}
    window = str(adjust.get("next_window") or "").strip()
    fuel = {
        "source": "日油价",
        "sourceUrl": "https://www.riyoujia.com/",
        "attribution": "数据来源：日油价 riyoujia.com",
        "unit": "元/升",
        "updatedAt": stamp(updated),
        "provinces": [by_name[name] for name in PROVINCES],
    }
    if window:
        fuel["nextWindow"] = window[:40]
    return fuel


def fuel_url(path):
    text = str(path or "").strip()
    if text.startswith("https://www.riyoujia.com/"):
        return text
    if text.startswith("/"):
        return "https://www.riyoujia.com" + text
    return ""


def merge_fuel_history(old_points, day, prices):
    """Keep one 92/95/0 point per calendar day. `day` replaces that day."""
    by_date = {}
    for point in old_points or []:
        if not isinstance(point, dict):
            continue
        saved = point.get("date")
        try:
            datetime.strptime(saved, "%Y-%m-%d")
            p92 = float(point["p92"])
            p95 = float(point["p95"])
            p0 = float(point["p0"])
        except (TypeError, ValueError):
            continue
        if saved > day or min(p92, p95, p0) <= 0:
            continue
        by_date[saved] = {
            "date": saved,
            "p92": rnd(p92, 2),
            "p95": rnd(p95, 2),
            "p0": rnd(p0, 2),
        }
    by_date[day] = {
        "date": day,
        "p92": rnd(float(prices["p92"]), 2),
        "p95": rnd(float(prices["p95"]), 2),
        "p0": rnd(float(prices["p0"]), 2),
    }
    days = sorted(by_date)[-FUEL_HISTORY_MAX:]
    return [by_date[item] for item in days]


def refresh_fuel(previous, day):
    old = previous.get("fuel") if isinstance(previous.get("fuel"), dict) else None
    try:
        fuel = fetch_fuel()
    except Exception as exc:  # noqa: BLE001
        if old:
            kept = dict(old)
            kept["stale"] = True
            return kept, f"国内成品油这次没有刷新（{exc}），沿用上次快照"
        return None, f"国内成品油这次没有数据（{exc}）"
    old_by_name = {}
    for row in (old or {}).get("provinces") or []:
        if isinstance(row, dict):
            old_by_name[row.get("name")] = row.get("history")
    for item in fuel["provinces"]:
        item["history"] = merge_fuel_history(old_by_name.get(item["name"]), day, item)
    return fuel, None


def build(previous):
    problems = []
    quotes = []
    sina_hq = {}
    try:
        sina_hq = fetch_sina_hq()
    except Exception as exc:  # noqa: BLE001
        print(f"WARN  sina hq: {exc}", file=sys.stderr)
    sina_klines, sina_kline_errors = fetch_sina_klines()
    for spec in SERIES:
        quote, problem = refresh_series(spec, previous, sina_klines, sina_hq, sina_kline_errors)
        if quote:
            quotes.append(quote)
            flag = " stale" if quote.get("stale") else ""
            print(f"OK  {spec['id']}  {quote.get('price')}  {quote.get('sessionDate')}{flag}")
        else:
            print(f"MISS  {spec['id']}", file=sys.stderr)
        if problem:
            problems.append({"id": spec["id"], "message": problem})
            print(f"WARN  {problem}", file=sys.stderr)
    fuel, fuel_problem = refresh_fuel(previous, now_shanghai().strftime("%Y-%m-%d"))
    if fuel_problem:
        problems.append({"id": "fuel", "message": fuel_problem})
        print(f"WARN  {fuel_problem}", file=sys.stderr)
    elif fuel:
        print(f"OK  fuel  {len(fuel['provinces'])} provinces  {fuel['updatedAt']}")
    document = {
        "version": 1,
        "timezone": "Asia/Shanghai",
        "generatedAt": stamp(now_shanghai()),
        "quotes": quotes,
    }
    if fuel:
        document["fuel"] = fuel
    if problems:
        document["problems"] = problems
    return document


def write_atomic(document):
    PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    tmp = PATH.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(PATH)


def main() -> int:
    previous = load_previous()
    document = build(previous)
    errors = validate(document)
    if errors:
        print("ERROR  refused to write markets.json:", file=sys.stderr)
        for err in errors:
            print(f"ERROR  {err}", file=sys.stderr)
        return 1
    write_atomic(document)
    print(f"WROTE  {PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
