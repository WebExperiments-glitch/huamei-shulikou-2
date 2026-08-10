@echo off
chcp 65001 >nul
cd /d %~dp0
echo 同步官方最新榜单...
"backend\.venv\Scripts\python.exe" scripts\sync_official.py --all
echo 重建月榜/日榜...
"backend\.venv\Scripts\python.exe" scripts\build_daily.py
"backend\.venv\Scripts\python.exe" scripts\build_monthly.py
pause