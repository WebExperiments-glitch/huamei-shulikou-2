# huamei术力口 — VOCALOID 周榜实时追踪

> v0.1.1 | CC BY-NC 4.0

实时追踪 B 站 VOCALOID 每周排行榜、传说曲、神话曲数据，提供多维度榜单、数据分析与 AI 智能体。

## 功能

- **官方榜单** — 周榜 / 传说曲榜 / 年榜，含历史回溯与公式拆解
- **自建榜单** — 月榜 / 日榜，基于官方数据聚合
- **实时热度** — 快照差分计算涨速，综合排名 + 涨速榜
- **歌曲库** — 多维度筛选（P主 / 歌姬 / 分级 / 播放量），全文搜索（含全池播放指标补抓脚本）
- **P主榜 / 歌姬榜** — 统计上榜作品数、播放量、传说曲/神话曲数量
- **AI 智能体** — DeepSeek 云端模型，ReAct 回路 + 工具调用 + 联网搜索
- **网易云音乐** — 搜索、播放、歌词，自研 WeAPI 加密
- **数据分析** — 歌曲对比、年度回顾、传说曲晋升时间线
- **主题切换** — 浅色 / 深色一键切换，移动端响应式

## 快速开始

```bash
# 1. 启动后端
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

# 2. 启动前端
cd frontend
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`

> 详细文档见 [backend/README.md](backend/README.md)、[frontend/README.md](frontend/README.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 / TypeScript / Vite 8 / ECharts |
| 后端 | FastAPI 0.139 / Python 3.13+ |
| 数据 | SQLite / B 站 API / Scrapling |
| AI | DeepSeek-V4-Flash / llama.cpp（本地推理） |

## 许可证

本项目采用 [CC BY-NC 4.0](LICENSE)（署名-非商业性使用 4.0 国际版）许可。

- 可自由分享、修改、再创作
- 必须署名原作者
- 禁止商业用途