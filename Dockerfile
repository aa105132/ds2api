# DS2API Docker 镜像
# 采用极简、零侵入设计，所有配置通过环境变量传递
# 主代码更新时只需重新构建镜像，无需修改 Dockerfile

FROM node:20 AS webui-builder

WORKDIR /app/webui

COPY webui/package.json webui/package-lock.json ./
RUN npm ci

COPY webui ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

# 安装依赖（利用 Docker 缓存层）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制整个项目（保留原始目录结构）
COPY . .

# 拷贝 WebUI 构建产物（非 Vercel / Docker 部署可直接使用）
COPY --from=webui-builder /app/static/admin /app/static/admin

# 暴露服务端口
EXPOSE 5050

# 启动命令：使用 gunicorn + uvicorn worker（生产级部署）
# - UvicornWorker: 比单独 uvicorn 更健壮，能更好地处理来自代理的非标准 HTTP 请求
# - workers=1: 保持账号队列等内存状态一致性（ds2api 使用线程锁管理状态）
# - timeout=600: 支持长时间的流式对话（如 DeepSeek 思考模式）
# - graceful-timeout=30: 优雅停机等待时间
# 如需切回直接 uvicorn 模式，可改为: CMD ["python", "app.py"]
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:5050", \
     "--workers", "1", \
     "--timeout", "600", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
