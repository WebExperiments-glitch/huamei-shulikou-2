# 术力口周榜 · VOCALOID Weekly Board

从零复刻的 **B 站术力口（中文 VOCALOID）周榜**：全量自采 + 公式透明 + API 可核验。
不仅给出榜单，还把打分公式、实时增量、传说曲晋升链路全部开放出来，任何人都能用同一套数据复现结果。

> 术力口 = 中文社区对用 VOCALOID / 歌声合成引擎创作的歌曲的统称。

## 特性

- **榜单透明**：周榜 / 年榜 / 传说曲榜，计分公式完全公开可核验（见下文「计分公式」）。
- **实时热度**：综合榜（累计口径）+ 涨速榜（增量口径），对比相邻快照自动计算播放/收藏/硬币/点赞增量。
- **AI 智能体（Agents）**：19 个工具——周榜/年榜/传说曲/单曲详情/检索/作者作品/趋势/对比/筛选/联网搜索/网页抓取，以及用户收藏、笔记、导出报告、触发刷新/重建/重算等权限操作（写操作与系统任务需用户确认）。
- **多会话**：对话自动保存，支持新建 / 切换 / 重命名 / 删除 / 搜索 / 置顶，并可在后端 SQLite 备份（不怕清浏览器缓存）。
- **网易云音乐集成**：单曲 / 歌手 / 专辑 / 歌单搜索与详情。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + zustand + TanStack Query + Tailwind |
| 后端 | FastAPI + SQLite + httpx |
| AI | 本地 llama.cpp（4B/2B 蒸馏，自动故障转移）或 云端 OpenAI 兼容端点（DeepSeek 等） |

## 目录

```
术力口/
├── backend/          FastAPI 服务（app/）
├── frontend/         React 前端（src/）
├── data/             本地数据库（不进版本库，运行时生成）
├── .env.example      后端配置模板
└── README.md
```

## 快速开始

### 1. 后端

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env        # 然后填入你的密钥（见「配置」）
uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 即可使用。

## 配置（`backend/.env`）

| 变量 | 说明 |
|---|---|
| `AI_BASE_URL` + `AI_API_KEY` | 启用**云端 AI**（OpenAI 兼容端点，如 DeepSeek）。填了即跳过本地 4B/2B 故障转移。 |
| `AI_MODEL` | 云端模型名，默认 `deepseek-v4-flash`。 |
| `WEB_SEARCH_PROVIDER` + 对应 key | 智能体联网搜索（可选）。支持 `tavily` / `brave` / `exa` / `searxng` / `duckduckgo`（兜底）。推荐 Tavily（AI 原生，免费额度）。 |
| `SOURCE_DB` | 官方 biliboard 数据源路径（环境变量）。默认相对推算到仓库外的同级目录；若你的数据库在别处，请用此变量覆盖。 |

> 不配置 AI 也能跑（本地模型或纯数据接口）；但智能体对话需要 AI。不配置联网搜索则 `web_search` 会优雅降级。

## 计分公式

分界点 = issue 54（含）起为新公式。

**新公式（issue ≥ 54，现行）**

```
得分 = Δview·t + 15·Δfav + 3·Δlike + 30·Δcoin

t = log10(e^(Δt/86400/14) + 1) + 1
Δt = pubtime − 本周起始快照时刻（秒），老曲 Δt<0 时钳制 t=1
```

必须 `log10`（非 ln），且以「本周起始快照」为锚点（非日历天 / 结束锚点），否则新曲加成量级会整体错位。

旧公式（issue < 54）：`得分 = 2·Δview·t + 30·Δfav + 3·Δlike + 10·Δcoin`，t 为阶梯函数。

## API 概览

- `GET  /api/health` 服务健康
- `GET  /api/boards` 榜单列表
- `GET  /api/stats/artists`、`/api/stats/vocalists` 统计
- `POST /api/ai/agent` AI 智能体（SSE 流式，工具循环）
- `GET/POST/DELETE /api/conversations` 会话后端备份（按匿名 client_id 隔离）
- `POST /api/netease/search`、`/api/netease/song` 网易云

## 开源声明

本项目**不含任何密钥或隐私数据**：`.env`、`.mcp.json`、本地数据库（`data/`）、临时脚本、`.workbuddy/` 均通过 `.gitignore` 排除。部署时请自行配置密钥与数据源。

## License

[MIT](./LICENSE)
