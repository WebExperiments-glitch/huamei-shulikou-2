import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

# 官方 biliboard 数据源（只读）。默认相对推算到仓库外的同级目录；
# 开源部署时请通过环境变量 SOURCE_DB 指向你本地的 biliboard 数据库文件。
SOURCE_DB = Path(
    os.environ.get(
        "SOURCE_DB",
        str(BASE_DIR.parent / "biliboard-database" / "表格写入sqlite" / "biliboard (11).db"),
    )
)

DAILY_DB = DATA_DIR / "daily.sqlite"
MONTHLY_DB = DATA_DIR / "monthly.sqlite"
HOT_DB = DATA_DIR / "hot.sqlite"
TRANSLATE_DB = DATA_DIR / "translate.sqlite"
AGENT_DB = DATA_DIR / "agent.sqlite"

APP_NAME = "huamei术力口"
APP_VERSION = "0.1.0"

# 安全相关：允许跨域的前端源；生产可经环境变量 CORS_ORIGINS 收紧（逗号/分号分隔）。
def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "")
    if raw:
        return [o.strip() for o in raw.replace(";", ",").split(",") if o.strip()]
    # 本地开发默认值
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ]


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)