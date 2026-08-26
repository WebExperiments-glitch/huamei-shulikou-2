"""PyInstaller 打包入口：替代 `uvicorn app.main:app` CLI，供 Electron 直接启动。

用法（源码运行）：
    .venv\\Scripts\\python.exe run_backend.py [--port 8010] [--host 127.0.0.1]

打包后单 exe 运行时，由 Electron spawn 本入口的打包产物。
"""
import argparse
import os
import sys
from pathlib import Path

# 让 ``app`` 包可被 import（源码运行时：backend/ 目录在 sys.path；打包后自动在 _MEIPASS）
if getattr(sys, "frozen", False):  # PyInstaller 单可执行
    _HERE = Path(sys._MEIPASS)
else:
    _HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))


def main() -> int:
    p = argparse.ArgumentParser(description="huamei术力口 后端启动入口")
    p.add_argument("--host", default=os.environ.get("BACKEND_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("BACKEND_PORT", "8010")))
    args = p.parse_args()

    import uvicorn

    # 不开启 reload（Windows 下 reload 易崩，且打包态不支持 reload）
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())