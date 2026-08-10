@echo off
chcp 65001 >nul
cd /d %~dp0backend
echo [1/2] 构建月榜/日榜数据...
".venv\Scripts\python.exe" ..\scripts\build_daily.py
".venv\Scripts\python.exe" ..\scripts\build_monthly.py
echo [2/2] 启动后端 (http://127.0.0.1:8010) ...
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
pause