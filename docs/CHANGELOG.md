# 更新日志

## V0.2.0.1 RC 1 — 2026-08-22（新一代界面 + 液态玻璃 + AI 伴侣 + 架构重构）

自 V0.13 lite 起重写前端视觉与新架构，正式定名 **V0.2.0.1 RC 1**（候选发布版）。对比上一版新增大量模块，视觉、动效、AI 能力与工程稳定性全面升级。

### 液态玻璃与新一代视觉系统（Liquid Glass）
- 引入 **液态玻璃（Liquid Glass）** 视觉体系：`liquid-glass` 组件 + `lib/liquidGlass` 引擎，卡片/面板沿用毛玻璃+流动折射高光，遵守系统 `prefers-reduced-motion`
- 全局动效层重构（`Effects` / `lib/fx`）：滚动进度条、卡片聚光灯、动画组件集（数字滚动 / 打字机 / 文字流光 / 3D 倾斜 / 点击涟漪 / 排名徽标 / 粒子），借鉴 React Bits / Magic UI / Aceternity 自研适配
- **特效设置面板**（SettingsPanel）：总开关 + 动画密度 + 分类开关，`localStorage` 持久化
- 系统主题浅色/深色切换，动效与 CSS 变量统一经 `data-fx*` 门控，自动适配明暗

### WebGPU 粒子背景（GPU 加速）
- 新增 `WaveTerrain`（compute shader 波动地形 + 粒子星云），支持 WebGPU 时 GPU 渲染，回退 Canvas2D；遵循减弱动效偏好
- 音乐可视化（VisualizerModal）：基于 Three.js / R3F，`AnalyserNode` 频谱驱动

### AI 能力（借鉴 DSH 思路）
- 引入 **Airi AI 伴侣**（/airi 模块）：3D 角色场景（Three.js + VRM）、对话区、情绪球，随应用加载
- AI 智能体增强：待办清单 + 进度条、目标轮次预算控制、结构化错误码、工具调用 + 联网搜索
- DeepSeek 接入：`thinking` / `reasoning_effort` / 缓存命中面向省钱优化

### 工程与架构
- 前端 API 层按功能拆分领域模块，统一错误处理（结构化 `ApiError` + `X-Request-ID` 前后端关联）
- 后端日志系统（console + 文件轮转）与请求中间件（request-id / access log / 全局异常 / 安全头 / 请求体限制）
- 启动钩子迁移至 FastAPI `lifespan`（弃用 `@app.on_event`）
- 测试：前端 vitest、后端 36 项 pytest 全绿；`tsc -b` 零错误、`npm run build` 通过
- 前端性能：AI 伴侣/3D 依赖懒加载，首屏主 bundle 体积显著下降
- 修复：自建核验列 `self_score` 中 like/coin 权重顺序颠倒的数据正确性 BUG

---

## 0.13 lite — 2026-08-15（AI 增强 + 全局动效 + 架构重构）

基于 0.1.2 的轻量迭代版（lite），聚焦 AI 智能体能力增强、全局动效系统与工程健壮性。

### AI 智能体增强（借鉴 DSH 思路）
- **待办清单 + 进度条**：后端新增 `todo_write` 工具，经事件流实时推送任务快照；前端 Agent 渲染待办列表、完成数、进度条与运行状态，会话内无缝刷新
- **目标轮次预算控制**：`run_agent` 支持 `max_rounds` 钳制，运行期间经 `goal` 事件实时上报进度，预算耗尽以 `goal_exhausted` 优雅停止；前端展示目标预算进度条（颜色渐变）与耗尽徽标
- **结构化错误码**：后端定义 `AgentErrCode` 枚举，工具调用失败以 `tool_error` 事件带码返回；前端工具卡片高亮错误码与错误消息，便于快速定位

### 全局动效与特效系统
- 新增动画组件（借鉴 React Bits / Magic UI 源码自研适配）：数字滚动 `AnimatedNumber`、打字机 `TypewriterText`、文字流光 `ShimmerText`、3D 倾斜卡片 `TiltCard`、点击涟漪 `RippleButton`、排名徽标 `RankBadge`、粒子背景 `ParticlesBg`
- 新增**特效设置**入口（汉堡菜单「我的」→ 特效设置）：总开关 + 动画密度（低/中/高）+ 分类开关，`localStorage` 持久化，CSS 经 `data-fx*` 属性门控，尊重 `prefers-reduced-motion`
- 动画覆盖核心页面并推广至更多页面：导出中心、网易云详情、AI 智能体、实时热度数据卡等
- 修复：特效 CSS 门控属性名不匹配、`RankBadge` 新上榜误判、antd Drawer `width` 弃用警告

### 公式还原与分段生成
- 公式分段生成逻辑修正：`CONTINUOUS_FORMULA_FROM_ISSUE=98`，移除过渡公式常量，按期数自动选择现行（≥108）/ 过渡（100–107）/ 中期（54–99）公式
- 现行公式起始期次校正（103 → 108）
- 验证：后端 25 项 pytest 通过；6 条离群数据无法匹配（已记录在案）；中期公式（54–97）暂缺样本数据

### 工程与架构
- 前端 API 层拆分 9 个领域模块，统一错误处理（结构化 `ApiError` + `X-Request-ID` 前后端关联），补全类型契约（`types.ts`）
- 后端新增日志系统（console + 文件轮转，5MB × 10 份）与请求中间件（request-id / access log / 全局异常处理）
- 测试：前端 26 项 vitest、后端 25 项 pytest 全绿；`tsc -b` 零错误、`npm run build` 通过

---

## 0.1.1 — 2026-08-11（公式还原：t 函数）

基于 0.1.0 正式版，对榜单核心公式的时间修正系数 `t` 做二次测算与**真正还原**（用户复核「公式透明」文案准确性后触发）。

### 公式二次测算
- 系数 `(view=1, favorite=15, like=3, coin=30)` **经验证完全准确**，榜单排名 **100% 可复现**（新公式期 top20 重合率 100%，排名直接用官方 `score`）。
- 推翻原结论：此前以为 `t` 是「首登榜加成、不可反推」，实测证明**它是 `pubtime` 在本周内的位置的确定性函数**——用官方 112 期 **周榜 JSON 的 `stats`（真实周增量）**反推 `implied_t = (score − 15Δfav − 3Δlike − 30Δcoin)/Δview` 后，`implied_t` 收敛为按「本周内投稿整天数 D_floor」的 **7 档阶梯 T[k]**（D0=1.053 → D6=2.470），单调上升且跨 pubtime 来源稳定。早期按 `frac` 0.1 窄带的分析仅显示其平滑化表象，真实官方 t 为离散阶梯；周期边界经校验为规则对齐（112 期 end_date 全部落在周日 16:00 UTC）。

### t 函数还原（替代原方案 A 钳制 / 伪 frac 连续函数）
- `rank.time_correction` 改为 **7 档阶梯 `t = T[D_floor]`**，其中 `D_floor = clamp(round((pubtime − 周期起点)/86400 − 0.5), 0, 6)`，周期起点即本期起始快照时刻；阶梯 `T = [1.0527, 1.1381, 1.3900, 1.6061, 1.6900, 2.1574, 2.4700]` 由官方 112 期 JSON `stats` 反推 `implied_t` 经鲁棒离群剔除（脏 pubtime）估计得到，干净子集 score 相对误差中位≈0.38%、全体中位≈1.3%。（曾错误写成连续 `t=1/(1−0.69·frac)`，已更正。）脏 pubtime / 缺失按 `t=1` 或安全钳制（防除零 / 爆值）。
- 同步修复 `songs.py` 既有锚点 bug：新公式原误用 `ts_of(prev_issue)`（比本周起点早 7 天），改为当前 issue 起点 `cur_ts`，与 `boards.py` 及官方语义一致。
- 同步校正文档与前端公式透明页（`Formula.tsx` / `FormulaLab.tsx` 的 t 计算与文案），及 AI 提示词旧系数（收藏×30 / 硬币×10 → 现行 收藏×15 / 硬币×30）。
- 验证脚本见 `参考数据/`：`analyze_t_restore.py`、`analyze_t_spread.py`、`analyze_t_continuous.py`、`analyze_t_clean.py`、`fit_t_function.py`、`fit_t_final.py`、`fit_t_robust.py`、`fit_t_clean.py`、`公式测算报告.md`。

### 已知限制
- 逐曲 `score` 精确还原（|Δ|≤1）受限于：经残差结构诊断，**约 1/3 新曲的官方 JSON `stats.views` 与官方 `score` 不自洽**（记录的周播放增量约只有 score 暗示值的一半）；`diag4_dvcheck.py` 证明 **100% 的高残差歌曲在把 `dv` 替换为与 score 自洽的值后残差完全消失**——即残差 100% 可解释、非随机噪声、非 t 函数缺陷，属官方数据集本身的数据层不一致。故复算 `score` 为**近似还原**（全量中位 rerr≈1.3%、p90≈32%，尾部全来自该数据不一致），但榜单排名 100% 精确。若要逐曲绝对精确，需在数据层对齐与 score 自洽的真实周增量。

---

## 0.1.0 — 2026-08-11（正式版）

首个正式发布版本。全量自采 + 公式透明 + API 可核验的 B 站 VOCALOID（术力口）周榜复刻系统。

### 核心榜单
- 周榜 / 传说曲榜 / 年榜：官方公式（`Δ播放×t + Δ收藏×15 + Δ点赞×3 + Δ投币×30`），已用 112 期官方 API 全量对拍验证
- 实时热度 HotBoard：综合榜 + 涨速榜（快照差分），殿堂 / 传说 / 神话分级
- 歌曲库：12381 首收录池搜索、筛选、排序
- P主 / 歌姬榜：统计排名与代表作
- 歌曲对比、数据分析、公式试算、年度回顾、传说曲晋升时间线

### 四大专业功能（A / B / C / D）
- **A 下期冲榜预测** `/predict`：快照增量 → 日增速 → 7 天外推 + 新公式复算，入榜线取近 12 期，透明可审计概率模型（非黑盒 ML）
- **B 数据导出中心** `/export`：多类数据集，CSV（UTF-8 BOM + 公式注入防护）/ JSON / Markdown 三格式一键导出
- **C 歌手·P主战力榜** `/artists`、`/vocalists`：P主、歌姬透明加权战力分
- **D 公式可视化实验室** `/formula-lab`：新旧公式对照与交互演示

### 数据补全
- 全量补抓脚本 `scripts/backfill_metrics.py` 完成：对无实时指标的收录池逐首抓取 B 站播放 / 收藏 / 硬币 / 点赞，写入 `hot_cache`，指标覆盖率大幅提升
- 后端已重启刷新 `metrics` 缓存，全量指标正式生效

### 合规与安全
- 审查全部外部数据源 `robots.txt` 并加固：新增 `core/robots.py`（基于标准库 `urllib.robotparser`，按 host 缓存 24h + 离线回退，尊重 `Disallow` 与 `Crawl-delay`）；爬虫接诚实 UA + 严格节流（≥0.35s 且取 Crawl-delay 大者）；`api.bilibili.com` 的 `Disallow: /` 以**透明例外**处理并记日志，`ROBOTS_STRICT=1` 可切严格拒绝模式（仅用历史快照）

### 缓存层
- 进程内内存字典缓存 → **持久化 SQL 缓存**（`data/cache.sqlite`），`@cached` / `cache_get_json` / `cache_put_json` 等公共 API 不变，重启不丢、TTL 自动过期；新增 `GET /api/cache`、`POST /api/cache/prune`、`POST /api/cache/clear` 管理端点

### 工程修复
- 前端严格类型检查清零（`tsc -b` 共 62 处错误修复），`build` 恢复为 `tsc -b && vite build`，可零类型错误产出 `dist/`
- `vite.config.ts` 设 `build.emptyOutDir: false` 规避沙箱写 `dist/` 限制

### 缺陷修复
- 修复「数据同步」面板（`.sync-panel`）被侧边栏裁切 / 压在导航卡片下方的 BUG：改用 React `createPortal` 将面板挂载到 `document.body`，脱离侧边栏的 `transform` / `overflow` 上下文；并将 `z-index` 提升为最高层（`2147483001`，高于命令面板的 `2147483000`），确保同步状态卡片始终浮在最上层、可见且不被任何卡片遮挡。

### 已知问题
- 网易云播放量接口已废弃，`play_count` 恒为 null
- 沙箱网络屏蔽 `music.163.com`，网易云工具在沙箱内返回降级提示

---

## 0.1.0-preview — 2026-08-10（预发布，已并入正式版）

初始预览版本，作为 0.1.0 正式版的前身，已包含：基础榜单（周榜 / 传说曲 / 年榜）、实时热度、歌曲库、P主 / 歌姬榜、歌曲对比、数据分析、公式试算、年度回顾、传说曲晋升时间线、AI 智能体（ReAct + 工具调用 + 联网搜索）、网易云音乐集成（自研 WeAPI 加密）、官方数据同步流水线。
