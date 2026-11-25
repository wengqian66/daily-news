/* 每日资讯 — static hash router.
   Content: data/digests.json and data/last30days/. */
(function () {
  "use strict";

  const main = document.getElementById("main");
  const state = {
    data: null,
    error: null,
    last30: null,
    last30Error: null,
    reports: new Map(),
    reportErrors: new Map(),
    reportPending: new Set(),
    backHash: "#/",
    listName: "brief",
    routeKey: "",
    booted: false,
  };

  const PALETTE = ["#7c2d12", "#9f1239", "#1e3a8a", "#115e59", "#3f6212", "#92400e", "#1f2937"];
  const PREFERRED = ["tech", "markets", "general"];
  const SITE_BASE = "https://wengqian66.github.io/daily-news/";
  const SHARE_DESCRIPTION = "科技 · 财经 · 热点，每天一读。个人维护的每日新闻早报。";
  let copyTimer = 0;
  const ICON_DOC = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 3.5V9h5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function safeUrl(href) {
    try {
      const url = new URL(String(href), "https://example.invalid");
      if (url.origin === "https://example.invalid") return "";
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.href;
    } catch (err) {
      return "";
    }
  }

  function safeHash(hash) {
    const value = String(hash || "");
    if (value === "#/" || value.startsWith("#/?")) return value;
    if (value.startsWith("#/brief") || value.startsWith("#/explore") || value.startsWith("#/about")) return value;
    return "#/";
  }

  function isISODate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function addDays(iso, days) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
  }

  function weekStart(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    const delta = weekday === 0 ? -6 : 1 - weekday;
    return addDays(iso, delta);
  }

  function fmtMd(iso) {
    if (!isISODate(iso)) return String(iso || "");
    const [, month, day] = iso.split("-").map(Number);
    return `${month}月${day}日`;
  }

  function weekdayZh(iso) {
    if (!isISODate(iso)) return "";
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return "周" + "日一二三四五六"[date.getUTCDay()];
  }

  function calendarToday(timeZone) {
    const zone = timeZone || "Asia/Shanghai";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const pick = (type) => parts.find((part) => part.type === type)?.value || "";
      const iso = `${pick("year")}-${pick("month")}-${pick("day")}`;
      if (!isISODate(iso)) throw new Error("bad date");
      return iso;
    } catch (err) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function parseRoute() {
    let raw = (location.hash || "#/").replace(/^#/, "");
    if (!raw) raw = "/";
    const queryAt = raw.indexOf("?");
    const pathPart = queryAt >= 0 ? raw.slice(0, queryAt) : raw;
    const query = queryAt >= 0 ? raw.slice(queryAt + 1) : "";
    let path = pathPart;
    try { path = decodeURIComponent(pathPart); } catch (err) { path = pathPart; }
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);
    const head = parts[0] || "";
    if (!head) return { name: "brief", digestId: "", params };
    if (head === "brief") return { name: "brief", digestId: parts[1] || "", params };
    if (head === "explore") return { name: "explore", params };
    if (head === "about") return { name: "about", params };
    if (head === "story") return { name: "story", id: parts[1] || "", params };
    if (head === "last30days") {
      if (parts.length > 2) return { name: "missing", params };
      if (parts.length === 2) return { name: "last30report", slug: parts[1] || "", params };
      return { name: "last30", slug: "", params };
    }
    return { name: "missing", params };
  }

  function current() {
    const route = parseRoute();
    const params = route.params || new URLSearchParams();
    const view = params.get("view") === "featured" ? "featured" : "all";
    const time = ["today", "week", "all"].includes(params.get("time")) ? params.get("time") : "all";
    const region = params.get("region") === "cn" || params.get("region") === "global" ? params.get("region") : "all";
    return {
      ...route,
      q: params.get("q") || "",
      view,
      cat: params.get("cat") || "all",
      time,
      region,
    };
  }

  function exploreHash({ view, cat, time, region, q }) {
    const params = new URLSearchParams();
    if (view && view !== "all") params.set("view", view);
    if (cat && cat !== "all") params.set("cat", cat);
    if (time && time !== "all") params.set("time", time);
    if (region === "cn" || region === "global") params.set("region", region);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `#/explore?${query}` : "#/explore";
  }

  function briefHash(id, q, region) {
    const base = id ? `#/brief/${encodeURIComponent(id)}` : "#/";
    const params = new URLSearchParams();
    if (region === "cn" || region === "global") params.set("region", region);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  function sortedDigests(data) {
    return [...(data?.digests || [])].sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }

  function decorate(story, category, digest) {
    return {
      ...story,
      featured: Boolean(story.featured),
      type: story.type || "文章",
      categoryId: category.id,
      categoryHeading: category.heading || category.id,
      digestId: digest.id,
      digestLabel: digest.label || digest.id,
    };
  }

  function regionMeta(region) {
    if (region === "cn") return { code: "cn", label: "国内", rank: 0 };
    if (region === "global") return { code: "global", label: "国外", rank: 1 };
    return { code: "", label: "", rank: 2 };
  }

  function sortByRegion(stories) {
    return stories
      .map((story, index) => ({ story, index }))
      .sort((a, b) => regionMeta(a.story.region).rank - regionMeta(b.story.region).rank || a.index - b.index)
      .map((item) => item.story);
  }

  function storiesInCategory(category, digest) {
    const items = (category.stories || []).map((story) => decorate(story, category, digest));
    return sortByRegion(items);
  }

  function allStories(data) {
    const stories = [];
    sortedDigests(data).forEach((digest) => {
      (digest.categories || []).forEach((category) => {
        stories.push(...storiesInCategory(category, digest));
      });
    });
    return stories;
  }

  function categoriesFromData(data) {
    const map = new Map();
    (data?.digests || []).forEach((digest) => {
      (digest.categories || []).forEach((category) => {
        if (category?.id && !map.has(category.id)) map.set(category.id, category.heading || category.id);
      });
    });
    return [...map.entries()]
      .sort((a, b) => {
        const ai = PREFERRED.indexOf(a[0]);
        const bi = PREFERRED.indexOf(b[0]);
        const ar = ai === -1 ? 100 : ai;
        const br = bi === -1 ? 100 : bi;
        if (ar !== br) return ar - br;
        return String(a[1]).localeCompare(String(b[1]), "zh");
      })
      .map(([id, heading]) => ({ id, heading }));
  }

  function matchesQuery(story, q) {
    const tokens = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = [story.title, story.excerpt, story.bodyZh, story.source, regionMeta(story.region).label].join("\n").toLowerCase();
    return tokens.every((token) => hay.includes(token));
  }

  function matchesTime(digestId, time, today) {
    if (time === "all") return true;
    if (!isISODate(digestId) || !isISODate(today)) return false;
    if (time === "today") return digestId === today;
    if (time === "week") return weekStart(digestId) === weekStart(today);
    return true;
  }

  function storyMatches(story, filters) {
    if (filters.view === "featured" && !story.featured) return false;
    if (filters.cat !== "all" && story.categoryId !== filters.cat) return false;
    if (filters.region && filters.region !== "all" && story.region !== filters.region) return false;
    if (!matchesTime(story.digestId, filters.time, filters.today)) return false;
    return matchesQuery(story, filters.q);
  }

  function initials(source) {
    const text = String(source || "").trim();
    if (!text) return "·";
    if (/[\u4e00-\u9fff]/.test(text[0])) return text[0];
    const parts = text.split(/[/·\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      const left = parts[0][0];
      const right = parts[1][0];
      if (left.toLowerCase() !== right.toLowerCase()) return (left + right).toUpperCase();
    }
    return (parts[0] || text).slice(0, 2).toUpperCase();
  }

  function avatarColor(source) {
    let hash = 0;
    const text = String(source || "");
    for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
    return PALETTE[hash % PALETTE.length];
  }

  function avatar(source, large) {
    return `<span class="avatar${large ? " lg" : ""}" style="background:${avatarColor(source)}" aria-hidden="true">${esc(initials(source))}</span>`;
  }

  function oneLine(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function firstParagraph(text) {
    return oneLine(String(text || "").split(/\n{2,}/)[0] || "");
  }

  function paragraphs(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${esc(part)}</p>`)
      .join("");
  }

  function readingMinutes(text) {
    const count = String(text || "").replace(/\s/g, "").length;
    return Math.max(1, Math.round(count / 350));
  }

  function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ""); } catch (err) { return ""; }
  }

  function siteName() {
    return state.data?.site?.title || "每日资讯";
  }

  function canonicalBase() {
    const configured = safeUrl(state.data?.site?.url || "");
    if (!configured) return SITE_BASE;
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  function storyPermalink(id) {
    return `${canonicalBase()}#/story/${encodeURIComponent(id)}`;
  }

  function pagePermalink(route) {
    const base = canonicalBase();
    if (state.data && route && route.name === "story" && route.id) {
      const story = allStories(state.data).find((item) => item.id === route.id);
      if (story) return storyPermalink(story.id);
    }
    const hash = location.hash || "";
    if (!hash || hash === "#" || hash === "#/") return base;
    return `${base}${hash}`;
  }

  function setMeta(attr, key, content) {
    const selector = `meta[${attr}="${key}"]`;
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }

  function clipShare(text, max) {
    const value = oneLine(text);
    if (!value) return "";
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function shareDescription(route) {
    const tagline = String(state.data?.site?.tagline || "").trim();
    const description = String(state.data?.site?.description || "").trim();
    let fallback = SHARE_DESCRIPTION;
    if (tagline && description) {
      const lead = /[。！？]$/.test(tagline) ? tagline : `${tagline}。`;
      fallback = description.startsWith(tagline) ? description : `${lead}${description}`;
    } else {
      fallback = description || tagline || SHARE_DESCRIPTION;
    }
    if (route && route.name === "last30") return state.last30?.dek || fallback;
    if (route && route.name === "last30report") {
      const entry = last30Entry(route.slug);
      return clipShare(entry && entry.lede, 140) || fallback;
    }
    if (!state.data || !route || route.name !== "story") return fallback;
    const story = allStories(state.data).find((item) => item.id === route.id);
    if (!story) return fallback;
    return clipShare(firstParagraph(story.excerpt) || story.excerpt, 140) || fallback;
  }

  function applyShareMeta(route) {
    const title = pageTitle(route);
    const description = shareDescription(route);
    const url = pagePermalink(route);
    const isStory = Boolean(
      state.data && route.name === "story" && allStories(state.data).some((item) => item.id === route.id),
    );
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:type", isStory ? "article" : "website");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:url", url);
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.setAttribute("content", description);
  }

  function zone() {
    return state.data?.site?.timezone || "Asia/Shanghai";
  }

  function zoneLabel() {
    return state.data?.site?.timezoneLabel || "上海";
  }

  function chip(href, label, on) {
    return `<a class="chip" href="${esc(href)}"${on ? ' aria-current="true"' : ""}>${esc(label)}</a>`;
  }

  function regionBadge(region) {
    const meta = regionMeta(region);
    if (!meta.label) return "";
    return `<span class="region-badge" data-region="${esc(meta.code)}">${esc(meta.label)}</span>`;
  }

  function cardMarks(story, pill) {
    const marks = `${regionBadge(story.region)}${pill || ""}`;
    return marks ? `<span class="card-marks">${marks}</span>` : "";
  }

  function cardHTML(story, options) {
    const showCategory = options && options.showCategory;
    const typeLabel = showCategory && story.categoryHeading
      ? `${story.type} · ${story.categoryHeading}`
      : story.type;
    const metaDate = story.date || fmtMd(story.digestId);
    const pill = story.featured ? '<span class="pill">精选</span>' : "";
    return `<article class="card" data-story-id="${esc(story.id)}">
      <a class="card-link" href="#/story/${encodeURIComponent(story.id)}">
        <div class="card-top"><span class="type">${ICON_DOC}<span>${esc(typeLabel)}</span></span>${cardMarks(story, pill)}</div>
        <h3 class="card-title">${esc(story.title)}</h3>
        <p class="card-excerpt">${esc(oneLine(story.excerpt))}</p>
        <p class="card-meta">${avatar(story.source)}<span>${esc(story.source)} · ${esc(metaDate)}</span></p>
      </a>
    </article>`;
  }

  function featureHTML(story) {
    const date = story.date || fmtMd(story.digestId);
    return `<article class="feature" data-story-id="${esc(story.id)}">
      <a class="feature-link" href="#/story/${encodeURIComponent(story.id)}">
        <div class="feature-copy">
          <div class="card-top"><span class="type">${ICON_DOC}<span>${esc(story.type)} · ${esc(story.categoryHeading || "")}</span></span>${cardMarks(story, '<span class="pill">精选</span>')}</div>
          <h2 class="feature-title">${esc(story.title)}</h2>
          <p class="feature-excerpt">${esc(firstParagraph(story.excerpt))}</p>
          <p class="card-meta">${avatar(story.source)}<span>${esc(story.source)} · ${esc(date)}</span></p>
        </div>
        <div class="feature-cover" aria-hidden="true">
          <p class="feature-cover-top">${esc(story.categoryHeading || "")}</p>
          <p class="feature-cover-date">${esc(date)}</p>
          <p class="feature-cover-bottom">${esc(siteName())}</p>
        </div>
      </a>
    </article>`;
  }

  function footerHTML() {
    const repo = safeUrl(state.data?.site?.repo || "");
    const link = repo
      ? `<p><a href="${esc(repo)}" target="_blank" rel="noopener noreferrer">GitHub 上的源码与更新说明</a></p>`
      : "";
    return `<footer class="site-foot"><p>${esc(siteName())} · 个人阅读清单 · 全文与版权在来源网站</p>${link}</footer>`;
  }

  function emptyBlock(title, message, href, action) {
    const button = href ? `<a class="btn" href="${esc(href)}">${esc(action)}</a>` : "";
    return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(message)}</p>${button}</div>`;
  }

  function daySwitch(digest, digests, q, today, region) {
    const index = digests.findIndex((item) => item.id === digest.id);
    const newer = index > 0 ? digests[index - 1] : null;
    const older = index >= 0 && index < digests.length - 1 ? digests[index + 1] : null;
    const olderControl = older
      ? `<a class="day-btn" href="${esc(briefHash(older.id, q, region))}" aria-label="前一天，${esc(older.label || older.id)}">前一天</a>`
      : '<button type="button" class="day-btn" disabled aria-label="没有更早的一天">前一天</button>';
    const newerControl = newer
      ? `<a class="day-btn" href="${esc(briefHash(newer.id, q, region))}" aria-label="后一天，${esc(newer.label || newer.id)}">后一天</a>`
      : '<button type="button" class="day-btn" disabled aria-label="没有更晚的一天">后一天</button>';
    const options = digests.map((item) => {
      const mark = item.id === today ? " · 今天" : "";
      const selected = item.id === digest.id ? " selected" : "";
      return `<option value="${esc(item.id)}"${selected}>${esc(item.label || item.id)}${mark}</option>`;
    }).join("");
    return `<div class="day-switch" role="group" aria-label="切换日期">
      ${olderControl}
      <label class="day-picker"><span class="visually-hidden">选择日期</span><select class="day-select" id="day-select">${options}</select></label>
      ${newerControl}
    </div>`;
  }

  function viewBrief(route) {
    const digests = sortedDigests(state.data);
    const today = calendarToday(zone());
    if (!digests.length) {
      return `<div class="page"><h1>还没有早报</h1><p class="dek">data/digests.json 里还没有内容。加一天之后刷新即可。</p>${footerHTML()}</div>`;
    }
    const digest = route.digestId
      ? digests.find((item) => item.id === route.digestId)
      : digests[0];
    if (!digest) {
      return `<div class="page"><h1>没有这一天</h1><p class="dek">${esc(route.digestId)} 不在早报里。</p><p><a class="btn" href="#/">看最新一天</a></p>${footerHTML()}</div>`;
    }
    const blocks = [];
    (digest.categories || []).forEach((category) => {
      const stories = storiesInCategory(category, digest)
        .filter((story) => route.region === "all" || story.region === route.region)
        .filter((story) => matchesQuery(story, route.q));
      if (stories.length) blocks.push({ category, stories });
    });
    const jumps = blocks.map((block) => (
      `<button type="button" data-action="jump" data-target="cat-${esc(block.category.id)}">${esc(block.category.heading || block.category.id)}</button>`
    )).join("");
    const sections = blocks.map((block, index) => `
      <section class="cat-block" id="cat-${esc(block.category.id)}" aria-labelledby="heading-${esc(block.category.id)}">
        <header class="section-head">
          <span class="section-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h2 id="heading-${esc(block.category.id)}">${esc(block.category.heading || "")}</h2>
            <p class="section-count">${block.stories.length} 则</p>
          </div>
        </header>
        <div class="grid">${block.stories.map((story) => cardHTML(story)).join("")}</div>
      </section>`).join("");
    const count = blocks.reduce((sum, block) => sum + block.stories.length, 0);
    const place = regionMeta(route.region).label;
    let countLine = `共 ${count} 则`;
    if (route.q && place) countLine = `${place} · 匹配 ${count} 则`;
    else if (route.q) countLine = `匹配 ${count} 则`;
    else if (place) countLine = `${place} ${count} 则`;
    const lede = digest.summary
      ? `<aside class="lede"><p class="lede-kicker">今日导读</p><p>${esc(digest.summary)}</p></aside>`
      : "";
    const regionChips = [["all", "全部"], ["cn", "国内"], ["global", "国外"]]
      .map(([value, label]) => chip(briefHash(digest.id, route.q, value), label, route.region === value))
      .join("");
    const regionRow = `<div class="filters"><fieldset class="filter-row"><legend>地区</legend><div class="chips">${regionChips}</div></fieldset></div>`;
    let empty = "";
    if (!blocks.length) {
      let message = "这一天还没有故事。";
      let href = "";
      let action = "";
      if (route.q && place) {
        message = `没有标题、摘要、详述或来源包含「${route.q.trim()}」的${place}故事。`;
        href = briefHash(digest.id, "", route.region);
        action = "清除搜索";
      } else if (route.q) {
        message = `没有标题、摘要、详述或来源包含「${route.q.trim()}」的故事。`;
        href = briefHash(digest.id, "", "all");
        action = "清除搜索";
      } else if (place) {
        message = `这一天没有${place}故事。`;
        href = briefHash(digest.id, "", "all");
        action = "显示全部";
      }
      empty = emptyBlock("这一天没有匹配的故事", message, href, action);
    }
    const tagline = state.data?.site?.tagline || "";
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">每日早报</p>
        <div class="hero-top">
          <h1>${esc(digest.label || fmtMd(digest.id))}</h1>
          ${daySwitch(digest, digests, route.q, today, route.region)}
        </div>
        <p class="dek">${esc(digest.coverage || "")}</p>
        <p class="subdek">${esc([tagline, countLine].filter(Boolean).join(" · "))}</p>
      </header>
      ${regionRow}
      ${lede}
      ${jumps ? `<nav class="jump" aria-label="分类">${jumps}</nav>` : ""}
      ${sections}
      ${empty}
      ${footerHTML()}
    </div>`;
  }

  function filtersHTML(route, categories) {
    const row = (legend, items, key) => {
      const chips = items.map(([value, label]) => {
        const next = {
          view: route.view,
          cat: route.cat,
          time: route.time,
          region: route.region,
          q: route.q,
          [key]: value,
        };
        return chip(exploreHash(next), label, route[key] === value);
      }).join("");
      return `<fieldset class="filter-row"><legend>${legend}</legend><div class="chips">${chips}</div></fieldset>`;
    };
    const views = [["featured", "精选"], ["all", "全部"]];
    const times = [["today", "今天"], ["week", "本周"], ["all", "全部"]];
    const regions = [["all", "全部"], ["cn", "国内"], ["global", "国外"]];
    const cats = [["all", "全部"], ...categories.map((category) => [category.id, category.heading])];
    return `<div class="filters">${row("视角", views, "view")}${row("分类", cats, "cat")}${row("地区", regions, "region")}${row("时间", times, "time")}</div>`;
  }

  function viewExplore(route) {
    const categories = categoriesFromData(state.data);
    if (route.cat !== "all" && !categories.some((category) => category.id === route.cat)) {
      history.replaceState(null, "", `${location.pathname}${location.search}${exploreHash({ ...route, cat: "all" })}`);
      route = current();
    }
    const today = calendarToday(zone());
    const start = isISODate(today) ? weekStart(today) : today;
    const end = isISODate(start) ? addDays(start, 6) : start;
    const matches = allStories(state.data).filter((story) => storyMatches(story, {
      view: route.view,
      cat: route.cat,
      time: route.time,
      region: route.region,
      q: route.q,
      today,
    }));
    const hero = matches.find((story) => story.featured) || null;
    const rest = hero ? matches.filter((story) => story !== hero) : matches;
    const hasFilter = route.view !== "all" || route.cat !== "all" || route.time !== "all" || route.region !== "all" || route.q;
    const place = regionMeta(route.region).label;
    let empty = "";
    if (!matches.length) {
      let message = "这一筛选下暂时没有故事。";
      if (route.time === "today" && !route.q && route.view === "all" && route.cat === "all") {
        message = place
          ? `今天（${zoneLabel()}，${fmtMd(today)} · ${weekdayZh(today)}）没有${place}故事。`
          : `今天（${zoneLabel()}，${fmtMd(today)} · ${weekdayZh(today)}）还没有早报。`;
      } else if (route.time === "week" && !route.q && route.view === "all" && route.cat === "all") {
        message = place
          ? `本周（${fmtMd(start)}–${fmtMd(end)}，${zoneLabel()}）没有${place}故事。`
          : `本周（${fmtMd(start)}–${fmtMd(end)}，${zoneLabel()}）没有匹配的故事。`;
      } else if (route.q) {
        message = place
          ? `没有找到与「${route.q.trim()}」匹配的${place}故事。`
          : `没有找到与「${route.q.trim()}」匹配的故事。`;
      } else if (route.view === "featured" && !place && route.cat === "all" && route.time === "all") {
        message = "还没有标成精选的故事。";
      } else if (place && route.view === "all" && route.cat === "all" && route.time === "all") {
        message = `还没有标成${place}的故事。`;
      }
      empty = emptyBlock("没有匹配的故事", message, hasFilter ? "#/explore" : "", hasFilter ? "清除筛选" : "");
    }
    const grid = rest.length
      ? `<div class="grid">${rest.map((story) => cardHTML(story, { showCategory: true })).join("")}</div>`
      : "";
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">公共精选</p>
        <h1>内容广场</h1>
        <p class="dek">把每一天的故事铺平。用视角、分类、地区、时间和搜索收窄。</p>
      </header>
      ${filtersHTML(route, categories)}
      <p class="tz-note">时间按${esc(zoneLabel())}时区。今天是 ${esc(fmtMd(today))} · ${esc(weekdayZh(today))}，本周 ${esc(fmtMd(start))}–${esc(fmtMd(end))}。</p>
      <p class="result-line" aria-live="polite">${matches.length} 则${place ? ` · ${esc(place)}` : ""}${route.q ? ` · 含「${esc(route.q.trim())}」` : ""}</p>
      ${hero ? featureHTML(hero) : ""}
      ${grid}
      ${empty}
      ${footerHTML()}
    </div>`;
  }

  function linkLang(link) {
    const code = String(link?.lang || "").trim().toLowerCase();
    if (code === "zh") return { code: "zh", label: "中文" };
    if (code === "en") return { code: "en", label: "英文" };
    return { code: "", label: "" };
  }

  function linkRank(link) {
    const code = String(link?.lang || "").trim().toLowerCase();
    if (code === "zh") return 0;
    if (code === "en") return 2;
    return 1;
  }

  function linkCards(story) {
    const links = [...(story.links || [])].sort((a, b) => linkRank(a) - linkRank(b));
    const cards = [];
    links.forEach((link) => {
      const href = safeUrl(link.href);
      if (!href) return;
      const host = hostOf(href);
      const site = link.site || host;
      const secondary = host && site && host.toLowerCase() !== String(site).toLowerCase()
        ? `${site} · ${host}`
        : (site || host);
      const lang = linkLang(link);
      const badge = lang.label
        ? `<span class="lang-badge" data-lang="${esc(lang.code)}">${esc(lang.label)}</span>`
        : "";
      cards.push({ href, site, host, secondary, title: link.title || site || "原文", badge });
    });
    if (!cards.length) return `<p class="fine">这条没有可用的原文链接。</p>`;
    const items = cards.map((card, index) => {
      const indexMark = cards.length > 1
        ? `<span class="link-index" aria-hidden="true">${index + 1}</span>`
        : "";
      return `<li><a class="link-card" href="${esc(card.href)}" target="_blank" rel="noopener noreferrer">
        <span class="link-mark">${indexMark}${avatar(card.site || card.host)}</span>
        <span class="grow"><span class="link-title">${esc(card.title)}</span><span class="link-site">${esc(card.secondary)}</span></span>
        <span class="link-actions">${card.badge}<span class="newtab">新标签打开</span></span>
      </a></li>`;
    }).join("");
    const note = cards.length > 1 ? `<p class="fine">共 ${cards.length} 条来源</p>` : "";
    return `${note}<ol class="link-list">${items}</ol>`;
  }

  function bodyZhSection(story) {
    const text = String(story.bodyZh || "").trim();
    if (!text) return "";
    return `<section class="body-zh" aria-labelledby="body-zh-title">
      <h2 id="body-zh-title">中文详述</h2>
      <div class="prose">${paragraphs(text)}</div>
      <p class="fine">详述是编者整理的中文说明，不是原文转载。数字和引语以原文为准。</p>
    </section>`;
  }

  function viewStory(route) {
    const story = allStories(state.data).find((item) => item.id === route.id);
    if (!story) {
      return `<div class="page page-narrow"><h1>没有这则故事</h1><p class="dek">它可能已从早报里拿走，或链接不完整。</p><p><a class="btn" href="#/">回每日早报</a></p>${footerHTML()}</div>`;
    }
    const siblings = allStories(state.data).filter((item) => item.digestId === story.digestId);
    const index = siblings.findIndex((item) => item.id === story.id);
    const prev = index > 0 ? siblings[index - 1] : null;
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
    const pagerLinks = [
      prev ? `<a href="#/story/${encodeURIComponent(prev.id)}"><span>上一则</span><strong>${esc(prev.title)}</strong></a>` : "",
      next ? `<a class="${prev ? "next" : ""}" href="#/story/${encodeURIComponent(next.id)}"><span>下一则</span><strong>${esc(next.title)}</strong></a>` : "",
    ].filter(Boolean).join("");
    const back = safeHash(state.backHash);
    const backLabel = back.startsWith("#/explore") ? "返回内容广场" : "返回每日早报";
    const pill = story.featured
      ? `<a class="pill" href="${esc(exploreHash({ view: "featured" }))}">精选</a>`
      : "";
    const permalink = storyPermalink(story.id);
    const readText = [story.excerpt, story.bodyZh].filter((part) => String(part || "").trim()).join("\n");
    return `<div class="page page-narrow">
      <p class="back"><a class="back-link" href="${esc(back)}">← ${backLabel}</a></p>
      <article>
        <header class="article-head">
          <p class="kicker-row">
            <a class="kicker-link" href="${esc(exploreHash({ cat: story.categoryId }))}">${esc(story.categoryHeading || "")}</a>
            ${regionBadge(story.region)}
            ${pill}
          </p>
          <h1>${esc(story.title)}</h1>
          <p class="byline">
            ${avatar(story.source, true)}
            <span>${esc(story.source)} · <time datetime="${esc(story.digestId)}">${esc(story.date || fmtMd(story.digestId))}</time></span>
            <a class="text-link" href="${esc(briefHash(story.digestId, ""))}">${esc(story.digestLabel || story.digestId)}</a>
            <span>约 ${readingMinutes(readText)} 分钟</span>
          </p>
          <div class="share-row">
            <button class="copy-link" type="button" data-action="copy-link" data-url="${esc(permalink)}" aria-live="polite">复制链接</button>
            <span class="copy-status" role="status" aria-live="polite"></span>
            <p class="copy-manual" hidden>
              <label>
                <span class="visually-hidden">故事链接</span>
                <input class="copy-field" type="text" readonly value="${esc(permalink)}">
              </label>
            </p>
          </div>
          <p class="fine">个人摘要，用来决定要不要读原文。数字和引语以原文为准。</p>
        </header>
        <div class="prose">${paragraphs(story.excerpt)}</div>
        ${bodyZhSection(story)}
        <section class="sources">
          <h2>原文</h2>
          ${linkCards(story)}
        </section>
      </article>
      ${pagerLinks ? `<nav class="pager${prev && next ? "" : " single"}" aria-label="同一天的相邻故事">${pagerLinks}</nav>` : ""}
      ${footerHTML()}
    </div>`;
  }

  function isReportSlug(slug) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || "")) && String(slug).length <= 80;
  }

  function reportFileName(entry) {
    const slug = entry && entry.slug ? entry.slug : "";
    const name = String((entry && entry.file) || (slug ? `${slug}.json` : ""));
    if (!/^[a-z0-9][a-z0-9.-]*\.json$/.test(name) || name.includes("..")) return "";
    return name;
  }

  function sortedReports(index) {
    return [...(index?.reports || [])].sort((a, b) => {
      const byEnd = String(b.windowEnd || "").localeCompare(String(a.windowEnd || ""));
      if (byEnd) return byEnd;
      const byGenerated = String(b.generated || "").localeCompare(String(a.generated || ""));
      if (byGenerated) return byGenerated;
      return String(b.slug || "").localeCompare(String(a.slug || ""));
    });
  }

  function last30Entry(slug) {
    return sortedReports(state.last30).find((item) => item.slug === slug) || null;
  }

  function last30ListHash(q) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `#/last30days?${query}` : "#/last30days";
  }

  function reportMatches(report, q) {
    const tokens = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = [
      report.topic,
      report.title,
      report.lede,
      report.searchText,
      report.coverageLabel,
      report.skill,
      report.skillVersion,
      report.windowStart,
      report.windowEnd,
      report.timezone,
      report.generated,
    ].join("\n").toLowerCase();
    return tokens.every((token) => hay.includes(token));
  }

  function renderInlines(text) {
    const source = String(text || "");
    const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let html = "";
    let last = 0;
    let match;
    while ((match = re.exec(source))) {
      html += esc(source.slice(last, match.index));
      const href = safeUrl(match[2]);
      const label = esc(match[1]);
      html += href
        ? `<a class="text-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : label;
      last = match.index + match[0].length;
    }
    html += esc(source.slice(last));
    return html;
  }

  function parseReportBody(body) {
    const chunks = String(body || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const blocks = [];
    const pushChunk = (chunk) => {
      if (!chunk) return;
      if (chunk === "What I learned:" || chunk.startsWith("What I learned:")) {
        blocks.push({ type: "kicker", text: "What I learned" });
        const rest = chunk.slice("What I learned:".length).trim();
        if (rest) pushChunk(rest);
        return;
      }
      if (chunk.startsWith(">")) {
        const text = chunk.split("\n").map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
        const market = text.includes("Polymarket") || text.startsWith("📊");
        blocks.push({ type: market ? "market" : "quote", text });
        return;
      }
      if (chunk.startsWith("KEY PATTERNS")) {
        const lines = chunk.split("\n");
        blocks.push({
          type: "patterns",
          title: lines[0].trim(),
          items: lines.slice(1).map((line) => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean),
        });
        return;
      }
      const section = chunk.match(/^\*\*([^*]+)\*\*\s*(?:-\s+)?([\s\S]*)$/);
      if (section) {
        blocks.push({ type: "section", title: section[1].trim(), text: section[2].trim() });
        return;
      }
      blocks.push({ type: "prose", text: chunk });
    };
    chunks.forEach((chunk) => {
      const groups = [];
      let current = [];
      let quoting = null;
      const flush = () => {
        if (!current.length) return;
        groups.push(current.join("\n").trim());
        current = [];
      };
      chunk.split("\n").forEach((line) => {
        const isQuote = /^>\s?/.test(line);
        if (quoting === null) quoting = isQuote;
        if (isQuote !== quoting) {
          flush();
          quoting = isQuote;
        }
        current.push(line);
      });
      flush();
      groups.forEach((group) => pushChunk(group));
    });
    const grouped = [];
    let current = null;
    blocks.forEach((block) => {
      if (block.type === "section") {
        current = { type: "section", title: block.title, text: block.text, notes: [] };
        grouped.push(current);
        return;
      }
      if (current && (block.type === "quote" || block.type === "market")) {
        current.notes.push(block);
        return;
      }
      current = null;
      grouped.push(block);
    });
    return grouped;
  }

  function noteHTML(note) {
    if (note.type === "market") return `<aside class="market-line"><p>${renderInlines(note.text)}</p></aside>`;
    return `<blockquote class="pull"><p>${renderInlines(note.text)}</p></blockquote>`;
  }

  function reportBodyHTML(body) {
    let sectionNo = 0;
    return parseReportBody(body).map((block) => {
      if (block.type === "kicker") return `<p class="lede-kicker">${esc(block.text)}</p>`;
      if (block.type === "patterns") {
        const items = block.items.map((item) => `<li>${renderInlines(item)}</li>`).join("");
        return `<section class="report-section"><h2>${esc(block.title)}</h2><ol class="pattern-list">${items}</ol></section>`;
      }
      if (block.type === "prose") return `<div class="prose"><p>${renderInlines(block.text)}</p></div>`;
      if (block.type === "quote" || block.type === "market") return noteHTML(block);
      sectionNo += 1;
      const notes = (block.notes || []).map((note) => noteHTML(note)).join("");
      return `<section class="report-section">
        <header class="section-head">
          <span class="section-index">${String(sectionNo).padStart(2, "0")}</span>
          <h2>${esc(block.title)}</h2>
        </header>
        ${block.text ? `<div class="prose"><p>${renderInlines(block.text)}</p></div>` : ""}
        ${notes}
      </section>`;
    }).join("");
  }

  function reportCardHTML(report) {
    const version = report.skillVersion ? `v${report.skillVersion}` : "";
    const meta = [report.skill, version].filter(Boolean).join(" ");
    const when = report.coverageLabel || [report.windowStart, report.windowEnd].filter(Boolean).join("–");
    return `<article class="card">
      <a class="card-link" href="#/last30days/${encodeURIComponent(report.slug)}">
        <div class="card-top"><span class="type">${ICON_DOC}<span>主题综述${report.topic ? ` · ${esc(report.topic)}` : ""}</span></span></div>
        <h3 class="card-title">${esc(report.title || report.topic || report.slug)}</h3>
        <p class="card-excerpt">${esc(oneLine(report.lede || ""))}</p>
        <p class="card-meta">${avatar(report.topic || report.title || "近")}<span>${esc([meta, when].filter(Boolean).join(" · "))}</span></p>
      </a>
    </article>`;
  }

  function viewLast30(route) {
    if (!state.last30 && !state.last30Error) {
      return `<div class="page"><p class="loading">正在读取近 30 天…</p></div>`;
    }
    if (state.last30Error) {
      return `<div class="page"><h1>近 30 天没有载入</h1><p class="dek">${esc(state.last30Error)}</p><p><button class="btn" type="button" data-action="retry">重试</button></p>${footerHTML()}</div>`;
    }
    const title = state.last30.title || "近 30 天";
    const dek = state.last30.dek || "按主题回看一个时间窗口里的社区讨论。";
    const all = sortedReports(state.last30);
    const reports = all.filter((item) => reportMatches(item, route.q));
    let body = "";
    if (!all.length) {
      body = emptyBlock("还没有综述", "data/last30days/index.json 里还没有报告。加一篇之后刷新即可。", "", "");
    } else if (!reports.length) {
      body = emptyBlock(
        "没有匹配的综述",
        `没有主题、标题或窗口包含「${route.q.trim()}」的综述。`,
        "#/last30days",
        "清除搜索",
      );
    } else {
      body = `<div class="report-list">${reports.map((item) => reportCardHTML(item)).join("")}</div>`;
    }
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">主题综述</p>
        <h1>${esc(title)}</h1>
        <p class="dek">${esc(dek)}</p>
      </header>
      <p class="result-line" aria-live="polite">${reports.length} 篇${route.q ? ` · 含「${esc(route.q.trim())}」` : ""}</p>
      ${body}
      ${footerHTML()}
    </div>`;
  }

  function sourceFooterHTML(report) {
    const lines = Array.isArray(report.sourceFooter) ? report.sourceFooter : [];
    const note = String(report.coverageNote || "").trim();
    if (!note && !lines.length) return "";
    const items = lines.map((line) => `<li>${esc(line)}</li>`).join("");
    return `<section class="sources" aria-labelledby="last30-sources">
      <h2 id="last30-sources">来源</h2>
      ${note ? `<aside class="lede"><p>${esc(note)}</p></aside>` : ""}
      ${items ? `<ul class="source-lines">${items}</ul>` : ""}
    </section>`;
  }

  function viewLast30Report(route) {
    if (!state.last30 && !state.last30Error) {
      return `<div class="page page-narrow"><p class="loading">正在读取近 30 天…</p></div>`;
    }
    const slug = route.slug || "";
    const entry = last30Entry(slug);
    if (!isReportSlug(slug) || (state.last30 && !entry)) {
      return `<div class="page page-narrow"><h1>没有这篇综述</h1><p class="dek">近 30 天的清单里没有这一篇。</p><p><a class="btn" href="#/last30days">回近 30 天</a></p>${footerHTML()}</div>`;
    }
    if (!entry && state.last30Error) {
      return `<div class="page page-narrow"><h1>近 30 天没有载入</h1><p class="dek">${esc(state.last30Error)}</p><p><button class="btn" type="button" data-action="retry">重试</button></p>${footerHTML()}</div>`;
    }
    if (!state.reports.has(slug)) {
      loadReport(slug);
      return `<div class="page page-narrow"><p class="loading">正在打开这篇综述…</p></div>`;
    }
    const report = state.reports.get(slug);
    if (!report) {
      const message = state.reportErrors.get(slug) || "这篇综述没有打开。";
      return `<div class="page page-narrow"><h1>这篇综述没有打开</h1><p class="dek">${esc(message)}</p><p><a class="btn" href="#/last30days">回近 30 天</a></p>${footerHTML()}</div>`;
    }
    const topic = report.topic || entry.topic || "";
    const title = report.title || entry.title || slug;
    const windowLabel = (report.window && report.window.label) || entry.coverageLabel || "";
    const zoneName = (report.window && report.window.timezone) || entry.timezone || "";
    const version = report.skillVersion || entry.skillVersion || "";
    const skill = report.skill || entry.skill || "last30days";
    const generated = report.generated || entry.generated || "";
    const permalink = pagePermalink(route);
    const byline = [
      version ? `${skill} v${version}` : skill,
      windowLabel,
      zoneName ? `上海（${zoneName}）` : "",
      generated ? `生成于 ${generated}` : "",
    ].filter(Boolean).join(" · ");
    return `<div class="page page-narrow">
      <p class="back"><a class="back-link" href="#/last30days">← 返回近 30 天</a></p>
      <article>
        <header class="article-head">
          <p class="kicker-row"><span class="eyebrow">${esc(topic || "近 30 天")}</span></p>
          <h1>${esc(title)}</h1>
          <p class="byline">${avatar(topic || title, true)}<span>${esc(byline)}</span></p>
          ${report.masthead ? `<p class="masthead-line">${esc(report.masthead)}</p>` : ""}
          <div class="share-row">
            <button class="copy-link" type="button" data-action="copy-link" data-url="${esc(permalink)}" aria-live="polite">复制链接</button>
            <span class="copy-status" role="status" aria-live="polite"></span>
            <p class="copy-manual" hidden>
              <label>
                <span class="visually-hidden">综述链接</span>
                <input class="copy-field" type="text" readonly value="${esc(permalink)}">
              </label>
            </p>
          </div>
          <p class="fine">这是一次近 30 天主题综述，不是每日早报。引语和数字以所链原文为准。</p>
        </header>
        <div class="report-stack">${reportBodyHTML(report.body)}</div>
        ${sourceFooterHTML(report)}
      </article>
      ${footerHTML()}
    </div>`;
  }

  async function loadReport(slug) {
    if (!isReportSlug(slug) || state.reports.has(slug) || state.reportPending.has(slug)) return;
    const entry = last30Entry(slug);
    const file = reportFileName(entry || { slug });
    if (!file) {
      state.reports.set(slug, null);
      state.reportErrors.set(slug, "报告文件名不可用。");
      render({ fromHash: false });
      return;
    }
    state.reportPending.add(slug);
    try {
      const response = await fetch(`data/last30days/${file}`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`读取 data/last30days/${file} 失败（${response.status}）`);
      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("综述文件不是对象");
      state.reports.set(slug, data);
    } catch (err) {
      state.reports.set(slug, null);
      state.reportErrors.set(slug, err.message || "无法读取综述");
    } finally {
      state.reportPending.delete(slug);
    }
    const route = current();
    if (route.name === "last30report" && route.slug === slug) render({ fromHash: false, arriving: true });
  }

  function viewAbout() {
    const stories = state.data ? allStories(state.data) : [];
    const digests = sortedDigests(state.data);
    const latest = digests[0];
    const categories = categoriesFromData(state.data);
    const repo = safeUrl(state.data?.site?.repo || "");
    const latestValue = latest && isISODate(latest.id) ? fmtMd(latest.id) : (latest?.label || "还没有");
    const stats = [
      [latestValue, latest ? `最新 · ${weekdayZh(latest.id)}` : "最新"],
      [String(stories.length), "故事"],
      [String(digests.length), "天数"],
      [zoneLabel(), "时区"],
    ].map(([value, label]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("");
    const cats = categories.map((category) => `<li>${esc(category.heading)}</li>`).join("");
    const repoSentence = repo
      ? `<a class="text-link" href="${esc(repo)}" target="_blank" rel="noopener noreferrer">仓库 README</a> 写了怎样往 data/digests.json 追加一天。`
      : "更新写在仓库 README 里。";
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">关于</p>
        <h1>一份给自己读的早报</h1>
        <p class="dek">${esc(state.data?.site?.description || state.data?.site?.tagline || "")}</p>
      </header>
      <div class="about-layout">
        <div class="about-copy">
          <p>每日资讯把一天里想读的公开报道收成三栏：科技与 AI、财经与市场、综合热点。每则留标题、短摘要和原文链接；有的故事另附一段中文详述，卡片上仍然只显示摘要。同一栏里，标了国内的故事排在国外前面，卡片和详情会显示「国内」或「国外」。</p>
          <p>摘要和详述都是编者自己的话，用来判断要不要点开，不是通讯社稿，也不是原文全文。站点不转载原文，也不设账号或登录墙。搜索和筛选都在这台浏览器里完成。早报和内容广场可以只看国内或国外。</p>
          <p>侧栏的「近 30 天」是另一组主题综述，按一个时间窗口汇总社区讨论。报告放在 <code>data/last30days/</code>，不写进每日早报。<a class="text-link" href="#/last30days">打开近 30 天</a>可以看清单。</p>
          <h2>三栏各自看什么</h2>
          <ul class="about-list">
            <li>科技与 AI：芯片、模型、算力和科技公司。</li>
            <li>财经与市场：宏观数据、股市、利率和汇率。</li>
            <li>综合热点：政治、国际和社会事件。</li>
          </ul>
          <h2>怎样多一天</h2>
          <p>新的一天追加在 <code>data/digests.json</code> 的 digests 数组里，推送之后页面会更新。放在数组开头或末尾都可以，站点按日期从新到旧排。${repoSentence}</p>
          ${latest ? `<p><a class="btn" href="${esc(briefHash(latest.id, ""))}">阅读最新早报</a></p>` : ""}
        </div>
        <aside>
          <div class="stats">${stats}</div>
          ${cats ? `<h2 class="aside-title">已有分类</h2><ul class="about-list">${cats}</ul>` : ""}
        </aside>
      </div>
      ${footerHTML()}
    </div>`;
  }

  function viewMissing() {
    return `<div class="page"><h1>没有这一页</h1><p class="dek">地址对不上现有的早报、广场、近 30 天或文章。</p><p><a class="btn" href="#/">回每日早报</a></p>${footerHTML()}</div>`;
  }

  function pageTitle(route) {
    const name = siteName();
    if (!state.data) return state.error ? `未能载入 · ${name}` : name;
    if (route.name === "explore") return `内容广场 · ${name}`;
    if (route.name === "about") return `关于 · ${name}`;
    if (route.name === "last30") return `${state.last30?.title || "近 30 天"} · ${name}`;
    if (route.name === "last30report") {
      const entry = last30Entry(route.slug);
      const loaded = state.reports.get(route.slug);
      const title = (loaded && loaded.title) || (entry && entry.title);
      if (!isReportSlug(route.slug) || (state.last30 && !entry)) return `没有这篇综述 · ${name}`;
      return title ? `${title} · 近 30 天 · ${name}` : `近 30 天 · ${name}`;
    }
    if (route.name === "story") {
      const story = allStories(state.data).find((item) => item.id === route.id);
      return story ? `${story.title} · ${name}` : `没有这则故事 · ${name}`;
    }
    if (route.name === "missing") return `没有这一页 · ${name}`;
    const digests = sortedDigests(state.data);
    const digest = route.digestId ? digests.find((item) => item.id === route.digestId) : digests[0];
    return digest ? `${digest.label || digest.id} · 每日早报 · ${name}` : `每日早报 · ${name}`;
  }

  function applySite(data) {
    const title = data?.site?.title;
    const english = data?.site?.english;
    const brandName = document.querySelector(".brand-name");
    const brandEn = document.querySelector(".brand-en");
    if (title && brandName) brandName.textContent = title;
    if (english && brandEn) brandEn.textContent = english;
    const description = document.querySelector('meta[name="description"]');
    if (description && data?.site?.description) description.setAttribute("content", data.site.description);
  }

  function setActiveNav(route) {
    if (route.name === "brief" || route.name === "explore") state.listName = route.name;
    let active = route.name;
    if (route.name === "story") active = state.listName || "brief";
    if (route.name === "last30" || route.name === "last30report") active = "last30days";
    if (route.name === "missing") active = "";
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function syncSearchBox(route) {
    const input = document.getElementById("q");
    const clear = document.getElementById("clear-q");
    if (!input) return;
    const q = route && typeof route === "object" ? (route.q || "") : String(route || "");
    if (document.activeElement !== input && input.value !== q) input.value = q;
    if (clear) clear.hidden = input.value.length === 0;
    const onLast = route && (route.name === "last30" || route.name === "last30report");
    const placeholder = onLast ? "搜索主题、标题或窗口" : "搜索标题、摘要、详述或来源";
    input.placeholder = placeholder;
    const label = document.querySelector('label[for="q"]');
    if (label) label.textContent = placeholder;
  }

  function render(options) {
    const fromHash = Boolean(options && options.fromHash);
    let route = current();
    if (route.name === "brief" || route.name === "explore") {
      const rawRegion = route.params.get("region");
      if (rawRegion && rawRegion !== "cn" && rawRegion !== "global") {
        const hash = route.name === "explore"
          ? exploreHash(route)
          : briefHash(route.digestId, route.q, "all");
        history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
        route = current();
      }
    }
    const key = `${route.name}:${route.digestId || ""}:${route.id || ""}:${route.slug || ""}`;
    const routeChanged = key !== state.routeKey;
    state.routeKey = key;
    if (route.name === "brief" || route.name === "explore") {
      state.backHash = safeHash(location.hash || "#/");
      try { sessionStorage.setItem("dn-back", state.backHash); } catch (err) { /* ignore */ }
    } else {
      try {
        const saved = sessionStorage.getItem("dn-back");
        if (saved) state.backHash = safeHash(saved);
      } catch (err) { /* ignore */ }
    }
    document.title = pageTitle(route);
    applyShareMeta(route);
    setActiveNav(route);
    main.setAttribute("aria-busy", state.data ? "false" : "true");
    if (!state.data) {
      main.innerHTML = state.error
        ? `<div class="page"><h1>内容没有载入</h1><p class="dek">${esc(state.error)}</p><p><button class="btn" type="button" data-action="retry">重试</button></p></div>`
        : '<div class="page"><p class="loading">正在整理今天的早报…</p></div>';
    } else if (route.name === "explore") main.innerHTML = viewExplore(route);
    else if (route.name === "about") main.innerHTML = viewAbout();
    else if (route.name === "story") main.innerHTML = viewStory(route);
    else if (route.name === "last30") main.innerHTML = viewLast30(route);
    else if (route.name === "last30report") main.innerHTML = viewLast30Report(route);
    else if (route.name === "missing") main.innerHTML = viewMissing();
    else main.innerHTML = viewBrief(route);
    syncSearchBox(route);
    const arriving = Boolean(options && options.arriving);
    const shouldFocus = ((fromHash && routeChanged) || arriving) && document.activeElement !== document.getElementById("q");
    if (shouldFocus) {
      window.scrollTo(0, 0);
      const heading = main.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
    state.booted = true;
  }

  function onSearchInput() {
    const input = document.getElementById("q");
    const route = current();
    let hash;
    if (route.name === "brief") hash = briefHash(route.digestId, input.value, route.region);
    else if (route.name === "explore") {
      hash = exploreHash({
        view: route.view,
        cat: route.cat,
        time: route.time,
        region: route.region,
        q: input.value,
      });
    } else if (route.name === "last30" || route.name === "last30report") {
      hash = last30ListHash(input.value);
      if (route.name === "last30report") {
        if ((location.hash || "#/") !== hash) location.hash = hash;
        return;
      }
    } else {
      hash = exploreHash({ view: "all", cat: "all", time: "all", q: input.value });
      if ((location.hash || "#/") !== hash) {
        location.hash = hash;
        return;
      }
    }
    const next = `${location.pathname}${location.search}${hash}`;
    const now = `${location.pathname}${location.search}${location.hash || "#/"}`;
    if (next !== now) history.replaceState(null, "", next);
    render({ fromHash: false });
  }

  function isMobile() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function closeMenu(options) {
    const nav = document.getElementById("sidenav");
    const wasOpen = nav.classList.contains("is-open");
    nav.classList.remove("is-open");
    document.getElementById("scrim").hidden = true;
    document.body.classList.remove("nav-open");
    document.querySelector("[data-action='menu']").setAttribute("aria-expanded", "false");
    if (isMobile()) nav.setAttribute("inert", "");
    else nav.removeAttribute("inert");
    if (options && options.restore && wasOpen) document.querySelector("[data-action='menu']").focus();
  }

  function openMenu() {
    const nav = document.getElementById("sidenav");
    nav.classList.add("is-open");
    nav.removeAttribute("inert");
    document.getElementById("scrim").hidden = false;
    document.body.classList.add("nav-open");
    document.querySelector("[data-action='menu']").setAttribute("aria-expanded", "true");
    const first = nav.querySelector("a");
    if (first) first.focus();
  }

  function syncNavMode() {
    const nav = document.getElementById("sidenav");
    if (!isMobile()) {
      nav.classList.remove("is-open");
      nav.removeAttribute("inert");
      document.getElementById("scrim").hidden = true;
      document.body.classList.remove("nav-open");
      document.querySelector("[data-action='menu']").setAttribute("aria-expanded", "false");
    } else if (!nav.classList.contains("is-open")) {
      nav.setAttribute("inert", "");
    }
  }

  function syncHeaderHeight() {
    const bar = document.querySelector(".topbar");
    if (bar) document.documentElement.style.setProperty("--header-h", `${bar.offsetHeight}px`);
  }

  function applyTheme(theme) {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("dn-theme", theme === "dark" ? "dark" : "light"); } catch (err) { /* ignore */ }
    const button = document.querySelector("[data-action='theme']");
    if (button) button.setAttribute("aria-label", theme === "dark" ? "切换为浅色" : "切换为深色");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#141311" : "#faf7f2");
  }

  function onClick(event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "theme") {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      applyTheme(dark ? "light" : "dark");
    } else if (action === "menu") {
      if (document.getElementById("sidenav").classList.contains("is-open")) closeMenu({ restore: true });
      else openMenu();
    } else if (action === "close-menu") closeMenu({ restore: true });
    else if (action === "clear-search") {
      const input = document.getElementById("q");
      input.value = "";
      onSearchInput();
      input.focus();
    } else if (action === "jump") {
      const target = document.getElementById(el.dataset.target);
      if (!target) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } else if (action === "retry") load();
    else if (action === "copy-link") copyStoryLink(el);
  }

  function copyWithInput(text) {
    const input = document.createElement("input");
    input.value = text;
    input.setAttribute("aria-hidden", "true");
    input.style.position = "fixed";
    input.style.top = "0";
    input.style.left = "-9999px";
    input.style.fontSize = "16px";
    document.body.appendChild(input);
    input.focus();
    input.select();
    try { input.setSelectionRange(0, input.value.length); } catch (err) { /* ignore */ }
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(input);
    return ok;
  }

  function copyWithExec(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    area.style.width = "200px";
    area.style.height = "80px";
    area.style.padding = "0";
    area.style.border = "0";
    area.style.fontSize = "16px";
    document.body.appendChild(area);
    const previous = document.activeElement;
    area.focus();
    area.select();
    try { area.setSelectionRange(0, area.value.length); } catch (err) { /* ignore */ }
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    document.body.removeChild(area);
    if (previous && previous.focus) {
      try { previous.focus(); } catch (err) { /* ignore */ }
    }
    return ok;
  }

  function copyFeedback(button, message, manual) {
    const head = button.closest(".article-head") || button.parentElement;
    const status = head.querySelector(".copy-status");
    const manualBox = head.querySelector(".copy-manual");
    if (manualBox) manualBox.hidden = !manual;
    window.clearTimeout(copyTimer);
    if (!button.dataset.idleLabel) button.dataset.idleLabel = "复制链接";
    if (manual && manualBox) {
      button.textContent = button.dataset.idleLabel;
      button.classList.remove("is-done");
      if (status) status.textContent = message || "";
      const field = manualBox.querySelector(".copy-field");
      if (field) {
        field.focus();
        try {
          field.select();
          field.setSelectionRange(0, field.value.length);
        } catch (err) { /* ignore */ }
      }
      return;
    }
    if (message) {
      button.textContent = message;
      button.classList.add("is-done");
      if (status) status.textContent = "";
      copyTimer = window.setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = button.dataset.idleLabel || "复制链接";
        button.classList.remove("is-done");
      }, 2500);
      return;
    }
    button.textContent = button.dataset.idleLabel || "复制链接";
    button.classList.remove("is-done");
    if (status) status.textContent = "";
  }

  function copyStoryLink(button) {
    const text = button.getAttribute("data-url") || "";
    if (!text) {
      copyFeedback(button, "没有可复制的链接", false);
      return;
    }
    const canClipboard = Boolean(
      navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText,
    );
    // Write during the click so WeChat WebView still has a user gesture.
    const synced = copyWithExec(text) || copyWithInput(text);
    if (canClipboard) {
      navigator.clipboard.writeText(text).then(() => {
        copyFeedback(button, "已复制", false);
      }).catch(() => {
        if (synced) copyFeedback(button, "已复制", false);
        else copyFeedback(button, "请长按链接复制", true);
      });
      if (synced) copyFeedback(button, "已复制", false);
      return;
    }
    if (synced) copyFeedback(button, "已复制", false);
    else copyFeedback(button, "请长按链接复制", true);
  }

  function onKey(event) {
    if (event.key === "Escape") {
      closeMenu({ restore: true });
      return;
    }
    if (document.body.classList.contains("nav-open") && event.key === "Tab") {
      const items = [...document.getElementById("sidenav").querySelectorAll("a, button")];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable) return;
      event.preventDefault();
      document.getElementById("q").focus();
    }
  }

  async function load() {
    state.error = null;
    state.data = null;
    state.last30 = null;
    state.last30Error = null;
    state.reports = new Map();
    state.reportErrors = new Map();
    state.reportPending = new Set();
    render({ fromHash: false });
    const digestTask = (async () => {
      const response = await fetch("data/digests.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`读取 data/digests.json 失败（${response.status}）`);
      const data = await response.json();
      if (!data || !Array.isArray(data.digests)) throw new Error("digests.json 缺少 digests 数组");
      return data;
    })();
    const lastTask = (async () => {
      const response = await fetch("data/last30days/index.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`读取 data/last30days/index.json 失败（${response.status}）`);
      const data = await response.json();
      if (!data || !Array.isArray(data.reports)) throw new Error("last30days/index.json 缺少 reports 数组");
      return data;
    })();
    const [digestOutcome, lastOutcome] = await Promise.all([
      digestTask.then((data) => ({ data })).catch((err) => ({ error: err })),
      lastTask.then((data) => ({ data })).catch((err) => ({ error: err })),
    ]);
    if (digestOutcome.data) {
      state.data = digestOutcome.data;
      applySite(digestOutcome.data);
    } else {
      state.data = null;
      state.error = digestOutcome.error?.message || "无法读取内容";
    }
    if (lastOutcome.data) {
      state.last30 = lastOutcome.data;
      state.last30Error = null;
    } else {
      state.last30 = null;
      state.last30Error = lastOutcome.error?.message || "无法读取近 30 天";
    }
    render({ fromHash: true, arriving: true });
  }

  function boot() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    document.getElementById("search-form").addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("q").addEventListener("input", onSearchInput);
    main.addEventListener("change", (event) => {
      if (event.target.id !== "day-select") return;
      const route = current();
      location.hash = briefHash(event.target.value, route.q, route.region);
    });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", () => {
      closeMenu();
      render({ fromHash: true });
    });
    window.addEventListener("resize", () => {
      syncNavMode();
      syncHeaderHeight();
    });
    syncNavMode();
    syncHeaderHeight();
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
