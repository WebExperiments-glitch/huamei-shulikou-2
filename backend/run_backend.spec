# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec：打包 huamei术力口 后端为单文件 exe
#
# 使用：
#   .venv\Scripts\python.exe -m PyInstaller run_backend.spec --noconfirm
#
# 说明：
#   - onefile 模式：Electron 可直接 spawn 单 exe
#   - 收集 scrapling（含 fetchers）与 playwright，确保 import 期可用
#   - 收集 tokenizer 资源（config 中 TOKENIZER 路径 backend/assets/deepseek_tokenizer）

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# scrapling：含动态/子模块与数据文件
# scrapling：editable 安装（Scrapling-0.4.12），PyInstaller 常收集不到，
# 需把其源码目录显式加入 paths，并在 hiddenimports 里补全 fetchers/引擎子模块。
SCRAPLING_ROOT = r"D:\DeepSeek前端代码\前端\未确定\术力口周榜\术力口\Scrapling-0.4.12"
scrapling_hidden = collect_submodules("scrapling")
scrapling_data = collect_data_files("scrapling")
scrapling_extra_hidden = [
    "scrapling.fetchers",
    "scrapling.fetchers.requests",
    "scrapling.fetchers.chrome",
    "scrapling.fetchers.stealth_chrome",
    "scrapling.engines",
    "scrapling.engines.static",
    "scrapling.engines.dynamic",
    "scrapling.engines._browsers",
    "scrapling.parser",
    "scrapling.core",
]

# playwright：子模块（浏览器 binary 较大，单独由 run 时按需，此处收集 python 包）
playwright_hidden = collect_submodules("playwright")

# scrapling 依赖链的数据文件：browserforge / apify_fingerprint_datapoints 含运行时 zip/json
# （不收集则打包后 exe 报 FileNotFoundError: apify_fingerprint_datapoints/.../input-network-definition.zip）
forge_data = (
    collect_data_files("browserforge")
    + collect_data_files("apify_fingerprint_datapoints")
)

block_cipher = None

a = Analysis(
    ["run_backend.py"],
    pathex=[SCRAPLING_ROOT],
    binaries=[],
    datas=scrapling_data + forge_data + [
        ("assets/deepseek_tokenizer/tokenizer.json", "assets/deepseek_tokenizer"),
        ("assets/deepseek_tokenizer/tokenizer_config.json", "assets/deepseek_tokenizer"),
    ],
    hiddenimports=scrapling_hidden + scrapling_extra_hidden + playwright_hidden + [
        "browserforge",
        "browserforge.headers",
        "browserforge.fingerprint",
        "apify_fingerprint_datapoints",
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
        "multipart",
        "app.main",
        "app.api.sync",
        "app.api.hot",
        "app.services.crawler",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tests", "_probe", "_probe2", "_verify_t"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="huamei_backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # 保留控制台以显示后端日志（调试期）
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)