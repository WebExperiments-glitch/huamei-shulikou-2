@echo off
rem 启动 huamei术力口 后端（监听 0.0.0.0，供 iPad/局域网访问）
rem iPad 端在 App「设置」填：http://本机IP:8010（本机 IP 可用 ipconfig 查看，常见如 192.168.x.x）
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010