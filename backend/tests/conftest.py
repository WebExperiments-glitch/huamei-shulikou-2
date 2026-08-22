"""pytest 冒烟测试：确保后端可导入、核心端点可达、关键纯函数行为正确。

运行（backend 目录下）：
    .venv\\Scripts\\python.exe -m pytest tests -q
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
