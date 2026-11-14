FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app

COPY pyproject.toml uv.lock ./
ENV UV_HTTP_TIMEOUT=120
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

# non-root so bind-mounted storage/ stays owned by the host user
ENV HOME=/tmp UV_CACHE_DIR=/tmp/uv-cache
USER 1000:1000

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
