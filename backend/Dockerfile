FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
ENV UV_HTTP_TIMEOUT=120
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

# named volume for the FITS/PNG cache; Docker seeds an empty volume with this
# ownership, so the non-root user can write to it on first run
RUN mkdir -p /app/storage/fits_raw /app/storage/png_renders \
    && chown -R 1000:1000 /app/storage

ENV HOME=/tmp UV_CACHE_DIR=/tmp/uv-cache
USER 1000:1000

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
