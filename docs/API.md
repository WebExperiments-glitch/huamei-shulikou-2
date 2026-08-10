# 术力口周榜 — API 接口文档

> 基础地址：`http://127.0.0.1:8010`（开发环境，直连后端）
>
> 前端开发代理：`npm run dev` → `http://localhost:5173/api/*` 自动转发至后端（见 `vite.config.ts` proxy 配置）
>
> 交互式文档：`/docs`（Swagger UI）

## 目录

- [健康检查](#健康检查)
- [榜单](#榜单-boards)
- [歌曲](#歌曲-songs)
- [统计](#统计-stats)
- [实时热度](#实时热度-hot)
- [AI 智能体](#ai-智能体)
- [网易云音乐](#网易云音乐)
- [同步管理](#同步管理)
- [翻译](#翻译)
- [会话管理](#会话管理)

---

## 健康检查

### `GET /api/health`

返回服务状态。

```json
{ "status": "ok", "version": "0.1.0-preview" }
```

---

## 榜单 Boards

### `GET /api/boards`

列出所有可用榜单类型。

**响应**：`BoardInfo[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `string` | 榜单类型标识（`weekly` / `legend` / `annual`） |
| `label` | `string` | 显示名称 |
| `issue_count` | `number` | 总期数 |
| `latest` | `IssueInfo \| null` | 最新一期信息 |
| `range.start` | `string \| null` | 数据起始日期 |
| `range.end` | `string \| null` | 数据结束日期 |

### `GET /api/boards/{type}/issues`

列出某榜单的全部期次。

**参数**：`type` = `weekly` / `legend` / `annual`

**响应**：`IssueInfo[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `issue` | `string` | 期号（如 `"113"`） |
| `date` | `string` | 发布日期 |
| `entries` | `number` | 该期条目数 |

### `GET /api/boards/{type}/{issue}/rankings`

获取某期榜单排名。

**参数**：
- `top`（可选，query）：只返回前 N 名，默认 20

**响应**：`RankEntry[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `rank` | `number` | 排名 |
| `bvid` | `string` | BV 号 |
| `title` | `string` | 标题 |
| `title_cn` | `string \| null` | 中文标题 |
| `view` / `favorite` / `coin` / `like` / `share` | `number` | 互动数据 |
| `score` | `number` | 综合得分 |
| `last_rank` | `number \| null` | 上周排名 |
| `weeks_on_board` | `number` | 在榜周数 |
| `peak_rank` | `number` | 最高排名 |
| `producers` | `Producer[]` | P主列表 |
| `vocalists` | `Vocalist[]` | 歌姬列表 |

### `GET /api/boards/song/{bvid}/history`

某曲在某个榜单的全部历史排名。

### `GET /api/boards/{type}/song/{bvid}/history`

某曲在指定榜单的全部历史排名。

### `GET /api/boards/reentries`

获取二次上榜/再上榜追踪。

---

## 歌曲 Songs

### `GET /api/songs`

歌曲库搜索与分页。

**查询参数**：
- `q`：关键词搜索（标题/曲名）
- `producer`：P主筛选
- `vocalist`：歌姬筛选
- `tier`：分级（`hall` / `legend` / `myth`）
- `sort`：排序（`pubtime` / `view` / `score`）
- `page` / `page_size`：分页

### `GET /api/songs/{bvid}`

单曲详情（含所有榜单历史）。

### `GET /api/songs/{bvid}/all-history`

单曲全量历史（周榜 + 传说曲 + 年榜 + 实时数据）。

### `GET /api/songs/suggest`

搜索建议（前缀匹配）。

### `GET /api/songs/{bvid}/score-breakdown`

得分因子拆解（含时间修正系数）。

---

## 统计 Stats

### `GET /api/stats/artists`

P主榜统计（按收录曲数/总播放排序）。

### `GET /api/stats/vocalists`

歌姬榜统计。

### `GET /api/stats/artist-rankings`

P主排名（含各指标明细）。

### `GET /api/stats/vocalist-rankings`

歌姬排名。

---

## 实时热度 Hot

### `GET /api/hot/songs`

实时综合榜（累计口径）。

**参数**：`sort` / `q` / `tier` / `limit`

### `GET /api/hot/momentum`

涨速榜（增量口径）。

**参数**：`metric`（`view` / `favorite` / `coin` / `like` / `share` / `score`）/ `limit`

### `GET /api/hot/snapshots`

快照列表（反映数据更新时点）。

### `GET /api/hot/refresh`

触发一次全量刷帧（爬取最新数据）。

---

## AI 智能体

### `POST /api/ai/health`

AI 模型状态。

```json
{
  "ready": true,
  "base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-v4-flash",
  "cloud": true
}
```

### `POST /api/ai/stream`

通用流式对话 SSE。

**请求体**：
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "max_tokens": 8192,
  "temperature": 0.7
}
```

**响应**：SSE 事件流（`reasoning` / `content` / `done`）

### `POST /api/ai/stream-song`

单曲分析 SSE（专用提示词模板）。

### `POST /api/ai/agent`

智能体 ReAct 循环 SSE（50 个工具可用）。

**请求体**：
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "max_steps": 8,
  "max_tokens": 8192,
  "temperature": 0.7,
  "approved": []
}
```

**SSE 事件类型**：
| 事件 | 说明 |
|---|---|
| `reasoning` | 模型思考链 |
| `content` | 正文文本 |
| `tool_call` | 工具调用（参数 JSON） |
| `tool_result` | 工具执行结果 |
| `chart` | 生成式图表（ECharts option） |
| `sources` | 联网搜索来源 |
| `client_action` | 客户端操作（收藏/导出） |
| `confirm_required` | 危险操作确认 |
| `done` | 完成 |

---

## 网易云音乐

### `POST /api/netease/search`

搜索网易云音乐。

**请求体**：
```json
{ "keyword": "千本桜", "type": "song", "limit": 10 }
```

`type` 取值：`song` / `artist` / `album` / `playlist`

### `POST /api/netease/song`

单曲详情（含评论数、热度）。

### `POST /api/netease/lyric`

歌词（LRC 格式，含翻译对齐）。

### `POST /api/netease/artist`

歌手详情（含热门曲 50 首）。

### `POST /api/netease/album`

专辑详情（含完整曲目列表）。

### `POST /api/netease/playlist`

歌单详情（含完整曲目列表）。

### `POST /api/netease/url`

获取播放地址（MP3 直链，有效期约 20 分钟）。

> ⚠️ 版权受限曲目返回 `404`。

---

## 同步管理

### `GET /api/sync/status`

同步任务状态轮询。

### `POST /api/sync/trigger`

触发一次全量同步（从 biliboard.uk 拉取最新数据）。

---

## 翻译

### `POST /api/translate`

翻译文本（调用 AI 模型）。

---

## 会话管理

### `GET /api/conversations`

列出当前客户端的 AI 会话。（匿名 `client_id` 隔离）

### `POST /api/conversations`

保存/更新会话。

### `DELETE /api/conversations/{conv_id}`

删除会话。