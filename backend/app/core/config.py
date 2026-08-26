import os
import sys
from pathlib import Path


# 运行基准目录：
#  - 源码态（uvicorn/python）：仓库根（backend/app/core/config.py → parents[3]）
#  - 打包态（PyInstaller 单 exe）：可执行文件所在目录。
#    关键：不能再用 Path(__file__) 推导——打包后 __file__ 指向临时解压目录 _MEIPASS，
#    既不可写（自建 sqlite 会失败）也会随进程退出销毁（数据丢失）。
def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[3]


BASE_DIR = _base_dir()
DOCS_DIR = BASE_DIR / "docs"

# 可写运行数据目录（自建库/日志等）：
#  - 源码态：仓库根下 data/
#  - 打包态：用户目录 %APPDATA%\huameishulikou\data。不与安装目录绑定 —— 否则装进
#    Program Files 等受保护位置时会无写权限；同事放该位置可随杀软/权限策略遭殃。
def _data_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = os.environ.get("APPDATA") or str(
            Path.home() / "AppData" / "Roaming"
        )
        return Path(base) / "huameishulikou" / "data"
    return BASE_DIR / "data"


DATA_DIR = _data_dir()

# 官方 biliboard 数据源（只读）。默认：
#  - 优先读环境变量 SOURCE_DB（部署/调试注入）。
#  - 打包态：读 exe 同级 data/biliboard.db（安装包随 extraResources 内置并分发的一份快照）。
#  - 源码态：回退到开发仓库的真源库。
def _source_db() -> Path:
    env = os.environ.get("SOURCE_DB")
    if env:
        return Path(env)
    if getattr(sys, "frozen", False):
        return BASE_DIR / "data" / "biliboard.db"
    return (
        Path(__file__).resolve().parents[3].parent
        / "biliboard-database"
        / "表格写入sqlite"
        / "biliboard (11).db"
    )


SOURCE_DB = _source_db()

DAILY_DB = DATA_DIR / "daily.sqlite"
MONTHLY_DB = DATA_DIR / "monthly.sqlite"
HOT_DB = DATA_DIR / "hot.sqlite"
TRANSLATE_DB = DATA_DIR / "translate.sqlite"
AGENT_DB = DATA_DIR / "agent.sqlite"
CACHE_DB = DATA_DIR / "cache.sqlite"

APP_NAME = "huamei术力口"
APP_VERSION = "0.2.0.1-rc2"

# Playwright 浏览器（StealthyFetcher 全隐身抓取所需 Chromium，headless）：
#  - 打包态：随安装包放在 exe 同级 .playwright-browsers（extraResources 内置下发）
#  - 源码态：项目 backend 下的 .playwright-browsers
# 必须在任何浏览器启动前设置该环境变量。
def _playwright_browsers() -> Path:
    if getattr(sys, "frozen", False):
        return BASE_DIR / ".playwright-browsers"
    return BASE_DIR / "backend" / ".playwright-browsers"


PLAYWRIGHT_BROWSERS = _playwright_browsers()
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(PLAYWRIGHT_BROWSERS))

# 安全相关：允许跨域的前端源；生产可经环境变量 CORS_ORIGINS 收紧（逗号/分号分隔）。
def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.replace(";", ",").split(",") if o.strip()]
    # 本地开发默认值。追加 Electron 桌面态的 origin：
    #  - "null"：桌面版以 file:// 加载前端时 origin 为字符串 "null"
    #  - "app://bundle"：桌面版经自定义 app:// 协议加载时 origin 为 "app://bundle"
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "null",
        "app://bundle",
    ]


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)