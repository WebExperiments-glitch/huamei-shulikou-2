# 术力口周榜 — API 接口文档

> 版本：0.1.0（正式版）
>
> 基础地址：`http://127.0.0.1:8010`（开发环境，直连后端）
>
> 前端开发代理：`npm run dev` → `http://localhost:5173/api/*` 自动转发至后端（见 `vite.config.ts` proxy 配置）
>
> 交互式文档（最权威、字段最全）：启动后端后访问 `/docs`（Swagger UI）
>
> 说明：本文档按后端真实路由逐条列出。带 `*` 的接口为本版新增或新增参数；响应字段的精确结构以 `/docs` 为准。

## 目录

- [健康检查](#健康检查)
- [榜单 Boards](#榜单-boards)
- [歌曲 Songs](#歌曲-songs)
- [统计 Stats](#统计-stats)
- [自建榜 月榜/日榜](#自建榜-月榜日榜)
- [实时热度 Hot](#实时热度-hot)
- [下期冲榜预测 Predict](#下期冲榜预测-predict)
- [AI 智能体](#ai-智能体)
- [网易云音乐](#网易云音乐)
- [同步管理](#同步管理)
- [翻译](#翻译)
- [会话管理](#会话管理)
- [缓存管理 Cache](#缓存管理-cache)

---

## 健康检查

### `GET /api/health`

返回服务状态。

```json
{ "status": "ok", "version": "0.1.0", "app": "huamei术力口", "docs": "/docs" }
```

---

## 榜单 Boards

前缀：`/api`

### `GET /api/boards`

列出所有可用榜单类型。

**响应**：`BoardInfo[]`（`type` / `label` / `issue_count` / `latest` / `range.start` / `range.end`）

### `GET /api/boards/{board_type}/issues`

列出某榜单的全部期次。`board_type` = `weekly` / `legend` / `annual`。

**响应**：`IssueInfo[]`（`issue` / `date` / `entries`）

### `GET /api/boards/{board_type}/issues/{issue}/rankings`

> ⚠️ 正确路径含 `issues` 段：`/api/boards/{board_type}/issues/{issue}/rankings`。

获取某期榜单排名。

**查询参数**：`top`（可选，默认 20，只返回前 N 名）

**响应**：`RankEntry[]`（`rank` / `bvid` / `title` / `title_cn` / `view` / `favorite` / `coin` / `like` / `share` / `score` / `last_rank` / `weeks_on_board` / `peak_rank` / `producers` / `vocalists`）

### `GET /api/boards/{board_type}/issues/{issue}/sparklines`

某期榜单的迷你走势（供前端火花线）。

### `GET /api/boards/{board_type}/reentries`

二次上榜 / 再上榜追踪。

### `GET /api/boards/{board_type}/song/{bvid}/history`

某曲在指定榜单的全部历史排名。

---

## 歌曲 Songs

前缀：`/api/songs`

### `GET /api/songs/search`

歌曲库搜索与分页。

**查询参数**：`q`（关键词）/ `producer` / `vocalist` / `tier`（`hall`/`legend`/`myth`）/ `sort`（`pubtime`/`view`/`score`）/ `page` / `page_size`

### `GET /api/songs/facets`

筛选维度聚合（P主 / 歌姬 / 分级等可选值），供前端筛选器使用。

### `GET /api/songs/suggest`

搜索建议（前缀匹配）。

### `GET /api/songs/suggest-names`

P主 / 歌姬名称补全建议。

### `GET /api/songs/{bvid}`

单曲详情（含所有榜单历史）。

### `GET /api/songs/{bvid}/all-history`

单曲全量历史（周榜 + 传说曲 + 年榜 + 实时数据）。

### `GET /api/songs/{bvid}/score-breakdown`

得分因子拆解（含时间修正系数）。

### `GET /api/songs/{bvid}/formula-compare`

新旧公式在同一首歌上的得分对照。

---

## 统计 Stats

前缀：`/api/stats`

### `GET /api/stats/artists`

P主榜统计（按收录曲数 / 总播放排序）。

### `GET /api/stats/vocalists`

歌姬榜统计。

> 注：P主 / 歌姬的**加权战力分**由前端在 `/artists`、`/vocalists` 页面基于上述统计透明计算，后端不另设独立排名端点。

---

## 自建榜 月榜/日榜

前缀：`/api`

### `GET /api/monthly/issues`

月榜可用期次。

### `GET /api/monthly/issues/{issue}/rankings`

某月榜期排名。

### `GET /api/daily/issues`

日榜可用期次。

### `GET /api/daily/issues/{issue}/rankings`

某日榜期排名。

---

## 实时热度 Hot

前缀：`/api/hot`

### `GET /api/hot/status`

实时热度数据状态（快照时间、收录曲数、刷新状态等）。

### `POST /api/hot/refresh`

触发一次全量刷帧（爬取最新数据）。

### `GET /api/hot/songs`

实时综合榜（累计口径）。**参数**：`sort` / `q` / `tier` / `limit`

### `GET /api/hot/momentum`

涨速榜（增量口径）。**参数**：`metric`（`view`/`favorite`/`coin`/`like`/`share`/`score`）/ `limit`

### `GET /api/hot/think/search`

实时热度相关的 AI 联想搜索（歌曲 / P主 / 歌姬）。

### `GET /api/hot/think/detail`

单曲实时热度深度解读（AI）。

### `GET /api/hot/snapshots`

快照列表（反映数据更新时点）。

---

## 下期冲榜预测 Predict

前缀：`/api/predict`

### `GET /api/predict/next-week`

下期冲榜预测：基于快照增量外推 7 日，套用现行公式并与历史入榜线比较。

**查询参数**：
- `baseline`（`auto`/`prev`/具体 snapshot id，默认 `auto`）
- `decay`（热度衰减系数 0.3–1.5，默认 1.0）
- `limit`（1–300，默认 60）
- `board`（榜种，默认 `weekly`）

### `GET /api/predict/cutlines`

历史入榜线（各期末位得分），供前端画门槛趋势。

**查询参数**：`board`（默认 `weekly`）/ `lookback`（2–40，默认 12）

---

## AI 智能体

前缀：`/api/ai`

### `GET /api/ai/health`

> ⚠️ 正确方法为 **GET**（非 POST）。

AI 模型状态。

```json
{
  "ready": true,
  "base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-v4-flash",
  "cloud": true
}
```

### `POST /api/ai/switch`

手动切换本地模型（`4b` / `2b`）。

### `POST /api/ai/stream`

通用流式对话 SSE。

**请求体**：
```json
{ "messages": [{ "role": "user", "content": "..." }], "max_tokens": 8192, "temperature": 0.7 }
```

**响应**：SSE 事件流（`reasoning` / `content` / `done`）

### `POST /api/ai/stream-song`

单曲分析 SSE（专用提示词模板）。

### `POST /api/ai/agent`

智能体 ReAct 循环 SSE（工具可用）。

**请求体**：
```json
{ "messages": [{ "role": "user", "content": "..." }], "max_steps": 8, "max_tokens": 8192, "temperature": 0.7, "approved": [] }
```

**SSE 事件类型**：`reasoning` / `content` / `tool_call` / `tool_result` / `chart` / `sources` / `client_action` / `confirm_required` / `done`

---

## 网易云音乐

前缀：`/api/netease`（全部 POST，固定限流 30 次/分/IP）

### `POST /api/netease/search`

搜索网易云音乐。`type`：`song` / `artist` / `album` / `playlist`

```json
{ "keyword": "千本桜", "type": "song", "limit": 10 }
```

### `POST /api/netease/song`

单曲详情（含评论数、热度）。

### `POST /api/netease/artist`

歌手详情（含热门曲 50 首）。

### `POST /api/netease/album`

专辑详情（含完整曲目列表）。

### `POST /api/netease/playlist`

歌单详情（含完整曲目列表）。

### `POST /api/netease/lyric`

歌词（LRC 格式，含翻译对齐）。

### `POST /api/netease/url`

获取播放地址（MP3 直链，有效期约 20 分钟）。

> ⚠️ 版权受限曲目返回 `404`；`play_count` 因网易云接口废弃恒为 null。

---

## 同步管理

前缀：`/api/sync`

### `POST /api/sync/refresh`

> ⚠️ 正确路径为 `/refresh`（旧文档写作 `/trigger` 已作废）。

触发一次全量同步（从 biliboard.uk 拉取最新数据）。

### `GET /api/sync/status`

同步任务状态轮询。

---

## 翻译

前缀：`/api/translate`

### `GET /api/translate`

> ⚠️ 正确方法为 **GET**（旧文档写作 POST 已作废）。

翻译文本（调用 AI 模型）。**查询参数**：`text` / `target`（目标语言，默认 `zh`）

---

## 会话管理

前缀：`/api/conversations`

### `GET /api/conversations`

列出当前客户端的 AI 会话（匿名 `client_id` 隔离）。

### `POST /api/conversations`

保存 / 更新会话。

### `DELETE /api/conversations/{conv_id}`

删除会话。

---

## 缓存管理 Cache

前缀：`/api/cache`（新增于 0.1.0，管理持久化 SQL 缓存 `data/cache.sqlite`）

### `GET /api/cache`

缓存概况：总数 / 存活数 / 过期数 / 示例 key。

### `POST /api/cache/prune`

仅清理已过期的缓存条目。**请求体**：`{}`

### `POST /api/cache/clear`

清空全部缓存（危险操作）。**请求体需携带**：`{ "confirm": true }`，否则返回拒绝提示、不执行。
