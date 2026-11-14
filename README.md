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
| `GET /combine?mode=diff\|coadd\|stack&urls=...` | epoch subtraction / stacking / band sums → PNG |
| `GET /rgb?r&g&b` | three bands → false-colour composite |
| `GET /photometry?ra&dec&urls=...` | aperture medians across band files |
| `GET /flags?url=...` | FLAGS bit counts + VARIANCE summary |

## Curl examples

```bash
curl localhost:8000/health
curl localhost:8000/targets
curl "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05"

URL=$(curl -s "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05" \
  | jq -r '.exposures[0].bands[0].url')
curl --get --data-urlencode "url=$URL" localhost:8000/render

# epoch N - N-1 of the same detector array (motion dipoles)
URL2=$(curl -s "localhost:8000/frames?ra=269.452&dec=4.693&radius=0.05" \
  | jq -r '.exposures[1].bands[0].url')
curl -G localhost:8000/combine --data-urlencode "mode=diff" \
  --data-urlencode "urls=$URL,$URL2"

# aperture photometry at the target position
curl -G localhost:8000/photometry --data-urlencode "ra=269.452" \
  --data-urlencode "dec=4.693" --data-urlencode "urls=$URL,$URL2"
```

## Config

Copy `.env.example` and adjust: `DATABASE_URL`, `STORAGE_DIR`, `CORS_ORIGINS`.

## Accounts and discoveries

Register with `POST /register` and log in with `POST /login`, using JSON
`{"username":"observer", "password":"at-least-8-characters"}`. Login returns a
bearer token valid for seven days. Send it in `Authorization: Bearer <token>`
to use `GET /me`, `POST /logout`, and `POST /discoveries`. A discovery accepts
JSON such as `{"name":"New world", "ra":12.3, "dec":-4.5}`. Anyone can
read `GET /discoveries`. The first claim within one arcsecond wins.

To reset the database, stop the API first. For local SQLite, remove
`backend/storage/app.db` and restart the API. For Docker, run
`docker compose down -v` and then `docker compose up`. These commands delete
all database records; startup recreates the tables and preset targets.
