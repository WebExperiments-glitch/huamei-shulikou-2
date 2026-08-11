# 术力口周榜 — 系统架构文档

## 概述

**huamei术力口** 是一个 B 站 VOCALOID（术力口）周榜全栈项目，从零复刻 BiliBoard 的榜单算法，并扩展了实时热度追踪、AI 智能体分析、网易云音乐集成等能力。

核心定位：**全量 + 公式透明 + API 可核验**。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 8 + ECharts + TanStack Query |
| 后端 | Python 3.11+ / FastAPI 0.139 + uvicorn |
| 数据库 | SQLite（官方数据 + 自建月榜/日榜/实时热度 + Agent 会话） |
| 爬虫 | scrapling（Chrome TLS 指纹模拟）+ bilibili-api + httpx |
| AI | 云端 DeepSeek-V4-Flash / 本地 llama.cpp 4B/2B GGUF |
| 图表 | ECharts 5（前端渲染）+ 后端 Agent 生成式图表 |
| 网易云 | 自研 WeAPI 加密（weencrypt.py，MIT 协议） |

## 项目结构

```
术力口/
├── backend/                    # FastAPI 后端
│   └── app/
│       ├── api/                # 路由层（boards / songs / hot / ai / netease …）
│       ├── core/               # 基础设施（config / db / cache / ratelimit）
│       ├── services/           # 业务逻辑（boards / crawler / ai / sync_runner …）
│       ├── vendor/             # 第三方兼容实现（weencrypt.py MIT）
│       └── main.py             # 应用入口 + 中间件
├── frontend/                   # React 前端
│   └── src/
│       ├── components/         # 通用组件（Layout / RankTable / ErrorBoundary …）
│       ├── hooks/              # 自定义 Hook（useEChart / useDebounce）
│       ├── lib/                # 工具库（api / types / format / theme / conversations …）
│       └── pages/              # 页面组件（16 个路由页面）
├── scripts/                    # 运维脚本（sync_official / build_daily / build_monthly）
├── docs/                       # 文档
├── data/                       # 运行时数据（SQLite 数据库）
└── Scrapling-0.4.12/           # vendored 爬虫库（BSD-3-Clause）
```

## 数据流

```
Biliboard 官方 API ──→ sync_official.py ──→ backend SQLite 只读数据库
                                                    │
              ┌─────────────────────────────────────┤
              ▼                                     ▼
      实时爬虫（crawler）                   后端服务（boards / songs）
              │                                     │
              ▼                                     ▼
       hot.sqlite（实时快照）              FastAPI 路由 → RESTful JSON
              │                                     │
              ▼                                     ▼
      涨速榜 / 综合榜                       前端 React 页面渲染
```

## 核心公式

得分由 Biliboard 官方公式给出，系数已用 112 期官方 API 全量对拍验证。

### 现行公式（Issue ≥ 54）

```
得分 = Δ播放 × t + Δ收藏 × 15 + Δ点赞 × 3 + Δ投币 × 30
```

- 系数 `(view=1, favorite=15, like=3, coin=30)` 经验证与官方**完全一致**。
- `t` 为时间 / 新曲加成系数，**实现上钳制在 `[1.0, 2.615]`**（`rank.time_correction`）：
  - 老曲（投稿早于本期起点）：`t = 1`
  - 新曲（本期内投稿）：`t = log10(e^(Δt/86400/14)+1)+1`，随后钳制到 `[1.0, 2.615]`
  - `Δt = 投稿时间 − 本周起始快照时刻（前一期统计截止，单位秒）`
  - `pubtime` 缺失或晚于本期起点 1 年以上（脏数据）按老曲 `t=1` 处理。

### 二次测算结论（2026-08-11）

- 系数与榜单排名**完全可复现**：排名直接使用官方 `score`，新公式期 top20 重合率 **100%**。
- 逐曲 `score` 还原率 **68.8%**（|Δ|≤1）。根因：官方 `t` **并非 pubtime 的简单函数**，而是主要给「首次上榜」歌曲（`weeks_on_board==1`）的加成，幅度在 `[1, 2.615]` 间不固定，无法仅凭 `pubtime` 精确反推。故复算得分为**近似还原**，榜单排名精确。
- 钳制上限 `2.615` 来自官方 112 期 `implied_t` 实测（中位 1.0、p95 1.69、最大 2.615），可消除脏数据导致的 `t=13.7 / 19.8` 等荒谬值。

### 旧公式（Issue < 54）

```
得分 = 2 × Δ播放 × t + Δ收藏 × 30 + Δ点赞 × 3 + Δ投币 × 10 + 投票加成
```

- `t` 为按「发行天数 D」的阶梯系数（见 `rank.time_correction_old`，D 用时间戳秒差向下取整 24h 天）。

## 数据源

| 数据 | 来源 | 更新频率 |
|---|---|---|
| 官方周榜 112 期 | biliboard.uk API | 全量同步 |
| 传说曲榜 73 期 | biliboard.uk API | 全量同步 |
| 年榜 5 期 | biliboard.uk API | 全量同步 |
| 收录池 12381 首 | biliboard.uk API | 全量同步 |
| 实时播放/互动 | api.bilibili.com | 按需刷新 |
| 网易云音乐 | music.163.com WeAPI | 按需搜索 |

## 数据库

| 文件 | 用途 |
|---|---|
| `biliboard (11).db` | 官方数据源（只读，含 112 张 official_YYYYMMDD 表） |
| `hot.sqlite` | 实时热度缓存 + 快照 |
| `cache.sqlite` | 通用持久化缓存（TTL，重启不丢） |
| `daily.sqlite` | 日榜数据 |
| `monthly.sqlite` | 月榜数据 |
| `agent.sqlite` | AI 智能体会话持久化 |
| `translate.sqlite` | 翻译缓存 |

## 安全

- CORS 白名单（默认 `localhost:5173/5174`，生产环境变量 `CORS_ORIGINS` 收紧）
- 安全头中间件（X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy）
- 请求体大小限制（默认 4MB，`MAX_BODY_BYTES` 可调）
- 限流（AI 接口本地模式每 IP 20 次/分，云端模式敞开；网易云 30 次/分）
- API Key 仅存 `backend/.env`（不进版本库）
- 项目许可证：CC BY-NC 4.0（署名-非商业性使用）
- 网易云 WeAPI 加密由自研 `weencrypt.py`（MIT）实现，无 AGPL 污染