# 每日资讯 Daily News

个人每日新闻早报，静态站点，托管在 GitHub Pages。没有登录，也没有后端。

**线上地址：https://wengqian66.github.io/daily-news/**

## 页面

- **每日早报**（首页）：一次看一天。顶栏可以换日期，下面分三栏：科技与 AI、财经与市场、综合热点。日期下面可以按地区看这一天：全部、国内、国外。选中项写在 hash 查询里，例如 `#/?region=cn` 或 `#/brief/2026-11-09?region=global`。搜索和地区可以一起用。选「全部」时，同一栏里国内故事仍排在国外前面。
- **内容广场**：所有日期的故事铺成一页。可按视角（精选 / 全部）、分类、地区（全部 / 国内 / 国外）、时间（今天 / 本周 / 全部）和关键词筛选。地区对应 `region=cn` 或 `region=global`，例如 `#/explore?region=cn&q=芯片`。有精选时，第一则用大卡。选「全部」时，同一天、同一栏里国内仍在国外前面。
- **详情**：标题、分类、日期、来源、摘要，以及原文链接。有 `region` 时，标题旁显示「国内」或「国外」。有 `bodyZh` 时，摘要下多一节「中文详述」。多条来源按列表展示，并标出中文或英文。链接在新标签打开。「复制链接」复制带 hash 的绝对地址，例如 `https://wengqian66.github.io/daily-news/#/story/…`。
- **行情**（`#/markets`）：黄金、白银、原油和国内成品油的每日快照。每条有最新价、涨跌、单位、来源和截止时间（上海）。走势默认看近 30 个交易日，也可以看已保存的全部。成品油是 31 个省级行政区的 92 号、95 号和 0 号，默认广东，换省之后记在这台浏览器里。周末和节假日显示最近一个交易日。缺某一项时，那一格写「暂无数据」，其他项照常显示。
- **近 30 天**（`#/last30days`）：主题综述清单，和每日早报分开。点进一篇是 `#/last30days/{slug}`，例如 `#/last30days/2026-11-24-ai`。在这一栏里，顶栏搜索只筛这些综述；回到早报或内容广场后，搜索仍只看每日故事。
- **关于**：这份站是什么、内容从哪来。

早报标题下面有一行今日沪金和布伦特的价格，点进去就是行情页。这一行只在 `data/markets.json` 里已经有对应报价时出现。

顶栏搜索会按标题、摘要、详述或来源过滤每日故事，逻辑在浏览器里完成。「今天 / 本周」按上海时区。在「近 30 天」里，搜索改为匹配主题、标题、窗口和综述正文。

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

`region` 可选，只能是 `cn` 或 `global`。`cn` 表示国内，`global` 表示国外，看事件本身，不看来源网站用哪种语言。早报卡片、内容广场和详情会显示「国内」或「国外」。同一分类里先排国内，再排国外，没写 `region` 的故事留在这两类后面。三个分类标题保持不变。早报和内容广场可以按这个字段筛选；没写 `region` 的故事只出现在「全部」里。

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

## 近 30 天

「近 30 天」不是早报的一天。它按主题放一份时间窗口里的社区综述，数据在 [`data/last30days/`](data/last30days/)，不要写进 `data/digests.json`，也不要改 `scripts/feeds.json`、`scripts/fetch_candidates.py` 或 `scripts/check_digests.py`。

清单是 [`data/last30days/index.json`](data/last30days/index.json)。`reports` 里一条对应一篇。站点按 `windowEnd`、再按 `generated` 从新到旧排，所以新报告放在数组开头或末尾都可以。

一篇报告是同目录下的 `{slug}.json`。`slug` 用小写 ASCII、数字和连字符，不要空格、`#`、`?`、`&`、`/`，并和文件名一致，例如 `2026-11-24-ai`。列表项的 `file` 写这个文件名。

### 怎样加一篇

1. 把新的 `{slug}.json` 放到 `data/last30days/`。
2. 在 `index.json` 的 `reports` 里加一条列表信息：`slug`、`file`、`topic`、`title`、`windowStart`、`windowEnd`、`timezone`、`coverageLabel`、`generated`、`skill`、`skillVersion`、`lede`。可选 `searchText`：综述的纯文本，顶栏搜索用它匹配正文。不写时，搜索只用主题、标题、导语和窗口。

报告文件自己要能打开，建议带上同一套元数据，外加：

- `window`：`start`、`end`、`timezone`、`label`
- `masthead`：页眉那一行
- `body`：正文。一段一个空行。小节写成 `**标题** - 段落`，段落里的链接写成 `[文字](https://…)`。引用行以 `> ` 开头；含 Polymarket 或 📊 的引用会画成预测市场行，其余是拉引。`KEY PATTERNS` 开头的一块会变成有序列表，行首用 `1. ` 这种编号。
- `coverageNote`：这次实际搜过、失败或没搜的来源。失败要写明原因，不要写成“该来源没有讨论”。
- `sourceFooter`：字符串数组，一行一个来源统计。

正文只收录这次运行里已经写好的句子、引语、数字和链接，不要为了填页面另编。

## 行情

行情不是早报的一天，也不要写进 `data/digests.json`。页面只读 [`data/markets.json`](data/markets.json)。浏览器不请求交易所或油价接口。

早晨流水线在起草早报之外可以跑：

```bash
python3 scripts/fetch_markets.py
```

脚本只用 Python 标准库，工作目录不限。它会请求下面三个来源，合并进现有文件，再跑和 `scripts/check_markets.py` 相同的检查。检查不通过就不覆盖原文件。同一天重跑是安全的：同一个交易日会盖掉那一天的点，不会另起一行。成品油也一样：成功的一次抓取会把上海时区当天的 92/95/0 号价格写进每个省的 `history`，同一天再跑就盖掉这一天，更早的调价日留着。某一项请求失败时，其他项照常写入；这项如果以前有快照，就留下上次的价格并标 `stale: true`，页面会写「这次没有刷新」。成品油失败时，原来的分省历史也原样留下。没有旧快照时，这项不出现，页面显示「暂无数据」。脚本不编造价格。

来源（2026-11-26 用真实请求核对过）：

| 内容 | 来源 | 地址 |
| --- | --- | --- |
| 沪金 Au99.99，元/克 | 上海黄金交易所日行情 | `POST https://www.sge.com.cn/graph/Dailyhq`，`instid=Au99.99`。说明页：https://www.sge.com.cn/sjzx/mrhq |
| 沪银 Ag(T+D)，元/千克 | 同上 | `instid=Ag(T+D)`。Ag99.99 很多交易日只有一个价，流动性差，所以不用它 |
| 纽约黄金，美元/盎司 | 新浪财经，COMEX 黄金期货主力连续 | 日线 `https://stock2.finance.sina.com.cn/futures/api/json.php/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=GC`，最新价和钟点 `https://hq.sinajs.cn/list=hf_GC` |
| 纽约白银，美元/盎司 | 同上，COMEX 白银 | `symbol=SI`，`hf_SI` |
| WTI 原油，美元/桶 | 同上，NYMEX WTI | `symbol=CL`，`hf_CL` |
| 布伦特原油，美元/桶 | 同上，行情名称「布伦特原油」 | `symbol=OIL`，`hf_OIL`。报价页标题里带 CFD。2026-11-26 的前收与东方财富 ICE 布伦特连续合约 `112.B00Y` 的 90.64 一致 |
| 31 省 92/95/0 号，元/升 | 日油价 | `GET https://www.riyoujia.com/api/oil.json` |

日油价要求公开展示时保留「数据来源：日油价 riyoujia.com」。页面和 `fuel.attribution` 都写了这句，并链到 https://www.riyoujia.com/ 。下次调价窗口用接口里的 `next_window`，没有就不显示。日油价这个接口只有当天快照，没有历史数组。

成品油历史记在每个省的 `history` 里，按日期升序，一项是 `{ "date", "p92", "p95", "p0" }`。价格大多只在发改委调价窗口变，所以页面画阶梯，不把两个调价日连成斜线。每个省最多留 400 个点，大约够一年的每日快照，也够把更早的调价日留在前面。最后一天的三个价格必须等于该省当前的 `p92` / `p95` / `p0`。有成品油快照就必须有这段历史；整段成品油都没有时，才允许没有历史。

2026 年各调价日的价格是一次性种进文件的，不是每天现编。读的是搜油价公开的各省历史表（例如 https://www.soyoujia.cn/guangdong/lishi ，该站写明数据来自成品油调价公告）。种进去之前核对过：31 省 2026-11-13 的 92/95/0 与日油价当前价一致，相对 2026-10-30 的涨跌与日油价的 `d92` / `d95` / `d0` 一致。广东 2026-08-01（公告为 7 月 31 日 24 时起）的 7.99 / 8.65 / 7.64 与广东省发展改革委公告一致；北京 2026-11-13 的 8.37 / 8.91 / 8.11、以及上一档 8.89 / 9.46 / 8.65，与北京市发展改革委这轮公告一致。2026-10-15 日国家发改委宣布不作调整，所以 2026-10-16 与 2026-09-25 同价。日期用的是新价格生效的公历日（窗口日 24 时的次日）。没有把 98 号写进历史。2026-11-26 起由每天的日油价快照往后累加。

上金所日行情没有逐笔时间。沪金、沪银的 `clockKind` 是 `close`，`clock` 是 `15:30`，表示该交易日日盘收盘。纽约和原油如果拿到了行情钟点，`clockKind` 是 `tick`，时间按上海时区。文件里每个品种最多保留 120 个交易日，第一次运行就会从源里回填这么多。

`quotes` 里每一项：

- `id`：`au9999`、`xau`、`agtd`、`xag`、`brent`、`wti`
- `name`、`group`（`gold` / `silver` / `oil`）、`detail`、`unit`、`decimals`
- `price`、`change`、`changePct`：涨跌相对前一个交易日的收盘
- `sessionDate`：最近一个有行情的交易日
- `asOf`：`YYYY-MM-DDTHH:MM:SS+08:00`，并且落在 `sessionDate` 当天
- `source`、`sourceUrl`
- `history`：按日期升序的 `{ "date", "close" }`，最后一天的 `close` 等于 `price`

`fuel.provinces` 固定 31 个省级行政区（不含港澳台），名称用短名，例如 `广东`。每省有 `p92`、`p95`、`p0`，有则再写 `d92`、`d95`、`d0`（较上一轮调价，元/升）、`url`，以及 `history`。

提交前：

```bash
python3 scripts/check_markets.py
```

检查不过，GitHub Actions 也不会过。价格不是正数、单位对不上、历史对不上最新价、成品油不是 31 省、成品油历史对不上该省最新价，都会失败。某一品种整段缺失是允许的。成品油历史缺失只在没有成品油快照时允许。

## 候选来源（RSS）

RSS 是网站发布更新用的订阅格式，常见文件是 RSS 2.0 或 Atom 的 XML。脚本请求这个地址，就能拿到一批标题、链接和发布时间，不用去解析新闻首页。

[`scripts/feeds.json`](scripts/feeds.json) 列出要拉的源。每条有 `id`、`url`、`category`（`tech`、`markets` 或 `general`）、`region`（`cn` 国内 / `global` 国外）和 `site`。`region` 和 `category` 是这一源的默认标签，起草时仍可以按单篇改。清单里放了目前能打开的公开源：IT之家、极客公园、少数派、FT 中文网、人民网、新华网、BBC 和 CNBC。某个地址以后失效，改这一份清单即可。

先安装依赖，再抓取：

```bash
pip install feedparser
python3 scripts/fetch_candidates.py
```

脚本逐个请求，超时大约 20 秒。打不开、超时或没有条目的源会在终端记一行，其他源继续。抓到的条目写入 `scripts/candidates.json`（已在 `.gitignore` 里，不提交）。每条有 `title`、`url`、`site`、`category`、`region`、`published`。

早晨流水线先用这份候选，再交给 pi Flash 起草当天早报。Flash 按分类和国内/国外从标题里挑选、写摘要；人核对原文链接后放进 `data/digests.json`。`fetch_candidates.py` 不改早报，也不发布站点。起草完成后仍运行 `python3 scripts/check_digests.py`。

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

- 无构建：`index.html` + `css/styles.css` + `js/app.js`。启动时读取 `data/digests.json` 和 `data/markets.json`；近 30 天另读 `data/last30days/index.json`，打开一篇再读对应的报告文件。走势图是页面里的 SVG，不加载图表库，也不请求第三方统计。
- 路由在 hash 里（`#/explore`、`#/markets`、`#/story/nvidia-board-inquiry`、`#/last30days`、`#/last30days/2026-11-24-ai`），刷新不会 404。
- 分享：`index.html` 带 Open Graph 和 Twitter 卡片，图片是 [`assets/og.png`](assets/og.png)。打开某一则故事时，页面会改 `document.title`，并尽量更新 `og:title` 和 `og:description`。只读取首页 HTML、不跑脚本的爬虫，看到的仍是站点级卡片。
- 仓库根目录有 `.nojekyll`，Pages 按原文件发布，不经过 Jekyll。
- 深色模式记在这台浏览器的 `localStorage`（`dn-theme`）。行情页选择的省份记在 `dn-fuel-province`。
- 不收集账号，不做统计。

## 仓库

https://github.com/wengqian66/daily-news
