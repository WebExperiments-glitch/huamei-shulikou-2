# 术力口周榜 · 前端

> React 19 + TypeScript + Vite 8 + ECharts

## 开发

```bash
cd frontend
npm install
npm run dev       # 开发服务器 → http://localhost:5173
npm run build     # 生产构建 → frontend/dist/
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE` | `http://127.0.0.1:8010` | 后端 API 地址 |

## 项目结构

```
src/
├── components/       # 通用组件
│   ├── Layout.tsx         # 主布局（导航 + 侧栏 + 路由出口）
│   ├── RankTable.tsx      # 排行榜数据表格
│   ├── ErrorBoundary.tsx  # React 错误边界
│   ├── CommandPalette.tsx # ⌘K 命令行面板
│   ├── ChartCard.tsx      # 图表卡片容器（含导出）
│   ├── ChartExport.tsx    # ECharts 导出 PNG
│   ├── RefreshButton.tsx  # 同步数据按钮
│   ├── Skeleton.tsx       # 骨架屏
│   ├── MarkdownLite.tsx   # 轻量 Markdown 渲染
│   └── ui.tsx             # 基础 UI 元件（Spinner / Chip / Badge / KPI）
├── hooks/             # 自定义 Hooks
│   ├── useEChart.ts       # ECharts 初始化（回调 ref 保异步挂载）
│   └── useDebounce.ts     # 防抖
├── lib/               # 工具库
│   ├── api.ts             # API 请求封装 + SSE 流式读取
│   ├── types.ts           # TypeScript 类型定义
│   ├── format.ts          # 格式化工具（数字/日期/分级）
│   ├── theme.ts           # 主题切换（浅色/深色）
│   ├── favorites.ts       # 收藏系统（localStorage + zustand）
│   ├── conversations.ts   # AI 多会话管理（localStorage + 服务端同步）
│   ├── markdown.tsx       # 零依赖 Markdown 渲染组件
│   ├── neteasePlayer.tsx  # 网易云播放器（Context + audio）
│   └── bvid.ts            # BV 号工具函数
├── pages/             # 页面组件（20+ 个路由页面）
│   ├── Dashboard.tsx           # 总览
│   ├── OfficialBoard.tsx       # 周榜/传说曲榜/年榜
│   ├── MonthlyBoard.tsx        # 月榜
│   ├── DailyBoard.tsx          # 日榜
│   ├── SongLibrary.tsx         # 歌曲库
│   ├── SongDetail.tsx          # 单曲详情
│   ├── Artists.tsx             # P主榜
│   ├── Vocalists.tsx           # 歌姬榜
│   ├── ArtistDetail.tsx        # P主/歌姬详情页
│   ├── HotBoard.tsx            # 实时热度（综合榜+涨速榜+AI分析）
│   ├── Compare.tsx             # 歌曲对比
│   ├── Analytics.tsx           # 数据分析
│   ├── Formula.tsx             # 公式与试算
│   ├── AnnualReview.tsx        # 年度回顾
│   ├── LegendTimeline.tsx      # 传说曲晋升时间线
│   ├── Favorites.tsx           # 收藏的歌曲
│   ├── Agent.tsx               # AI 智能体
│   ├── Netease.tsx             # 网易云搜索
│   └── NeteaseDetail.tsx       # 网易云详情
├── App.tsx                # 路由配置
├── App.css                # 全局样式覆盖
├── index.css              # 主题变量 + 全局样式（浅色/深色）
└── main.tsx               # 入口
```

## 路由

| 路径 | 页面 |
|---|---|
| `/` | 总览 Dashboard |
| `/board/:type` | 官方榜单（weekly / legend / annual） |
| `/monthly` | 月榜 |
| `/daily` | 日榜 |
| `/songs` | 歌曲库 |
| `/song/:bvid` | 单曲详情 |
| `/artists` | P主榜 |
| `/vocalists` | 歌姬榜 |
| `/artist/:kind/:name` | P主/歌姬详情 |
| `/hot` | 实时热度 |
| `/compare` | 歌曲对比 |
| `/analytics` | 数据分析 |
| `/formula` | 公式与试算 |
| `/annual` | 年度回顾 |
| `/legend-timeline` | 传说曲晋升 |
| `/favorites` | 收藏的歌曲 |
| `/agent` | AI 智能体 |
| `/netease` | 网易云搜索 |
| `/netease/:kind/:id` | 网易云详情 |
| `/predict` | 下期冲榜预测（A） |
| `/export` | 数据导出中心（B） |
| `/formula-lab` | 公式可视化实验室（D） |

## 类型

所有 TypeScript 类型定义在 `src/lib/types.ts`，核心类型：

- `RankEntry`：榜单条目（含排名/得分/互动数据/P主/歌姬）
- `Song`：歌曲元信息（含分级 tier）
- `BoardInfo` / `IssueInfo`：榜单元数据
- `Producer` / `Vocalist`：P主/歌姬
- `NeteaseItem` / `NeteaseDetail`：网易云数据类型
- `AIMessage` / `Conversation`：AI 会话类型