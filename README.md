# 每日资讯 Daily News

个人每日新闻早报，静态站点，托管在 GitHub Pages。没有登录，也没有后端。

**线上地址：https://wengqian66.github.io/daily-news/**

## 页面

- **每日早报**（首页）：一次看一天。顶栏可以换日期，下面分三栏：科技与 AI、财经与市场、综合热点。
- **内容广场**：所有日期的故事铺成一页。可按视角（精选 / 全部）、分类、时间（今天 / 本周 / 全部）和关键词筛选。有精选时，第一则用大卡。
- **详情**：标题、分类、日期、来源、摘要，以及原文链接。有 `region` 时，标题旁显示「国内」或「国外」。有 `bodyZh` 时，摘要下多一节「中文详述」。多条来源按列表展示，并标出中文或英文。链接在新标签打开。「复制链接」复制带 hash 的绝对地址，例如 `https://wengqian66.github.io/daily-news/#/story/…`。
- **关于**：这份站是什么、内容从哪来。

顶栏搜索会按标题、摘要、详述或来源过滤，逻辑在浏览器里完成。「今天 / 本周」按上海时区。

## 本地预览

```bash
python3 -m http.server 8080
```

打开 http://127.0.0.1:8080/

线上地址带仓库路径 `/daily-news/`。页面使用相对链接，本地根路径和 Pages 都能打开。不要把资源写成以 `/` 开头的绝对路径。

## 怎样增加新的一天

编辑 [`data/digests.json`](data/digests.json)，往 `digests` 数组里加一个对象。放在开头或末尾都可以，站点会按 `id` 从新到旧排序。

`stories[].id` 在全站必须唯一，并且不要包含空格、`#`、`?`、`&`、`/`。分类 `id` 用 `tech`、`markets`、`general`，内容广场的筛选才对得上；`heading` 是页面上看到的中文栏名。

`featured: true` 的故事会在内容广场置顶成大卡，并显示「精选」。视角选「精选」时只留下这些故事。`excerpt` 里用一个空行分段，详情页会分成段落。

每天大约 18 则：科技、财经、综合各约 3 则国内（`cn`）加 3 则国外（`global`）。这是选稿目标，不是上限。`scripts/check_digests.py` 不限制条数，也不要求每则都写 `region`。采集时优先找国内读者打得开的中文来源；同一件事可以并列中文和英文链接。

`region` 可选，只能是 `cn` 或 `global`。`cn` 表示国内，`global` 表示国外，看事件本身，不看来源网站用哪种语言。早报卡片、内容广场和详情会显示「国内」或「国外」。同一分类里先排国内，再排国外，没写 `region` 的故事留在这两类后面。三个分类标题保持不变。

`bodyZh` 可选。它是给中文读者的较长详述，一般 400–800 字，用一个空行分段，规则和 `excerpt` 一样。详情页在摘要后面以「中文详述」显示。没有这个字段时，详情仍只显示摘要。卡片、早报列表和内容广场只用 `excerpt`，不会把详述铺上去。

`links` 可以有多条。每条仍要有 `title`、`site`、`href`。可选 `lang`：`zh` 或 `en`。详情页把 `zh` 标成「中文」、`en` 标成「英文」，并把中文链接排在前面。不写 `lang` 时链接照常显示，只是没有语言标记。不要为了标记去发明必填字段。

提交前可以检查格式：

```bash
python3 scripts/check_digests.py
```

推送到 `main` 之后，GitHub Pages 会更新站点，通常一两分钟。浏览器如果还显示旧的一天，强制刷新一次。

### 最小示例

```json
{
  "id": "2026-11-10",
  "label": "11月10日 · 周二",
  "coverage": "过去约 24–48 小时（上海时区）",
  "summary": "一句话导读，出现在早报顶部。",
  "categories": [
    {
      "id": "tech",
      "heading": "科技与 AI",
      "stories": [
        {
          "id": "example-story",
          "title": "标题",
          "excerpt": "第一段摘要。\n\n空行之后是第二段。",
          "bodyZh": "可选。较长的中文详述，空行分段。没有就不要写这个字段。",
          "featured": true,
          "type": "文章",
          "source": "来源名",
          "date": "11-10",
          "region": "cn",
          "links": [
            {
              "title": "中文报道",
              "site": "来源名",
              "href": "https://example.com/zh",
              "lang": "zh"
            },
            {
              "title": "English report",
              "site": "Source",
              "href": "https://example.com/en",
              "lang": "en"
            }
          ]
        }
      ]
    },
    { "id": "markets", "heading": "财经与市场", "stories": [] },
    { "id": "general", "heading": "综合热点", "stories": [] }
  ]
}
```

每天追加时，保留 `site` 对象，只改 `digests`。

## 发布到 GitHub Pages

线上地址：**https://wengqian66.github.io/daily-news/**

`.github/workflows/pages.yml` 会在推送到 `main` 时，把静态文件交给 GitHub Actions 发布。仓库管理员需要先在 **Settings → Pages → Build and deployment → Source** 里选择 **GitHub Actions**（只需一次）。选好之后，工作流绿了站点就更新。

有管理员权限时也可以用接口打开：

```bash
gh api --method POST repos/wengqian66/daily-news/pages -f build_type=workflow
```

不想用 Actions 的话，根目录已经有 `.nojekyll`，可以直接从 `main` 分支的 `/` 发布：

```bash
gh api --method POST repos/wengqian66/daily-news/pages \
  -f build_type=legacy \
  -f source[branch]=main \
  -f source[path]=/
```

## 技术说明

- 无构建：`index.html` + `css/styles.css` + `js/app.js`，启动时读取 `data/digests.json`。
- 路由在 hash 里（`#/explore`、`#/story/nvidia-board-inquiry`），刷新不会 404。
- 分享：`index.html` 带 Open Graph 和 Twitter 卡片，图片是 [`assets/og.png`](assets/og.png)。打开某一则故事时，页面会改 `document.title`，并尽量更新 `og:title` 和 `og:description`。只读取首页 HTML、不跑脚本的爬虫，看到的仍是站点级卡片。
- 仓库根目录有 `.nojekyll`，Pages 按原文件发布，不经过 Jekyll。
- 深色模式记在这台浏览器的 `localStorage` 里。
- 不收集账号，不做统计。

## 仓库

https://github.com/wengqian66/daily-news
