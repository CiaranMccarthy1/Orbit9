# Planet X — SPHEREx Explorer

Interactive viewer for NASA/IPAC IRSA SPHEREx sky data.

## Run

### Docker (recommended)

First build (host network avoids a container-DNS timeout on PyPI):

```bash
sudo docker build --network host --allow network.host -t orbit9-api ./backend
```

Then run:

```bash
sudo docker compose up
```

API: http://localhost:8000 · docs: http://localhost:8000/docs

### Local dev (no Docker)

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Uses SQLite in `backend/storage/` by default.

## Endpoints

| Path | What it does |
|---|---|
| `GET /targets` | preset sky targets |
| `GET /frames?ra&dec&radius` | observation epochs covering a position |
| `GET /render?url=...` | IRSA SPHEREx FITS → stretched PNG |
| `GET /health` | liveness |

## Config

Copy `.env.example` and adjust: `DATABASE_URL`, `STORAGE_DIR`, `CORS_ORIGINS`.
