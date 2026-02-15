# DS2API Docker 镜像
# 架构：nginx (反向代理, :5050) → gunicorn+uvicorn (应用服务器, :8000)
# nginx 负责正确缓冲请求体，解决 curl_cffi 等代理的兼容性问题

FROM node:20 AS webui-builder

WORKDIR /app/webui

COPY webui/package.json webui/package-lock.json ./
RUN npm ci

COPY webui ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

# 安装 nginx
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx && \
    rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（利用 Docker 缓存层）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制整个项目（保留原始目录结构）
COPY . .

# 拷贝 WebUI 构建产物（非 Vercel / Docker 部署可直接使用）
COPY --from=webui-builder /app/static/admin /app/static/admin

# 确保启动脚本有执行权限
RUN chmod +x /app/start.sh

# 暴露服务端口（nginx 监听）
EXPOSE 5050

# 启动命令：nginx + gunicorn（通过 start.sh 管理）
CMD ["/app/start.sh"]
