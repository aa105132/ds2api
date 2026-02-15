#!/bin/bash
# DS2API 生产环境启动脚本
# 同时启动 nginx（反向代理）和 gunicorn（应用服务器）
# nginx :5050 → gunicorn :8000

set -e

echo "[DS2API] Starting services..."

# 启动 nginx（后台运行）
echo "[DS2API] Starting nginx on port 5050..."
nginx -c /app/nginx.conf -g "daemon on;"

# 启动 gunicorn + uvicorn worker（前台运行，作为主进程）
echo "[DS2API] Starting gunicorn on port 8000..."
exec gunicorn \
    -k uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --workers 1 \
    --timeout 600 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile - \
    app:app