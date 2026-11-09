/* 每日资讯 — static hash router. Content: data/digests.json */
(function () {
  "use strict";

  const main = document.getElementById("main");
  const state = {
    data: null,
    error: null,
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
    return { name: "missing", params };
  }

  function current() {
    const route = parseRoute();
    const params = route.params || new URLSearchParams();
    const view = params.get("view") === "featured" ? "featured" : "all";
    const time = ["today", "week", "all"].includes(params.get("time")) ? params.get("time") : "all";
    return {
      ...route,
      q: params.get("q") || "",
      view,
      cat: params.get("cat") || "all",
      time,
    };
  }

  function exploreHash({ view, cat, time, q }) {
    const params = new URLSearchParams();
    if (view && view !== "all") params.set("view", view);
    if (cat && cat !== "all") params.set("cat", cat);
    if (time && time !== "all") params.set("time", time);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `#/explore?${query}` : "#/explore";
  }

  function briefHash(id, q) {
    const base = id ? `#/brief/${encodeURIComponent(id)}` : "#/";
    if (!q) return base;
    const joiner = base.includes("?") ? "&" : "?";
    return `${base}${joiner}q=${encodeURIComponent(q)}`;
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

  function allStories(data) {
    const stories = [];
    sortedDigests(data).forEach((digest) => {
      (digest.categories || []).forEach((category) => {
        (category.stories || []).forEach((story) => {
          stories.push(decorate(story, category, digest));
        });
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
    const hay = [story.title, story.excerpt, story.bodyZh, story.source].join("\n").toLowerCase();
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

  function cardHTML(story, options) {
    const showCategory = options && options.showCategory;
    const typeLabel = showCategory && story.categoryHeading
      ? `${story.type} · ${story.categoryHeading}`
      : story.type;
    const metaDate = story.date || fmtMd(story.digestId);
    const pill = story.featured ? '<span class="pill">精选</span>' : "";
    return `<article class="card" data-story-id="${esc(story.id)}">
      <a class="card-link" href="#/story/${encodeURIComponent(story.id)}">
        <div class="card-top"><span class="type">${ICON_DOC}<span>${esc(typeLabel)}</span></span>${pill}</div>
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
          <div class="card-top"><span class="type">${ICON_DOC}<span>${esc(story.type)} · ${esc(story.categoryHeading || "")}</span></span><span class="pill">精选</span></div>
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

  function daySwitch(digest, digests, q, today) {
    const index = digests.findIndex((item) => item.id === digest.id);
    const newer = index > 0 ? digests[index - 1] : null;
    const older = index >= 0 && index < digests.length - 1 ? digests[index + 1] : null;
    const olderControl = older
      ? `<a class="day-btn" href="${esc(briefHash(older.id, q))}" aria-label="前一天，${esc(older.label || older.id)}">前一天</a>`
      : '<button type="button" class="day-btn" disabled aria-label="没有更早的一天">前一天</button>';
    const newerControl = newer
      ? `<a class="day-btn" href="${esc(briefHash(newer.id, q))}" aria-label="后一天，${esc(newer.label || newer.id)}">后一天</a>`
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
      const stories = (category.stories || [])
        .map((story) => decorate(story, category, digest))
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
    const countLine = route.q ? `匹配 ${count} 则` : `共 ${count} 则`;
    const lede = digest.summary
      ? `<aside class="lede"><p class="lede-kicker">今日导读</p><p>${esc(digest.summary)}</p></aside>`
      : "";
    const empty = blocks.length
      ? ""
      : emptyBlock(
        "这一天没有匹配的故事",
        route.q ? `没有标题、摘要、详述或来源包含「${route.q.trim()}」的故事。` : "这一天还没有故事。",
        briefHash(digest.id, ""),
        "清除搜索",
      );
    const tagline = state.data?.site?.tagline || "";
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">每日早报</p>
        <div class="hero-top">
          <h1>${esc(digest.label || fmtMd(digest.id))}</h1>
          ${daySwitch(digest, digests, route.q, today)}
        </div>
        <p class="dek">${esc(digest.coverage || "")}</p>
        <p class="subdek">${esc([tagline, countLine].filter(Boolean).join(" · "))}</p>
      </header>
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
        const next = { view: route.view, cat: route.cat, time: route.time, q: route.q, [key]: value };
        return chip(exploreHash(next), label, route[key] === value);
      }).join("");
      return `<fieldset class="filter-row"><legend>${legend}</legend><div class="chips">${chips}</div></fieldset>`;
    };
    const views = [["featured", "精选"], ["all", "全部"]];
    const times = [["today", "今天"], ["week", "本周"], ["all", "全部"]];
    const cats = [["all", "全部"], ...categories.map((category) => [category.id, category.heading])];
    return `<div class="filters">${row("视角", views, "view")}${row("分类", cats, "cat")}${row("时间", times, "time")}</div>`;
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
      q: route.q,
      today,
    }));
    const hero = matches.find((story) => story.featured) || null;
    const rest = hero ? matches.filter((story) => story !== hero) : matches;
    const hasFilter = route.view !== "all" || route.cat !== "all" || route.time !== "all" || route.q;
    let empty = "";
    if (!matches.length) {
      let message = "这一筛选下暂时没有故事。";
      if (route.time === "today") message = `今天（${zoneLabel()}，${fmtMd(today)} · ${weekdayZh(today)}）还没有早报。`;
      else if (route.time === "week") message = `本周（${fmtMd(start)}–${fmtMd(end)}，${zoneLabel()}）没有匹配的故事。`;
      else if (route.q) message = `没有找到与「${route.q.trim()}」匹配的故事。`;
      else if (route.view === "featured") message = "还没有标成精选的故事。";
      empty = emptyBlock("没有匹配的故事", message, hasFilter ? "#/explore" : "", hasFilter ? "清除筛选" : "");
    }
    const grid = rest.length
      ? `<div class="grid">${rest.map((story) => cardHTML(story, { showCategory: true })).join("")}</div>`
      : "";
    return `<div class="page">
      <header class="hero">
        <p class="eyebrow">公共精选</p>
        <h1>内容广场</h1>
        <p class="dek">把每一天的故事铺平。用视角、分类、时间和搜索收窄。</p>
      </header>
      ${filtersHTML(route, categories)}
      <p class="tz-note">时间按${esc(zoneLabel())}时区。今天是 ${esc(fmtMd(today))} · ${esc(weekdayZh(today))}，本周 ${esc(fmtMd(start))}–${esc(fmtMd(end))}。</p>
      <p class="result-line" aria-live="polite">${matches.length} 则${route.q ? ` · 含「${esc(route.q.trim())}」` : ""}</p>
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
          <p>每日资讯把一天里想读的公开报道收成三栏：科技与 AI、财经与市场、综合热点。每则留标题、短摘要和原文链接；有的故事另附一段中文详述，卡片上仍然只显示摘要。</p>
          <p>摘要和详述都是编者自己的话，用来判断要不要点开，不是通讯社稿，也不是原文全文。站点不转载原文，也不设账号或登录墙。搜索和筛选都在这台浏览器里完成。</p>
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
    return `<div class="page"><h1>没有这一页</h1><p class="dek">地址对不上现有的早报、广场或文章。</p><p><a class="btn" href="#/">回每日早报</a></p>${footerHTML()}</div>`;
  }

  function pageTitle(route) {
    const name = siteName();
    if (!state.data) return state.error ? `未能载入 · ${name}` : name;
    if (route.name === "explore") return `内容广场 · ${name}`;
    if (route.name === "about") return `关于 · ${name}`;
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
    if (route.name === "missing") active = "";
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function syncSearchBox(q) {
    const input = document.getElementById("q");
    const clear = document.getElementById("clear-q");
    if (!input) return;
    if (document.activeElement !== input && input.value !== q) input.value = q;
    if (clear) clear.hidden = input.value.length === 0;
  }

  function render(options) {
    const fromHash = Boolean(options && options.fromHash);
    const route = current();
    const key = `${route.name}:${route.digestId || ""}:${route.id || ""}`;
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
    else if (route.name === "missing") main.innerHTML = viewMissing();
    else main.innerHTML = viewBrief(route);
    syncSearchBox(route.q);
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
    if (route.name === "brief") hash = briefHash(route.digestId, input.value);
    else if (route.name === "explore") {
      hash = exploreHash({ view: route.view, cat: route.cat, time: route.time, q: input.value });
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
    render({ fromHash: false });
    try {
      const response = await fetch("data/digests.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`读取 data/digests.json 失败（${response.status}）`);
      const data = await response.json();
      if (!data || !Array.isArray(data.digests)) throw new Error("digests.json 缺少 digests 数组");
      state.data = data;
      applySite(data);
    } catch (err) {
      state.data = null;
      state.error = err.message || "无法读取内容";
    }
    render({ fromHash: true, arriving: true });
  }

  function boot() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    document.getElementById("search-form").addEventListener("submit", (event) => event.preventDefault());
    document.getElementById("q").addEventListener("input", onSearchInput);
    main.addEventListener("change", (event) => {
      if (event.target.id !== "day-select") return;
      location.hash = briefHash(event.target.value, current().q);
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
