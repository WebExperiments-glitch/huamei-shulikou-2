# huamei术力口 · iOS / iPadOS（原生 SwiftUI）

> 与 Web 端同源的 VOOCALOID 周榜客户端。**原生 SwiftUI + iOS 26 液态玻璃（Liquid Glass）**，品牌视觉对齐 Web 端（蓝紫强调色 #3B63D9 / #7B96F0）。

## 技术栈

| 项 | 选择 |
|---|---|
| 语言 / UI | Swift 5 语言模式（Swift 6 工具链）· SwiftUI |
| 最低系统 | iOS 26.0 / iPadOS 26.0 |
| 设计语言 | 原生 Liquid Glass（`.glassEffect` / `GlassEffectContainer`）+ 品牌定制 |
| 工程生成 | XcodeGen（`project.yml` → `.xcodeproj`，Windows/Linux 可生成） |
| 构建方式 | **ios-builder**（GitHub Actions macOS runner 云端编译，无需 Mac） |
| 数据 | 内置只读快照（离线可用）+ 可配置远程 FastAPI（实时 / AI / 网易云） |

## 目录结构

```
ios/
├── project.yml                # XcodeGen 工程定义（CI 用 xcodegen generate 生成）
├── builder.json               # ios-builder 配置（WebExperiments-glitch/huamei-shulikou-2）
├── tools/export_snapshot.py   # 后端 → 离线快照生成脚本
└── HuameiApp/
    ├── App.swift              # 入口：注入 Settings/收藏/数据仓库
    ├── Theme/                 # AppTheme（品牌色）+ GlassSurface（液态玻璃封装）
    ├── Models/Board.swift     # BoardType / BoardIssue / RankEntry / SnapshotData
    ├── Networking/            # APIClient（URLSession async/await）+ SnapshotLoader/仓库
    ├── Stores/                # SettingsStore / FavoritesStore（@Observable）
    ├── Views/                 # 自适应根（TabView↔NavigationSplitView）+ 榜单流程 + 设置/收藏
    └── Assets.xcassets/       # App 图标 / AccentColor
```

## 在 Windows 上构建 IPA（零 Mac）

前提：本仓库已 push 到 GitHub（`WebExperiments-glitch/huamei-shulikou-2`）。

```bash
# 1. 鉴权 GitHub
builder auth github

# 2. 生成工程并注入 CI 工作流（builder 会加 .github/workflows/ios-build.yml，XcodeGen 生成 .xcodeproj 在 CI 内完成）
builder init

# 3. 触发云构建并下载 IPA 到 ./dist/
builder ios build
```

> 说明：工程用 XcodeGen 管理 `.xcodeproj`（不提交二进制工程文件）。若 CI 的 workflow 未先执行
> `xcodegen generate`，可在 `ios-build.yml` 的 build 步骤前加 `brew install xcodegen && cd ios && xcodegen generate`，
> 或把生成的 `.xcodeproj` 一并提交（本项目为可移植性默认不提交）。

## 签名 / 安装（IPA）

- `builder signing csr` → 开发者门户申请证书 → `builder signing p12` 组装钱包文件 → `builder signing setup` 上传到仓库 Secrets（无需 Mac）
- iOS 构建产物可直接装到来设备：**爱思助手**、**SideStore 自动续签**（参考根目录 `苹果ipa签证/Windows强行编译iOS_铺垫调研.md`）
- 免费 Apple ID 侧载签名 7 天过期，付费开发者账号 1 年

## 更新离线快照

后端在 `127.0.0.1:8010` 运行时，从仓库根执行：

```bash
python ios/tools/export_snapshot.py --issues 8
```

重新 push 后云构建即携带最新内置数据。

## 功能状态

- [x] 核心骨架：主题 / 数据层 / 自适应导航 / 周榜·传说曲·年榜浏览 / 收藏 / 设置（远程连接测试）
- [ ] 歌曲库与详情 / Hot 实时热度 / 预测 / 对比 / AI 智能体（SSE）/ 网易云 —— 后续迭代
- [ ] 月度 / 年度回顾 / 传説曲线时间线（Web 端对应页）

## License

与 Web 端一致：CC BY-NC 4.0。