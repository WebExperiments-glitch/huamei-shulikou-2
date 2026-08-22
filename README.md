# huamei术力口 — VOCALOID 周榜实时追踪

> V0.2.0.1 RC 1 | CC BY-NC 4.0

实时追踪 B 站 VOCALOID 每周排行榜、传说曲、神话曲数据，提供多维度榜单、数据分析与 AI 智能体。

## 功能

- **官方榜单** — 周榜 / 传说曲榜 / 年榜，含历史回溯与公式拆解
- **自建榜单** — 月榜 / 日榜，基于官方数据聚合
- **实时热度** — 快照差分计算涨速，综合排名 + 涨速榜
- **歌曲库** — 多维度筛选（P主 / 歌姬 / 分级 / 播放量），全文搜索（含全池播放指标补抓脚本）
- **P主榜 / 歌姬榜** — 统计上榜作品数、播放量、传说曲/神话曲数量
- **AI 智能体** — DeepSeek 云端模型，ReAct 回路 + 工具调用 + 联网搜索
- **AI 伴侣（Airi）** — 3D 角色 + 语音对话 + 情绪反馈，基于 Three.js / VRM
- **网易云音乐** — 搜索、播放、歌词，自研 WeAPI 加密
- **数据分析** — 歌曲对比、年度回顾、传说曲晋升时间线
- **液态玻璃视觉** — Liquid Glass 界面 + WebGPU 粒子背景 + 全局动效
- **主题切换** — 浅色 / 深色一键切换，移动端响应式

## 本轮更新（V0.2.0.1 RC 1）

### 液态玻璃与新一代视觉系统
- **液态玻璃（Liquid Glass）** — 卡片 / 面板毛玻璃 + 流动折射高光，尊重 `prefers-reduced-motion`
- **WebGPU 粒子背景** — WaveTerrain 波动地形 + 粒子星云，GPU compute shader 渲染，自动回退 Canvas2D
- 全局动效层：滚动进度条 / 卡片聚光灯 / 数字滚动 / 打字机 / 文字流光 / 3D 倾斜 / 点击涟漪 / 排名徽标（借鉴 React Bits / Magic UI / Aceternity 自研适配）
- **特效设置**（汉堡菜单「我的」→ 特效设置）：总开关 + 动画密度 + 分类开关，`localStorage` 持久化

### AI 能力
- **Airi AI 伴侣**：3D 角色场景（Three.js + VRM）、对话区、情绪球
- **AI 智能体增强**（借鉴 DSH 思路）：待办清单 + 进度条、目标轮次预算控制、结构化错误码
- **音乐可视化**：Three.js 频谱驱动可视化播放器

### 工程健壮性
- 启动钩子迁移至 FastAPI `lifespan`（弃用 `@app.on_event`）
- 前端 AI/3D 依赖懒加载，首屏主 bundle 体积显著下降
- 测试：前端 vitest、后端 36 项 pytest 全绿，`tsc -b` 零错误、`npm run build` 通过
- 修复自建核验列 `self_score` 中 like/coin 权重顺序颠倒的数据正确性 BUG

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