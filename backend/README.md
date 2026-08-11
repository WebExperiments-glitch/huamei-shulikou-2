# 术力口周榜 · 后端

> FastAPI 0.139 + Python 3.11+ + SQLite

## 启动

```bash
cd backend
# 安装依赖
pip install -r requirements.txt
# 启动服务
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

或使用批处理脚本：

```bash
backend\run.bat
```

## 环境变量

复制 `.env.example` 为 `.env`，按需配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SOURCE_DB` | `../biliboard-database/.../biliboard (11).db` | 官方数据源路径 |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许跨域的前端源 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `MAX_BODY_BYTES` | `4194304` (4MB) | 最大请求体 |
| `AI_RATE_PER_MIN` | `20` | 本地 AI 限流（次/分/IP） |
| `AI_CACHE_TTL` | `600` | AI 流式缓存 TTL（秒，0=关） |
| `AI_BASE_URL` | — | 云端模式端点（设此值即启用云端，跳过本地故障转移） |
| `AI_API_KEY` | — | 云端 API Key |
| `AI_MODEL` | `deepseek-v4-flash` | 云端模型名 |
| `WEB_SEARCH_PROVIDER` | `duckduckgo` | 联网搜索提供商（tavily/brave/exa/searxng） |

## 项目结构

```
backend/
└── app/
    ├── api/               # 路由层
    │   ├── boards.py      # 榜单接口
    │   ├── songs.py       # 歌曲接口
    │   ├── stats.py       # 统计接口
    │   ├── hot.py         # 实时热度接口
    │   ├── predict.py     # 下期冲榜预测接口
    │   ├── ai.py          # AI 对话/智能体接口
    │   ├── netease.py     # 网易云音乐接口
    │   ├── sync.py        # 同步管理接口
    │   ├── translate.py   # 翻译接口
    │   ├── selfbuilt.py   # 自建榜接口
    │   ├── cache.py       # 缓存管理接口（持久化 SQL）
    │   └── conversations.py # AI 会话接口
    ├── core/              # 基础设施
    │   ├── config.py      # 配置管理
    │   ├── db.py          # 数据库连接
    │   ├── cache.py       # TTL 持久化缓存（SQLite，@cached 装饰器）
    │   └── ratelimit.py   # 滑动窗口限流器
    ├── services/          # 业务逻辑
    │   ├── boards.py      # 榜单数据读取与公式计算
    │   ├── songs.py       # 歌曲库查询
    │   ├── crawler.py     # B 站实时爬虫
    │   ├── ai.py          # AI 模型管理 + agent ReAct 回路
    │   ├── netease.py     # 网易云 WeAPI 封装
    │   ├── rank.py        # 核心排名算法
    │   ├── sync_runner.py # 后台同步任务
    │   ├── conv_store.py  # 会话持久化
    │   └── translate.py   # 翻译服务
    ├── vendor/            # 第三方兼容实现
    │   └── weencrypt.py   # 网易云 WeAPI 加密（MIT 自研）
    └── main.py            # 应用入口 + 中间件
```

## 核心公式

### 现行（Issue ≥ 54）

```
得分 = Δ播放 × t + Δ收藏 × 15 + Δ点赞 × 3 + Δ投币 × 30
t = 1  (老曲) 或  log10(e^(Δt/86400/14) + 1) + 1  (新曲)
```

### 旧版（Issue < 54）

```
得分 = 2 × Δ播放 × t + Δ收藏 × 30 + Δ点赞 × 3 + Δ投币 × 10 + 投票加成
```

> 已用 112 期官方 API 全量对拍验证。

## 数据库

| 文件 | 位置 | 用途 |
|---|---|---|
| `biliboard (11).db` | 外部（由 `SOURCE_DB` 指向） | 官方数据源（只读） |
| `hot.sqlite` | `data/` | 实时热度缓存 + 快照 |
| `daily.sqlite` | `data/` | 日榜数据 |
| `monthly.sqlite` | `data/` | 月榜数据 |
| `agent.sqlite` | `data/` | AI 会话 |
| `translate.sqlite` | `data/` | 翻译缓存 |

## API 文档

启动后端后访问 `/docs`（Swagger UI）或查阅 `docs/API.md`。